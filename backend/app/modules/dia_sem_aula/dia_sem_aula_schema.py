"""Schemas dos dias sem aula (feriados, recessos e férias acadêmicas)."""

from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Referencia(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str


class DiaSemAulaResposta(BaseModel):
    """Um dia sem aula. Sem instituição = vale para todas (feriado geral)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    data: date
    motivo: str
    fk_instituicao: int | None
    instituicao: Referencia | None


class PeriodoSemAula(BaseModel):
    """Dias seguidos com o mesmo motivo e a mesma instituição, mostrados como um período só."""

    inicio: date
    fim: date
    dias: int = Field(description="Dias corridos do período.")
    dias_uteis: int = Field(description="Dias de segunda a sexta dentro do período.")
    motivo: str
    instituicao: Referencia | None = Field(description="Vazio = todas as instituições.")
    ids: list[int] = Field(description="Ids dos dias, para remover o período inteiro.")


class PeriodoSemAulaCriacao(BaseModel):
    """Um dia (início = fim) ou um período sem aula, para todas as instituições ou para algumas."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {"data_inicio": "2026-12-21", "data_fim": "2027-01-31", "fk_instituicoes": [], "motivo": "Férias acadêmicas"}
            ]
        },
    )

    data_inicio: date
    data_fim: date
    fk_instituicoes: list[int] = Field(
        default_factory=list, max_length=50, description="Vazia = todas as instituições; ou uma ou mais."
    )
    motivo: str = Field(max_length=100)

    @field_validator("fk_instituicoes")
    @classmethod
    def checar_instituicoes(cls, valor: list[int]) -> list[int]:
        if any(i <= 0 for i in valor):
            raise ValueError("Instituição inválida.")
        return sorted(set(valor))

    @field_validator("motivo")
    @classmethod
    def checar_motivo(cls, valor: str) -> str:
        texto = " ".join(valor.split())
        if not texto:
            raise ValueError("Informe o motivo (ex.: Férias acadêmicas, Feriado de Natal).")
        return texto

    @model_validator(mode="after")
    def checar_periodo(self):
        if self.data_fim < self.data_inicio:
            raise ValueError("A data final não pode ser anterior à data inicial.")
        if (self.data_fim - self.data_inicio).days >= 366:
            raise ValueError("Escolha um período de no máximo um ano.")
        return self


class PeriodoSemAulaResultado(BaseModel):
    criados: int = Field(description="Dias novos cadastrados.")
    ja_existiam: int = Field(description="Dias do período que já estavam cadastrados (não foram duplicados).")
    viagens_geradas: int = Field(description="Viagens já geradas nesses dias para as instituições afetadas.")
    viagens_canceladas: int = Field(default=0, description="Delas, as agendadas que foram canceladas com o motivo.")


class RemocaoPedido(BaseModel):
    """Ids dos dias a remover (um período inteiro de uma vez)."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [{"ids": [11, 12, 13]}]})

    ids: list[int] = Field(min_length=1, max_length=400)
