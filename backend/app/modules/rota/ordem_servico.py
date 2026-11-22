"""Ordem das paradas de um motorista num turno: a atual, a sugerida (otimizada) e aplicar uma.

A "jornada" de ida do motorista no turno: sai de casa (endereço do motorista), busca cada
passageiro de todas as rotas dele no turno e deixa cada um na parada da faculdade dele.

Aplicar uma ordem grava o horário de embarque de cada passageiro (estudante.horario_embarque),
calculado pelos tempos de trajeto a partir da saída da rota. Como a fila de embarque das viagens
segue esse horário, a nova ordem vale na hora para as viagens ainda não iniciadas.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config.erros import DadosInvalidos, RecursoNaoEncontrado
from app.modules.estudante.estudante_model import Estudante
from app.modules.instituicao.instituicao_model import Instituicao
from app.modules.motorista.motorista_model import Motorista
from app.modules.rota import otimizacao
from app.modules.rota.ordem_schema import OrdemResposta, ParadaDaOrdem, PartidaDaOrdem, SemLocalizacao, Sequencia
from app.modules.rota.rota_model import Rota
from app.modules.rota.rota_repositorio import passageiros_da_rota
from app.shared.enums import StatusCadastro, Turno

# Tempo parado em cada embarque (o passageiro sai de casa e entra na van).
SEGUNDOS_POR_EMBARQUE = 60


@dataclass
class _Ponto:
    tipo: str  # "partida", "passageiro" ou "faculdade"
    nome: str
    detalhe: str
    coordenada: tuple[float, float]
    estudante: Estudante | None = None
    instituicao: str | None = None
    passageiros: list[int] = field(default_factory=list)


def _endereco_curto(estudante: Estudante) -> str:
    e = estudante.endereco
    return f"{e.logradouro}{', ' + e.numero if e.numero else ''} · {e.bairro}"


def _ponto_da_faculdade(instituicao: Instituicao) -> tuple[float, float] | None:
    if instituicao.parada_latitude is not None and instituicao.parada_longitude is not None:
        return float(instituicao.parada_latitude), float(instituicao.parada_longitude)
    if instituicao.endereco.latitude is not None and instituicao.endereco.longitude is not None:
        return float(instituicao.endereco.latitude), float(instituicao.endereco.longitude)
    return None


class ServicoOrdem:
    def __init__(self, sessao: Session, url_osrm: str | None):
        self.sessao = sessao
        self.url_osrm = url_osrm

    # ------------------------------------------------------------------ consultas

    def calcular(self, fk_motorista: int, turno: Turno) -> OrdemResposta:
        """Ordem atual (pelo horário de embarque gravado) e a sugerida (otimizada)."""
        dados = self._dados(fk_motorista, turno)
        atual = [e.id for e in dados["passageiros"]]
        sugerida = self._otimizar(dados)
        return self._resposta(dados, atual, sugerida)

    def simular(self, fk_motorista: int, turno: Turno, ordem: list[int]) -> OrdemResposta:
        """Horários, km e minutos de uma ordem escolhida à mão (sem gravar)."""
        dados = self._dados(fk_motorista, turno)
        self._garantir_ordem_completa(dados, ordem)
        atual = [e.id for e in dados["passageiros"]]
        return self._resposta(dados, atual, ordem)

    def aplicar(self, fk_motorista: int, turno: Turno, ordem: list[int]) -> OrdemResposta:
        """Grava a ordem: cada passageiro recebe o horário de embarque calculado."""
        dados = self._dados(fk_motorista, turno)
        self._garantir_ordem_completa(dados, ordem)
        if dados["saida"] is None:
            raise DadosInvalidos("Defina o horário de ida das rotas deste turno antes de aplicar a ordem.")
        sequencia = self._sequencia(dados, ordem)
        por_id = {e.id: e for e in dados["passageiros"]}
        for parada in sequencia.paradas:
            if parada.fk_estudante is not None and parada.horario is not None:
                por_id[parada.fk_estudante].horario_embarque = parada.horario
        try:
            self.sessao.commit()
        except Exception:
            self.sessao.rollback()
            raise
        return self.calcular(fk_motorista, turno)

    # ------------------------------------------------------------------ dados

    def _dados(self, fk_motorista: int, turno: Turno) -> dict:
        motorista = self.sessao.get(Motorista, fk_motorista, options=[joinedload(Motorista.endereco)])
        if motorista is None:
            raise RecursoNaoEncontrado("Motorista não encontrado.")
        rotas = list(
            self.sessao.scalars(
                select(Rota)
                .options(joinedload(Rota.instituicao).joinedload(Instituicao.endereco))
                .where(Rota.fk_motorista == fk_motorista, Rota.turno == turno, Rota.status == StatusCadastro.ATIVO)
            ).unique()
        )
        if not rotas:
            raise RecursoNaoEncontrado("Este motorista não tem rota ativa neste turno.")
        linhas = self.sessao.execute(
            passageiros_da_rota()
            .where(Rota.id.in_([r.id for r in rotas]))
            .options(
                joinedload(Estudante.endereco),
                joinedload(Estudante.parada),
                joinedload(Estudante.instituicao).joinedload(Instituicao.endereco),
            )
            .order_by(Estudante.horario_embarque.is_(None), Estudante.horario_embarque, Estudante.nome)
        ).unique().all()
        todos = list(dict.fromkeys(e for _, e in linhas))
        com_local = [e for e in todos if e.endereco.latitude is not None and e.endereco.longitude is not None]
        sem_local = [e for e in todos if e not in com_local]

        endereco = motorista.endereco
        partida = None
        if endereco is not None and endereco.latitude is not None and endereco.longitude is not None:
            partida = _Ponto(
                "partida",
                "Saída",
                f"{endereco.logradouro}{', ' + endereco.numero if endereco.numero else ''} · {endereco.bairro}",
                (float(endereco.latitude), float(endereco.longitude)),
            )
        horarios = [r.horario_ida for r in rotas if r.horario_ida is not None]
        avisos = []
        if partida is None:
            avisos.append("O motorista não tem endereço com localização: o cálculo começa no primeiro passageiro.")
        if sem_local:
            avisos.append(f"{len(sem_local)} passageiro(s) sem localização no mapa ficam fora do cálculo.")
        return {
            "motorista": motorista,
            "turno": turno,
            "rotas": rotas,
            "passageiros": com_local,
            "sem_local": sem_local,
            "partida": partida,
            "saida": min(horarios) if horarios else None,
            "avisos": avisos,
        }

    @staticmethod
    def _garantir_ordem_completa(dados: dict, ordem: list[int]) -> None:
        esperados = {e.id for e in dados["passageiros"]}
        if len(ordem) != len(set(ordem)) or set(ordem) != esperados:
            raise DadosInvalidos("A ordem precisa ter cada passageiro da rota uma vez (sem faltar nenhum).")

    # ------------------------------------------------------------------ cálculo

    def _pontos(self, dados: dict) -> tuple[list[_Ponto], dict[int, int], dict[int, int]]:
        """Pontos da matriz: [partida?] + casas + paradas das faculdades (uma por parada usada)."""
        pontos: list[_Ponto] = []
        if dados["partida"] is not None:
            pontos.append(dados["partida"])
        casa: dict[int, int] = {}
        destino_do: dict[int, int] = {}
        paradas: dict[tuple, int] = {}
        for e in dados["passageiros"]:
            casa[e.id] = len(pontos)
            pontos.append(
                _Ponto(
                    "passageiro",
                    e.apelido or e.nome,
                    _endereco_curto(e),
                    (float(e.endereco.latitude), float(e.endereco.longitude)),
                    estudante=e,
                    instituicao=e.instituicao.nome,
                )
            )
        for e in dados["passageiros"]:
            if e.parada is not None:
                chave = ("extra", e.parada.id)
                coordenada = (float(e.parada.latitude), float(e.parada.longitude))
                nome = f"{e.instituicao.nome} · {e.parada.nome}"
            else:
                chave = ("principal", e.fk_instituicao)
                coordenada = _ponto_da_faculdade(e.instituicao)
                nome = e.instituicao.nome
            if coordenada is None:
                continue
            if chave not in paradas:
                paradas[chave] = len(pontos)
                pontos.append(_Ponto("faculdade", nome, "", coordenada, instituicao=e.instituicao.nome))
            destino_do[e.id] = paradas[chave]
            pontos[paradas[chave]].passageiros.append(e.id)
        return pontos, casa, destino_do

    def _otimizar(self, dados: dict) -> list[int]:
        if not dados["passageiros"]:
            return []
        pontos, casa, destino_do = self._pontos(dados)
        tempos, _, _ = otimizacao.matriz_de_tempos([p.coordenada for p in pontos], self.url_osrm)
        custo = lambda a, b: tempos[a][b]  # noqa: E731
        inicio = 0 if dados["partida"] is not None else None
        coletas = list(casa.values())
        destinos = list(dict.fromkeys(destino_do.values()))
        if not destinos:
            ordem = otimizacao.melhor_caminho(coletas, custo, inicio=inicio)
        else:
            # Testa cada parada como a primeira a ser atendida e fica com o menor tempo total.
            melhor_total, ordem = None, coletas
            for primeira in destinos:
                candidata = otimizacao.melhor_caminho(coletas, custo, inicio=inicio, fim=primeira)
                resto = otimizacao.melhor_caminho([d for d in destinos if d != primeira], custo, inicio=primeira)
                caminho = ([inicio] if inicio is not None else []) + candidata + [primeira] + resto
                total = otimizacao.custo_do_caminho(caminho, custo)
                if melhor_total is None or total < melhor_total:
                    melhor_total, ordem = total, candidata
        por_indice = {indice: id_estudante for id_estudante, indice in casa.items()}
        return [por_indice[i] for i in ordem]

    def _sequencia(self, dados: dict, ordem: list[int]) -> Sequencia:
        """Paradas na ordem dada (casas) seguidas das faculdades, com horários e totais."""
        pontos, casa, destino_do = self._pontos(dados)
        tempos, km, _ = otimizacao.matriz_de_tempos([p.coordenada for p in pontos], self.url_osrm)
        coletas = [casa[i] for i in ordem]
        destinos = list(dict.fromkeys(destino_do[i] for i in ordem if i in destino_do))
        if coletas and destinos:
            destinos = otimizacao.melhor_caminho(destinos, lambda a, b: tempos[a][b], inicio=coletas[-1])
        caminho = ([0] if dados["partida"] is not None else []) + coletas + destinos

        saida: time | None = dados["saida"]
        relogio = datetime.combine(datetime.today(), saida) if saida else None
        paradas: list[ParadaDaOrdem] = []
        segundos = distancia = 0.0
        for posicao, indice in enumerate(caminho):
            if posicao > 0:
                anterior = caminho[posicao - 1]
                segundos += tempos[anterior][indice]
                distancia += km[anterior][indice]
                if relogio is not None:
                    relogio += timedelta(seconds=tempos[anterior][indice])
            ponto = pontos[indice]
            if ponto.tipo == "partida":
                continue
            horario = None
            if relogio is not None:
                arredondado = relogio + timedelta(seconds=30)
                horario = time(arredondado.hour, arredondado.minute)
            paradas.append(
                ParadaDaOrdem(
                    tipo=ponto.tipo,
                    fk_estudante=ponto.estudante.id if ponto.estudante else None,
                    nome=ponto.nome,
                    detalhe=ponto.detalhe or f"{len(ponto.passageiros)} passageiro(s) descem aqui",
                    instituicao=ponto.instituicao,
                    latitude=ponto.coordenada[0],
                    longitude=ponto.coordenada[1],
                    horario=horario,
                    horario_atual=ponto.estudante.horario_embarque if ponto.estudante else None,
                )
            )
            if ponto.tipo == "passageiro":
                segundos += SEGUNDOS_POR_EMBARQUE
                if relogio is not None:
                    relogio += timedelta(seconds=SEGUNDOS_POR_EMBARQUE)
        chegada = paradas[-1].horario if paradas and paradas[-1].tipo == "faculdade" else None
        return Sequencia(
            paradas=paradas, distancia_km=round(distancia, 1), duracao_min=round(segundos / 60), chegada=chegada
        )

    def _resposta(self, dados: dict, atual: list[int], sugerida: list[int]) -> OrdemResposta:
        pontos, _, _ = self._pontos(dados)
        _, _, real = otimizacao.matriz_de_tempos([p.coordenada for p in pontos], self.url_osrm)
        partida = dados["partida"]
        seq_atual = self._sequencia(dados, atual)
        seq_sugerida = self._sequencia(dados, sugerida)
        motorista = dados["motorista"]
        return OrdemResposta(
            motorista={"id": motorista.id, "nome": motorista.nome},
            turno=dados["turno"],
            partida=PartidaDaOrdem(
                endereco=partida.detalhe, latitude=partida.coordenada[0], longitude=partida.coordenada[1]
            )
            if partida
            else None,
            horario_saida=dados["saida"],
            pelas_ruas=real,
            atual=seq_atual,
            sugerida=seq_sugerida,
            economia_min=max(0, seq_atual.duracao_min - seq_sugerida.duracao_min),
            sem_localizacao=[SemLocalizacao(id=e.id, nome=e.nome) for e in dados["sem_local"]],
            avisos=dados["avisos"],
        )
