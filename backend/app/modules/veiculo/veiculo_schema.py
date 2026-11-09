"""Schemas de entrada e saída de veículos."""

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.shared.enums import StatusCadastro

# Mesma regra do CHECK veiculo_placa_check: formato antigo (ABC1234) ou Mercosul (ABC1D23).
PADRAO_PLACA = re.compile(r"^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$")


def normalizar_placa(valor: str) -> str:
    """Remove traço e espaços, passa para maiúsculas e valida o formato."""
    placa = re.sub(r"[\s-]", "", valor).upper()
    if not PADRAO_PLACA.match(placa):
        raise ValueError("Placa inválida. Use o formato ABC1234 ou ABC1D23.")
    return placa


def limpar_texto(valor: str | None) -> str | None:
    if valor is None:
        return None
    texto = valor.strip()
    return texto or None


class VeiculoBase(BaseModel):
    modelo: str = Field(max_length=50)
    cor: str | None = Field(default=None, max_length=30)
    capacidade: int = Field(gt=0)

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


class VeiculoCriacao(VeiculoBase):
    """Dados para cadastrar um veículo."""

    model_config = ConfigDict(extra="forbid")

    fk_empresa: int = Field(gt=0)
    placa: str
    status: StatusCadastro = StatusCadastro.ATIVO

    @field_validator("placa")
    @classmethod
    def validar_placa(cls, valor: str) -> str:
        return normalizar_placa(valor)


class VeiculoAtualizacao(BaseModel):
    """Dados para alterar um veículo. Só os campos enviados são alterados."""

    model_config = ConfigDict(extra="forbid")

    fk_empresa: int | None = Field(default=None, gt=0)
    placa: str | None = None
    modelo: str | None = Field(default=None, max_length=50)
    cor: str | None = Field(default=None, max_length=30)
    capacidade: int | None = Field(default=None, gt=0)
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
