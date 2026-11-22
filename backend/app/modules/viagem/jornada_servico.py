"""Regras da jornada: o motorista inicia e conclui todas as rotas do turno e sentido de uma vez.

Uma rota é motorista + instituição + turno, então o motorista que leva alunos para três
faculdades à noite tem três viagens de ida. Na rua é um trajeto só: ele sai, busca todo mundo
na ordem de embarque e passa pelas faculdades. A jornada junta essas viagens.
"""

from app.config.erros import ConflitoDeDados, RecursoNaoEncontrado
from app.modules.viagem.jornada_schema import ChamadaDaJornada, JornadaPedido, JornadaResposta
from app.modules.viagem.viagem_model import Viagem
from app.modules.viagem.viagem_schema import ChamadaResposta, ContagemPassageiros, Referencia, ViagemResposta
from app.modules.viagem import viagem_servico
from app.modules.viagem.viagem_servico import ServicoViagem
from app.shared.enums import StatusChamada, StatusViagem


def fase_da_jornada(status: str, fila: list) -> str:
    """Em andamento, a jornada tem duas fases: embarque (ainda há passageiro pendente) e
    a caminho (todos registrados; faltam os desembarques nos destinos)."""
    if status != "em_andamento":
        return status
    return "embarque" if any(c.status == StatusChamada.PENDENTE for c in fila) else "a_caminho"


def status_da_jornada(viagens: list[Viagem]) -> str:
    """Em andamento se alguma rota está; cancelada se todas foram; concluída se não sobrou nenhuma por fazer."""
    situacoes = {v.status for v in viagens}
    if StatusViagem.EM_ANDAMENTO in situacoes:
        return "em_andamento"
    if situacoes == {StatusViagem.CANCELADA}:
        return "cancelada"
    if StatusViagem.AGENDADA not in situacoes:
        return "concluida"
    return "agendada"


class ServicoJornada:
    def __init__(self, servico_viagem: ServicoViagem):
        self.servico_viagem = servico_viagem
        self.repositorio = servico_viagem.repositorio

    def obter(self, pedido: JornadaPedido) -> JornadaResposta:
        viagens = self._viagens(pedido)
        detalhes = [self.servico_viagem.obter(v.id, com_chamadas=True) for v in viagens]

        fila: list[ChamadaDaJornada] = []
        contagem = ContagemPassageiros()
        for viagem in detalhes:
            for campo in ("total", "pendente", "presente", "ausente", "nao_vai"):
                setattr(contagem, campo, getattr(contagem, campo) + getattr(viagem.passageiros, campo))
            if viagem.status == StatusViagem.CANCELADA:
                continue
            for chamada in viagem.chamadas:
                if chamada.status == StatusChamada.NAO_VAI:
                    continue  # avisou antes: nem entra no embarque
                fila.append(
                    ChamadaDaJornada(
                        **ChamadaResposta.model_validate(chamada).model_dump(),
                        fk_viagem=viagem.id,
                        instituicao=Referencia.model_validate(viagem.rota.instituicao),
                    )
                )
        # Uma fila só, na ordem de embarque; sem horário vai para o fim; empate: faculdade e nome.
        fila.sort(
            key=lambda c: (c.horario_previsto is None, c.horario_previsto or "", c.instituicao.nome, c.estudante.nome)
        )

        ativas = [v for v in detalhes if v.status != StatusViagem.CANCELADA]
        saidas = [v.horario_saida for v in ativas if v.horario_saida]
        chegadas = [v.horario_chegada for v in ativas if v.horario_chegada]
        previstos = [v.horario_previsto for v in ativas if v.horario_previsto]
        status = status_da_jornada(detalhes)
        casa = detalhes[0].motorista.endereco
        partida = (
            [float(casa.latitude), float(casa.longitude)]
            if casa is not None and casa.latitude is not None and casa.longitude is not None
            else None
        )
        return JornadaResposta(
            partida=partida,
            data=pedido.data,
            turno=pedido.turno,
            sentido=pedido.sentido,
            motorista=Referencia.model_validate(detalhes[0].motorista),
            status=status,
            fase=fase_da_jornada(status, fila),
            horario_previsto=min(previstos) if previstos else None,
            horario_saida=min(saidas) if saidas else None,
            horario_chegada=max(chegadas) if chegadas and status == "concluida" else None,
            viagens=[ViagemResposta.model_validate(v) for v in detalhes],
            passageiros=contagem,
            fila=fila,
        )

    def iniciar(self, pedido: JornadaPedido) -> JornadaResposta:
        """Inicia todas as rotas agendadas da jornada com o mesmo horário de saída."""
        agendadas = [v for v in self._viagens(pedido) if v.status == StatusViagem.AGENDADA]
        if not agendadas:
            raise ConflitoDeDados("Não há rota agendada para iniciar nesta jornada.")
        momento = viagem_servico.agora()
        if pedido.data > momento.date():
            raise ConflitoDeDados("Esta jornada é de um dia que ainda não chegou.")
        for viagem in agendadas:
            viagem.status = StatusViagem.EM_ANDAMENTO
            viagem.horario_saida = momento
            self.repositorio.salvar(viagem)
        return self.obter(pedido)

    def concluir(self, pedido: JornadaPedido) -> JornadaResposta:
        """Conclui todas as rotas em andamento; quem ficou pendente vira ausente."""
        em_andamento = [v for v in self._viagens(pedido) if v.status == StatusViagem.EM_ANDAMENTO]
        if not em_andamento:
            raise ConflitoDeDados("A jornada não está em andamento.")
        momento = viagem_servico.agora()
        for viagem in em_andamento:
            self.repositorio.concluir(viagem.id, momento)
        return self.obter(pedido)

    def _viagens(self, pedido: JornadaPedido) -> list[Viagem]:
        viagens = [
            v
            for v in self.repositorio.listar(data=pedido.data, turno=pedido.turno, fk_motorista=pedido.fk_motorista)
            if v.sentido == pedido.sentido
        ]
        if not viagens:
            raise RecursoNaoEncontrado("Nenhuma viagem deste motorista neste dia, turno e sentido.")
        return viagens

