"""Schemas da ordem das paradas (atual, sugerida e aplicar)."""

from datetime import time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import Turno


class Referencia(BaseModel):
    id: int
    nome: str


class PartidaDaOrdem(BaseModel):
    """Casa/garagem do motorista: de onde a ida sai."""

    endereco: str
    latitude: float
    longitude: float


class ParadaDaOrdem(BaseModel):
    tipo: Literal["passageiro", "faculdade"]
    fk_estudante: int | None = Field(description="Passageiro desta parada (vazio na faculdade).")
    nome: str
    detalhe: str
    instituicao: str | None
    latitude: float
    longitude: float
    horario: time | None = Field(description="Horário calculado pelos tempos de trajeto a partir da saída.")
    horario_atual: time | None = Field(description="Horário de embarque gravado hoje no cadastro.")


class Sequencia(BaseModel):
    paradas: list[ParadaDaOrdem]
    distancia_km: float
    duracao_min: int
    chegada: time | None = Field(description="Horário previsto na última faculdade.")


class SemLocalizacao(BaseModel):
    id: int
    nome: str


class OrdemResposta(BaseModel):
    """Ordem atual x sugerida da ida de um motorista num turno."""

    motorista: Referencia
    turno: Turno
    partida: PartidaDaOrdem | None
    horario_saida: time | None = Field(description="Saída mais cedo entre as rotas do turno.")
    pelas_ruas: bool = Field(description="Tempos reais pelas ruas (OSRM); falso = estimativa em linha reta.")
    atual: Sequencia
    sugerida: Sequencia
    economia_min: int = Field(description="Minutos a menos da sugerida em relação à atual.")
    sem_localizacao: list[SemLocalizacao]
    avisos: list[str]


class OrdemPedido(BaseModel):
    """Ordem de embarque escolhida (ids dos passageiros, do primeiro ao último)."""

    model_config = ConfigDict(
        extra="forbid", json_schema_extra={"examples": [{"fk_motorista": 1, "turno": "noite", "ordem": [6, 31, 32]}]}
    )

    fk_motorista: int = Field(gt=0)
    turno: Turno
    ordem: list[int] = Field(min_length=1, max_length=60)
