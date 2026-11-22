"""Schemas de entrada e saída dos motoristas (tabela `motorista`)."""

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.endereco.endereco_schema import EnderecoEntrada, EnderecoResposta
from app.modules.estudante.estudante_schema import normalizar_celular, normalizar_cpf, normalizar_obrigatorio
from app.shared.enums import StatusCadastro
from app.shared.texto import limpar_texto, so_digitos


def normalizar_cnh(valor: str) -> str:
    """Aceita a CNH com ou sem pontuação e confere só o formato (11 números).

    O dígito verificador é conferido pelo serviço, porque só vale para CNH nova ou alterada.
    """
    cnh = so_digitos(valor)
    if len(cnh) != 11:
        raise ValueError("CNH inválida. Informe os 11 números do registro.")
    return cnh


EXEMPLO_CRIACAO = {
    "nome": "Carlos Eduardo Martins",
    "apelido": "Cadu",
    "cpf": "123.456.789-09",
    "celular": "(27) 99111-0001",
    "cnh": "02650306461",
    "cnh_validade": "2031-03-15",
    "fk_veiculo": 1,
}


class MotoristaCriacao(BaseModel):
    """Dados para cadastrar um motorista. A empresa é a da sessão, não vem no corpo."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [EXEMPLO_CRIACAO]})

    nome: str = Field(max_length=100)
    apelido: str | None = Field(default=None, max_length=30)
    cpf: str
    celular: str
    cnh: str
    cnh_validade: date
    fk_veiculo: int | None = Field(default=None, gt=0)
    endereco: EnderecoEntrada | None = Field(default=None, description="Casa/garagem: de onde a ida sai.")
    salario: Decimal | None = Field(default=None, ge=0, le=100000, description="Salário mensal: entra sozinho no Financeiro.")
    dia_pagamento: int = Field(default=5, ge=1, le=28)
    status: StatusCadastro = StatusCadastro.ATIVO

    @field_validator("nome")
    @classmethod
    def validar_nome(cls, valor: str) -> str:
        return normalizar_obrigatorio(valor, "Informe o nome do motorista.")

    @field_validator("apelido")
    @classmethod
    def validar_apelido(cls, valor: str | None) -> str | None:
        return limpar_texto(valor)

    @field_validator("cpf")
    @classmethod
    def validar_cpf(cls, valor: str) -> str:
        return normalizar_cpf(valor)

    @field_validator("celular")
    @classmethod
    def validar_celular(cls, valor: str) -> str:
        return normalizar_celular(valor)

    @field_validator("cnh")
    @classmethod
    def validar_cnh(cls, valor: str) -> str:
        return normalizar_cnh(valor)


class MotoristaAtualizacao(BaseModel):
    """Dados para alterar um motorista. Só os campos enviados são alterados.

    `fk_veiculo: null` tira o veículo padrão do motorista. A empresa não muda.
    """

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"examples": [{"apelido": "Cadu", "celular": "(27) 99111-0002", "fk_veiculo": 2}]},
    )

    nome: str | None = Field(default=None, max_length=100)
    apelido: str | None = Field(default=None, max_length=30)
    cpf: str | None = None
    celular: str | None = None
    cnh: str | None = None
    cnh_validade: date | None = None
    fk_veiculo: int | None = Field(default=None, gt=0)
    endereco: EnderecoEntrada | None = Field(default=None, description="Substitui o endereço; null tira.")
    salario: Decimal | None = Field(default=None, ge=0, le=100000)
    dia_pagamento: int | None = Field(default=None, ge=1, le=28)
    status: StatusCadastro | None = None

    @field_validator("nome")
    @classmethod
    def validar_nome(cls, valor: str | None) -> str | None:
        return None if valor is None else normalizar_obrigatorio(valor, "Informe o nome do motorista.")

    @field_validator("apelido")
    @classmethod
    def validar_apelido(cls, valor: str | None) -> str | None:
        return limpar_texto(valor)

    @field_validator("cpf")
    @classmethod
    def validar_cpf(cls, valor: str | None) -> str | None:
        return None if valor is None else normalizar_cpf(valor)

    @field_validator("celular")
    @classmethod
    def validar_celular(cls, valor: str | None) -> str | None:
        return None if valor is None else normalizar_celular(valor)

    @field_validator("cnh")
    @classmethod
    def validar_cnh(cls, valor: str | None) -> str | None:
        return None if valor is None else normalizar_cnh(valor)


class VeiculoDoMotorista(BaseModel):
    """Veículo padrão do motorista, resumido."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    placa: str
    modelo: str
    cor: str | None
    capacidade: int
    status: StatusCadastro


class MotoristaResposta(BaseModel):
    """Motorista devolvido pela API, já com o veículo padrão."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    fk_empresa: int
    fk_veiculo: int | None
    nome: str
    apelido: str | None
    cpf: str
    celular: str | None
    cnh: str
    cnh_validade: date
    status: StatusCadastro
    veiculo: VeiculoDoMotorista | None
    endereco: EnderecoResposta | None = None
    salario: Decimal | None = None
    dia_pagamento: int | None = None
