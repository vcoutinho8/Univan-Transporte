"""Schemas das chamadas do dia: quem vai e quem avisou que não vai (aviso prévio)."""

from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.shared.enums import Sentido, StatusChamada, StatusViagem, Turno


class Referencia(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str


class PassageiroDaChamada(BaseModel):
    id: int
    nome: str
    apelido: str | None
    celular: str
    bairro: str


class SituacaoNoSentido(BaseModel):
    """A chamada do passageiro num sentido (ida ou volta) do dia."""

    fk_viagem: int
    status: StatusChamada
    viagem_status: StatusViagem
    horario_previsto: time | None
    horario_aviso: datetime | None
    horario_embarque: datetime | None
    tardio: bool = Field(description="Avisou que não vai com menos de 1 hora do horário previsto (aviso de última hora).")


class PassageiroDoDia(BaseModel):
    """Um passageiro esperado no dia: a ida e a volta dele, com o motorista e a faculdade."""

    estudante: PassageiroDaChamada
    instituicao: Referencia
    motorista: Referencia
    turno: Turno
    ida: SituacaoNoSentido | None
    volta: SituacaoNoSentido | None


class ResumoChamadas(BaseModel):
    passageiros: int
    confirmados: int = Field(description="Não avisaram nada: devem ir na ida e na volta.")
    avisaram: int = Field(description="Avisaram que não vão em algum sentido.")
    tardios: int = Field(description="Desses avisos, os de última hora (menos de 1 hora antes).")


class ChamadasDoDia(BaseModel):
    data: date
    resumo: ResumoChamadas
    passageiros: list[PassageiroDoDia]


class AvisoPedido(BaseModel):
    """Passageiro avisou que não vai (ou desistiu do aviso) na ida, na volta ou nas duas."""

    model_config = ConfigDict(
        extra="forbid", json_schema_extra={"examples": [{"data": "2026-11-23", "fk_estudante": 3, "sentidos": ["ida", "volta"]}]}
    )

    data: date
    fk_estudante: int = Field(gt=0)
    sentidos: list[Sentido] = Field(min_length=1, max_length=2)

    @field_validator("sentidos")
    @classmethod
    def sem_repetir(cls, valor: list[Sentido]) -> list[Sentido]:
        return sorted(set(valor), key=lambda s: s.value)
