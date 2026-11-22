"""Schemas de entrada e saída de veículos."""

from enum import Enum
import re

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

from app.shared.enums import StatusCadastro
from app.shared.texto import limpar_texto

# Mesma regra do CHECK veiculo_placa_check: formato antigo (ABC1234) ou Mercosul (ABC1D23).
PADRAO_PLACA = re.compile(r"^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$")


class CategoriaVeiculo(str, Enum):
    DOBLO = "doblo"
    VAN = "van"
    MICRO_ONIBUS = "micro_onibus"
    ONIBUS = "onibus"


LIMITES_CATEGORIA: dict[CategoriaVeiculo, tuple[str, int, int]] = {
    CategoriaVeiculo.DOBLO: ("Doblò", 5, 7),
    CategoriaVeiculo.VAN: ("Van", 8, 19),
    CategoriaVeiculo.MICRO_ONIBUS: ("Micro-ônibus", 20, 32),
    CategoriaVeiculo.ONIBUS: ("Ônibus", 33, 70),
}

CAPACIDADE_MINIMA = 5
CAPACIDADE_MAXIMA = 70


def categoria_por_capacidade(capacidade: int) -> CategoriaVeiculo:
    """Infere a categoria do veículo com base na quantidade de lugares."""
    for categoria, (_, minimo, maximo) in LIMITES_CATEGORIA.items():
        if minimo <= capacidade <= maximo:
            return categoria
    if capacidade < CAPACIDADE_MINIMA:
        return CategoriaVeiculo.DOBLO
    return CategoriaVeiculo.ONIBUS


def validar_capacidade_na_categoria(capacidade: int, categoria: CategoriaVeiculo | None) -> None:
    """Garante que a capacidade respeita o limite global ou o intervalo da categoria."""
    if categoria is not None:
        rotulo, minimo, maximo = LIMITES_CATEGORIA[categoria]
        if not (minimo <= capacidade <= maximo):
            raise ValueError(
                f"Para a categoria {rotulo}, a capacidade deve ser entre {minimo} e {maximo} lugares."
            )
    elif not (CAPACIDADE_MINIMA <= capacidade <= CAPACIDADE_MAXIMA):
        raise ValueError(
            f"A capacidade deve ser entre {CAPACIDADE_MINIMA} e {CAPACIDADE_MAXIMA} lugares."
        )


def normalizar_placa(valor: str) -> str:
    """Remove traço e espaços, passa para maiúsculas e valida o formato."""
    placa = re.sub(r"[\s-]", "", valor).upper()
    if not PADRAO_PLACA.match(placa):
        raise ValueError("Placa inválida. Use o formato ABC1234 ou ABC1D23.")
    return placa


class VeiculoBase(BaseModel):
    modelo: str = Field(max_length=50)
    cor: str | None = Field(default=None, max_length=30)
    capacidade: int = Field(gt=0)
    categoria: CategoriaVeiculo | None = None

    @field_validator("modelo")
    @classmethod
    def validar_modelo(cls, valor: str) -> str:
        texto = valor.strip()
        if not texto:
            raise ValueError("Informe o modelo do veículo.")
        return texto

    @field_validator("cor")
    @classmethod
    def validar_cor(cls, valor: str | None) -> str | None:
        return limpar_texto(valor)

    @model_validator(mode="after")
    def validar_faixa_capacidade(self) -> "VeiculoBase":
        validar_capacidade_na_categoria(self.capacidade, self.categoria)
        return self


class VeiculoCriacao(VeiculoBase):
    """Dados para cadastrar um veículo. A empresa é a da sessão, não vem no corpo."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "placa": "QJA-1B23",
                    "categoria": "micro_onibus",
                    "modelo": "Mercedes-Benz Sprinter 416",
                    "cor": "Branca",
                    "capacidade": 20,
                }
            ]
        },
    )

    placa: str
    status: StatusCadastro = StatusCadastro.ATIVO

    @field_validator("placa")
    @classmethod
    def validar_placa(cls, valor: str) -> str:
        return normalizar_placa(valor)


class VeiculoAtualizacao(BaseModel):
    """Dados para alterar um veículo. Só os campos enviados são alterados (a empresa não muda)."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"examples": [{"categoria": "van", "cor": "Prata", "capacidade": 19}]},
    )

    placa: str | None = None
    modelo: str | None = Field(default=None, max_length=50)
    cor: str | None = Field(default=None, max_length=30)
    capacidade: int | None = Field(default=None, gt=0)
    categoria: CategoriaVeiculo | None = None
    status: StatusCadastro | None = None

    @field_validator("placa")
    @classmethod
    def validar_placa(cls, valor: str | None) -> str | None:
        return None if valor is None else normalizar_placa(valor)

    @field_validator("modelo")
    @classmethod
    def validar_modelo(cls, valor: str | None) -> str | None:
        if valor is None:
            return None
        texto = valor.strip()
        if not texto:
            raise ValueError("Informe o modelo do veículo.")
        return texto

    @field_validator("cor")
    @classmethod
    def validar_cor(cls, valor: str | None) -> str | None:
        return limpar_texto(valor)


class EmpresaDoVeiculo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    razao_social: str
    nome_fantasia: str | None


class VeiculoResposta(BaseModel):
    """Veículo devolvido pela API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    fk_empresa: int
    placa: str
    modelo: str
    cor: str | None
    capacidade: int
    status: StatusCadastro
    empresa: EmpresaDoVeiculo

    @computed_field
    @property
    def categoria(self) -> CategoriaVeiculo:
        return categoria_por_capacidade(self.capacidade)