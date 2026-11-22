"""Schemas de entrada e saída dos passageiros (tabela `estudante`)."""

import re
from datetime import time

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.endereco.endereco_schema import EnderecoEntrada, EnderecoResposta
from app.shared.enums import StatusCadastro, Turno
from app.shared.texto import limpar_texto, so_digitos

PADRAO_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalizar_cpf(valor: str) -> str:
    cpf = so_digitos(valor)
    if len(cpf) != 11:
        raise ValueError("CPF inválido. Informe os 11 números.")
    return cpf


def normalizar_celular(valor: str) -> str:
    celular = so_digitos(valor)
    if not 10 <= len(celular) <= 11:
        raise ValueError("Celular inválido. Informe DDD + número.")
    return celular


def normalizar_email(valor: str | None) -> str | None:
    email = limpar_texto(valor)
    if email is not None and not PADRAO_EMAIL.match(email):
        raise ValueError("E-mail inválido.")
    return email


def normalizar_obrigatorio(valor: str, mensagem: str) -> str:
    texto = valor.strip()
    if not texto:
        raise ValueError(mensagem)
    return texto


class EstudanteCriacao(BaseModel):
    """Dados para cadastrar um passageiro. A área é definida pelo banco a partir do endereço."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [{
                "nome": "Larissa Coutinho",
                "apelido": "Lari",
                "cpf": "123.456.789-09",
                "celular": "(27) 99888-0021",
                "email": "larissa@email.com",
                "fk_instituicao": 1,
                "curso": "Medicina",
                "turno": "noite",
                "horario_embarque": "17:20",
                "valor_mensal": 550.0,
                "dia_vencimento": 10,
                "endereco": {
                    "cep": "29200-180",
                    "logradouro": "Rua Getúlio Vargas",
                    "numero": "310",
                    "complemento": "Ap 302",
                    "bairro": "Centro",
                    "cidade": "Guarapari",
                    "estado": "ES",
                    "latitude": -20.669064,
                    "longitude": -40.495573,
                },
            }]})

    nome: str = Field(max_length=100)
    apelido: str | None = Field(default=None, max_length=30)
    cpf: str
    celular: str
    email: str | None = Field(default=None, max_length=100)
    fk_instituicao: int = Field(gt=0)
    curso: str | None = Field(default=None, max_length=50)
    turno: Turno
    horario_embarque: time | None = None
    valor_mensal: float = Field(ge=0)
    dia_vencimento: int = Field(ge=1, le=28)
    endereco: EnderecoEntrada
    fk_parada: int | None = Field(default=None, gt=0, description="Parada da faculdade (vazio = a principal).")
    status: StatusCadastro = StatusCadastro.ATIVO

    @field_validator("nome")
    @classmethod
    def validar_nome(cls, valor: str) -> str:
        return normalizar_obrigatorio(valor, "Informe o nome do passageiro.")

    @field_validator("apelido", "curso")
    @classmethod
    def validar_opcional(cls, valor: str | None) -> str | None:
        return limpar_texto(valor)

    @field_validator("cpf")
    @classmethod
    def validar_cpf(cls, valor: str) -> str:
        return normalizar_cpf(valor)

    @field_validator("celular")
    @classmethod
    def validar_celular(cls, valor: str) -> str:
        return normalizar_celular(valor)

    @field_validator("email")
    @classmethod
    def validar_email(cls, valor: str | None) -> str | None:
        return normalizar_email(valor)


class EstudanteAtualizacao(BaseModel):
    """Dados para alterar um passageiro. Só os campos enviados são alterados.

    Se `endereco` vier, ele substitui o endereço inteiro e a área é recalculada.
    """

    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [{"curso": "Odontologia", "horario_embarque": "17:30"}]})

    nome: str | None = Field(default=None, max_length=100)
    apelido: str | None = Field(default=None, max_length=30)
    cpf: str | None = None
    celular: str | None = None
    email: str | None = Field(default=None, max_length=100)
    fk_instituicao: int | None = Field(default=None, gt=0)
    curso: str | None = Field(default=None, max_length=50)
    turno: Turno | None = None
    horario_embarque: time | None = None
    valor_mensal: float | None = Field(default=None, ge=0)
    dia_vencimento: int | None = Field(default=None, ge=1, le=28)
    endereco: EnderecoEntrada | None = None
    fk_parada: int | None = Field(default=None, gt=0, description="null = volta para a parada principal.")
    status: StatusCadastro | None = None

    @field_validator("nome")
    @classmethod
    def validar_nome(cls, valor: str | None) -> str | None:
        return None if valor is None else normalizar_obrigatorio(valor, "Informe o nome do passageiro.")

    @field_validator("apelido", "curso")
    @classmethod
    def validar_opcional(cls, valor: str | None) -> str | None:
        return limpar_texto(valor)

    @field_validator("cpf")
    @classmethod
    def validar_cpf(cls, valor: str | None) -> str | None:
        return None if valor is None else normalizar_cpf(valor)

    @field_validator("celular")
    @classmethod
    def validar_celular(cls, valor: str | None) -> str | None:
        return None if valor is None else normalizar_celular(valor)

    @field_validator("email")
    @classmethod
    def validar_email(cls, valor: str | None) -> str | None:
        return normalizar_email(valor)


class InstituicaoDoEstudante(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str


class AreaDoEstudante(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str


class ParadaDoEstudante(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str


class EstudanteResposta(BaseModel):
    """Passageiro devolvido pela API, já com instituição, endereço e área."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    apelido: str | None
    cpf: str
    celular: str
    email: str | None
    fk_instituicao: int
    curso: str | None
    turno: Turno
    horario_embarque: time | None
    valor_mensal: float
    dia_vencimento: int
    status: StatusCadastro
    fk_area: int | None
    instituicao: InstituicaoDoEstudante
    endereco: EnderecoResposta
    area: AreaDoEstudante | None
    fk_parada: int | None = None
    parada: ParadaDoEstudante | None = None
