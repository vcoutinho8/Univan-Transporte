"""Schemas de entrada e saída das rotas."""

from datetime import time

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.shared.enums import StatusCadastro, Turno

DIAS_SEMANA = range(1, 8)  # 1 = segunda ... 7 = domingo (ISO), como em rota_dia


def validar_dias(dias: list[int]) -> list[int]:
    if not dias:
        raise ValueError("Escolha pelo menos um dia da semana.")
    if any(d not in DIAS_SEMANA for d in dias):
        raise ValueError("Dia da semana inválido. Use de 1 (segunda) a 7 (domingo).")
    return sorted(set(dias))


def validar_nome(valor: str) -> str:
    texto = " ".join(valor.split())
    if not texto:
        raise ValueError("Informe o nome da rota.")
    return texto


class RotaCriacao(BaseModel):
    """Rota nova: motorista + instituição + turno (únicos juntos), horários e dias da semana."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [{
                "nome": "Centro e Ipiranga → Novo Milênio (tarde)",
                "fk_motorista": 1,
                "fk_instituicao": 4,
                "turno": "tarde",
                "horario_ida": "12:40",
                "horario_volta": "18:00",
                "dias": [1, 2, 3, 4, 5],
            }]})

    nome: str = Field(max_length=100)
    fk_motorista: int = Field(gt=0)
    fk_instituicao: int = Field(gt=0)
    turno: Turno
    horario_ida: time | None = None
    horario_volta: time | None = None
    dias: list[int] = Field(max_length=7)

    @field_validator("nome")
    @classmethod
    def checar_nome(cls, valor: str) -> str:
        return validar_nome(valor)

    @field_validator("dias")
    @classmethod
    def checar_dias(cls, valor: list[int]) -> list[int]:
        return validar_dias(valor)


class RotaAtualizacao(BaseModel):
    """Alteração de rota: só os campos enviados mudam. `dias` substitui a lista inteira."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [{"dias": [1, 3, 5], "horario_volta": "17:30"}]})

    nome: str | None = Field(default=None, max_length=100)
    fk_motorista: int | None = Field(default=None, gt=0)
    fk_instituicao: int | None = Field(default=None, gt=0)
    turno: Turno | None = None
    horario_ida: time | None = None
    horario_volta: time | None = None
    dias: list[int] | None = Field(default=None, max_length=7)
    status: StatusCadastro | None = None

    @field_validator("nome")
    @classmethod
    def checar_nome(cls, valor: str | None) -> str | None:
        return None if valor is None else validar_nome(valor)

    @field_validator("dias")
    @classmethod
    def checar_dias(cls, valor: list[int] | None) -> list[int] | None:
        return None if valor is None else validar_dias(valor)


class Referencia(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str


class RotaResposta(BaseModel):
    """Rota com motorista, instituição, dias e quantos passageiros ela leva hoje."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    fk_motorista: int
    fk_instituicao: int
    turno: Turno
    horario_ida: time | None
    horario_volta: time | None
    status: StatusCadastro
    motorista: Referencia
    instituicao: Referencia
    dias: list[int]
    total_passageiros: int = 0

    @model_validator(mode="before")
    @classmethod
    def converter_dias(cls, origem):
        # No model, `dias` são linhas de rota_dia; na API, só os números dos dias.
        if hasattr(origem, "dias") and not isinstance(origem, dict):
            return {
                **{campo: getattr(origem, campo) for campo in (
                    "id", "nome", "fk_motorista", "fk_instituicao", "turno", "horario_ida",
                    "horario_volta", "status", "motorista", "instituicao",
                )},
                "dias": [d.dia_semana for d in origem.dias],
                "total_passageiros": getattr(origem, "total_passageiros", 0),
            }
        return origem
