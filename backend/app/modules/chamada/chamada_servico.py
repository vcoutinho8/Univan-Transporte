"""Regras da chamada (aviso prévio): o passageiro avisa que não vai, e sai da fila do motorista.

O aviso vale até a viagem acabar. Avisos com menos de 1 hora do horário previsto são aceitos,
mas marcados como "de última hora" (a regra da rotina avisar_nao_vou é de 1 hora de antecedência).
"""

from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config.erros import ConflitoDeDados, RecursoNaoEncontrado
from app.modules.chamada.chamada_model import Chamada
from app.modules.chamada.chamada_schema import (
    AvisoPedido,
    ChamadasDoDia,
    PassageiroDaChamada,
    PassageiroDoDia,
    Referencia,
    ResumoChamadas,
    SituacaoNoSentido,
)
from app.modules.estudante.estudante_model import Estudante
from app.modules.rota.rota_model import Rota
from app.modules.viagem import viagem_servico
from app.modules.viagem.viagem_model import Viagem
from app.shared.enums import Sentido, StatusChamada, StatusViagem, Turno

ANTECEDENCIA = timedelta(hours=1)


def aviso_tardio(chamada: Chamada, dia: date) -> bool:
    """Avisou "não vou" com menos de 1 hora do horário previsto."""
    if chamada.status != StatusChamada.NAO_VAI or not chamada.horario_aviso or not chamada.horario_previsto:
        return False
    return chamada.horario_aviso > datetime.combine(dia, chamada.horario_previsto) - ANTECEDENCIA


class ServicoChamada:
    def __init__(self, sessao: Session):
        self.sessao = sessao

    def _chamadas(self, dia: date, turno: Turno | None = None, fk_estudante: int | None = None) -> list[Chamada]:
        consulta = (
            select(Chamada)
            .join(Viagem, Viagem.id == Chamada.fk_viagem)
            .join(Rota, Rota.id == Viagem.fk_rota)
            .options(
                joinedload(Chamada.estudante).joinedload(Estudante.endereco),
                joinedload(Chamada.viagem).joinedload(Viagem.rota).joinedload(Rota.instituicao),
                joinedload(Chamada.viagem).joinedload(Viagem.motorista),
            )
            .where(Viagem.data == dia, Viagem.status != StatusViagem.CANCELADA)
        )
        if turno is not None:
            consulta = consulta.where(Rota.turno == turno)
        if fk_estudante is not None:
            consulta = consulta.where(Chamada.fk_estudante == fk_estudante)
        return list(self.sessao.scalars(consulta).unique())

    def do_dia(self, dia: date, turno: Turno | None = None) -> ChamadasDoDia:
        """Passageiros esperados no dia (um por passageiro, com a ida e a volta juntas)."""
        por_passageiro: dict[int, dict] = {}
        for chamada in self._chamadas(dia, turno):
            viagem = chamada.viagem
            item = por_passageiro.setdefault(
                chamada.fk_estudante,
                {
                    "estudante": PassageiroDaChamada(
                        id=chamada.estudante.id,
                        nome=chamada.estudante.nome,
                        apelido=chamada.estudante.apelido,
                        celular=chamada.estudante.celular,
                        bairro=chamada.estudante.endereco.bairro,
                    ),
                    "instituicao": Referencia.model_validate(viagem.rota.instituicao),
                    "motorista": Referencia.model_validate(viagem.motorista),
                    "turno": viagem.rota.turno,
                    "ida": None,
                    "volta": None,
                },
            )
            item[viagem.sentido.value] = SituacaoNoSentido(
                fk_viagem=viagem.id,
                status=chamada.status,
                viagem_status=viagem.status,
                horario_previsto=chamada.horario_previsto,
                horario_aviso=chamada.horario_aviso,
                horario_embarque=chamada.horario_embarque,
                tardio=aviso_tardio(chamada, dia),
            )
        passageiros = sorted(
            (PassageiroDoDia(**dados) for dados in por_passageiro.values()),
            key=lambda p: (p.motorista.nome, p.estudante.nome),
        )

        def situacoes(p: PassageiroDoDia):
            return [s for s in (p.ida, p.volta) if s]

        avisaram = [p for p in passageiros if any(s.status == StatusChamada.NAO_VAI for s in situacoes(p))]
        return ChamadasDoDia(
            data=dia,
            resumo=ResumoChamadas(
                passageiros=len(passageiros),
                confirmados=sum(1 for p in passageiros if all(s.status != StatusChamada.NAO_VAI for s in situacoes(p))),
                avisaram=len(avisaram),
                tardios=sum(1 for p in avisaram if any(s.tardio for s in situacoes(p))),
            ),
            passageiros=passageiros,
        )

    @staticmethod
    def so_do_motorista(dia: ChamadasDoDia, fk_motorista: int | None) -> ChamadasDoDia:
        """Recorta o dia para os passageiros de um motorista (o resumo é refeito)."""
        passageiros = [p for p in dia.passageiros if p.motorista.id == fk_motorista]
        avisaram = [p for p in passageiros if any(s and s.status == StatusChamada.NAO_VAI for s in (p.ida, p.volta))]
        return ChamadasDoDia(
            data=dia.data,
            resumo=ResumoChamadas(
                passageiros=len(passageiros),
                confirmados=len(passageiros) - len(avisaram),
                avisaram=len(avisaram),
                tardios=sum(1 for p in avisaram if any(s and s.tardio for s in (p.ida, p.volta))),
            ),
            passageiros=passageiros,
        )

    def avisar(self, pedido: AvisoPedido) -> PassageiroDoDia:
        """Marca "não vai" nos sentidos pedidos. Só enquanto a viagem não terminou e o passageiro não embarcou."""
        alvo = self._alvos(pedido)
        momento = viagem_servico.agora()
        for chamada in alvo:
            if chamada.status == StatusChamada.NAO_VAI:
                continue
            if chamada.status != StatusChamada.PENDENTE:
                sentido = "na ida" if chamada.viagem.sentido == Sentido.IDA else "na volta"
                raise ConflitoDeDados(f"O passageiro já foi registrado {sentido} ({chamada.status.value}): não dá para avisar.")
            chamada.status = StatusChamada.NAO_VAI
            chamada.horario_aviso = momento
        self._salvar()
        return self._passageiro(pedido)

    def desfazer(self, pedido: AvisoPedido) -> PassageiroDoDia:
        """O passageiro mudou de ideia e vai: volta a ser esperado (só enquanto a viagem não terminou)."""
        for chamada in self._alvos(pedido):
            if chamada.status == StatusChamada.NAO_VAI:
                chamada.status = StatusChamada.PENDENTE
                chamada.horario_aviso = None
        self._salvar()
        return self._passageiro(pedido)

    def _alvos(self, pedido: AvisoPedido) -> list[Chamada]:
        if pedido.data < viagem_servico.agora().date():
            raise ConflitoDeDados("Esse dia já passou: não dá mais para mudar os avisos.")
        chamadas = [
            c for c in self._chamadas(pedido.data, fk_estudante=pedido.fk_estudante) if c.viagem.sentido in pedido.sentidos
        ]
        if not chamadas:
            raise RecursoNaoEncontrado("Este passageiro não tem viagem nesse dia e sentido. Gere as viagens do dia antes.")
        for chamada in chamadas:
            if chamada.viagem.status == StatusViagem.CONCLUIDA:
                raise ConflitoDeDados("Essa viagem já foi concluída: não dá mais para mudar o aviso.")
        return chamadas

    def _passageiro(self, pedido: AvisoPedido) -> PassageiroDoDia:
        dia = self.do_dia(pedido.data)
        return next(p for p in dia.passageiros if p.estudante.id == pedido.fk_estudante)

    def _salvar(self) -> None:
        try:
            self.sessao.commit()
        except Exception:
            self.sessao.rollback()
            raise
