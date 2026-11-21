"""Schemas da jornada: tudo o que um motorista faz num turno e sentido (ex.: a ida da noite)."""

from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field

from app.modules.viagem.viagem_schema import (
    ChamadaResposta,
    ContagemPassageiros,
    Referencia,
    ViagemResposta,
)
from app.shared.enums import Sentido, Turno

STATUS_JORNADA = ("agendada", "em_andamento", "concluida", "cancelada")


class JornadaPedido(BaseModel):
    """Identifica a jornada: dia, motorista, turno e sentido."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"examples": [{"data": "2026-11-23", "fk_motorista": 1, "turno": "noite", "sentido": "ida"}]},
    )

    data: date
    fk_motorista: int = Field(gt=0)
    turno: Turno
    sentido: Sentido


class ChamadaDaJornada(ChamadaResposta):
    """Passageiro na fila da jornada, com a viagem (rota) e a instituição dele."""

    fk_viagem: int
    instituicao: Referencia


class JornadaResposta(BaseModel):
    """Jornada do motorista: as viagens (rotas) dele no turno e sentido, e a fila única de passageiros.

    A fila não traz quem avisou que não vai (o aviso prévio tira o passageiro do embarque);
    esses ficam só na contagem `passageiros.nao_vai`.
    """

    data: date
    turno: Turno
    sentido: Sentido
    motorista: Referencia
    status: str = Field(description="agendada, em_andamento, concluida ou cancelada (a jornada inteira).")
    fase: str = Field(
        description="agendada, embarque (buscando passageiros), a_caminho (todos registrados, faltam os "
        "desembarques), concluida ou cancelada."
    )
    horario_previsto: time | None = Field(description="O mais cedo entre as rotas da jornada.")
    horario_saida: datetime | None
    horario_chegada: datetime | None
    viagens: list[ViagemResposta]
    passageiros: ContagemPassageiros
    fila: list[ChamadaDaJornada]
