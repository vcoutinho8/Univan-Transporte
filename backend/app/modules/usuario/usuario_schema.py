"""Schemas do login e das contas (configurações: usuários e a própria conta)."""

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.endereco.endereco_schema import EnderecoEntrada, EnderecoResposta
from app.shared.documentos import cpf_valido
from app.shared.texto import so_digitos

FORMATO_LOGIN = re.compile(r"^[a-z0-9._-]{3,30}$")


class LoginPedido(BaseModel):
    """Usuário e senha. O usuário é aceito com maiúsculas e espaços nas pontas (vira "admin")."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [{"usuario": "admin", "senha": "123456"}]})

    usuario: str = Field(max_length=30)
    senha: str = Field(min_length=1, max_length=128)

    @field_validator("usuario")
    @classmethod
    def checar_usuario(cls, valor: str) -> str:
        login = valor.strip().lower()
        if not login:
            raise ValueError("Informe o usuário.")
        if not FORMATO_LOGIN.match(login):
            raise ValueError("Usuário inválido: use de 3 a 30 letras, números, ponto, hífen ou sublinhado.")
        return login

    @field_validator("senha")
    @classmethod
    def checar_senha(cls, valor: str) -> str:
        if not valor.strip():
            raise ValueError("Informe a senha.")
        return valor


class UsuarioResposta(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    login: str
    perfil: Literal["admin", "auxiliar", "motorista"]
    fk_empresa: int
    fk_motorista: int | None
    trocar_senha: bool = Field(default=False, description="Senha padrão: o app pede uma senha nova antes de seguir.")


class LoginResposta(BaseModel):
    token: str = Field(description='Envie em cada requisição: "Authorization: Bearer <token>".')
    expira_em_minutos: int
    usuario: UsuarioResposta


# ---------------------------------------------------------------- configurações (contas)

Perfil = Literal["admin", "auxiliar", "motorista"]
FORMATO_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _email(valor: str | None) -> str | None:
    texto = (valor or "").strip().lower()
    if not texto:
        return None
    if not FORMATO_EMAIL.match(texto):
        raise ValueError("E-mail inválido.")
    return texto


def _cpf(valor: str | None) -> str | None:
    numeros = so_digitos(valor or "")
    if not numeros:
        return None
    if not cpf_valido(numeros):
        raise ValueError("CPF inválido.")
    return numeros


def _nome(valor: str) -> str:
    nome = " ".join(valor.split())
    if not nome:
        raise ValueError("Informe o nome.")
    return nome


class UsuarioDetalhe(UsuarioResposta):
    """Usuário na tela de configurações (o admin vê todos)."""

    email: str | None
    cpf: str | None
    status: Literal["ativo", "inativo"]
    ultimo_acesso: datetime | None


class UsuarioNovo(BaseModel):
    """Novo acesso, criado pelo admin. O login é o CPF e a senha começa no padrão (123456): no
    primeiro login a pessoa cria a dela. Motorista usa o CPF do cadastro de motorista."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"examples": [{"nome": "Marina Souza", "cpf": "529.982.247-25", "perfil": "auxiliar"}]},
    )

    nome: str = Field(max_length=100)
    perfil: Perfil
    cpf: str | None = Field(default=None, description="Obrigatório (vira o login), menos para motorista: vem do cadastro dele.")
    fk_motorista: int | None = Field(default=None, gt=0, description="Obrigatório (e só) para o perfil motorista.")
    email: str | None = None

    @field_validator("nome")
    @classmethod
    def validar_nome(cls, valor):
        return _nome(valor)

    @field_validator("email")
    @classmethod
    def validar_email(cls, valor):
        return _email(valor)

    @field_validator("cpf")
    @classmethod
    def validar_cpf(cls, valor):
        return _cpf(valor)


class UsuarioAlteracao(BaseModel):
    """O que o admin muda num usuário: nome, CPF (o login acompanha) e situação. Senha: o reset."""

    model_config = ConfigDict(extra="forbid")

    nome: str | None = Field(default=None, max_length=100)
    cpf: str | None = None
    status: Literal["ativo", "inativo"] | None = None

    @field_validator("nome")
    @classmethod
    def validar_nome(cls, valor):
        return None if valor is None else _nome(valor)

    @field_validator("cpf")
    @classmethod
    def validar_cpf(cls, valor):
        return _cpf(valor)


class MinhaConta(UsuarioDetalhe):
    """A conta de quem está logado. Para o motorista, o CPF e a casa vêm do cadastro dele."""

    endereco: EnderecoResposta | None = None


class MinhaContaAlteracao(BaseModel):
    """O que cada um muda na própria conta: nome, CPF (menos o motorista), e-mail, senha (com a
    atual) e, o motorista, a casa."""

    model_config = ConfigDict(extra="forbid")

    nome: str | None = Field(default=None, max_length=100)
    cpf: str | None = None
    email: str | None = None
    senha_atual: str | None = Field(default=None, max_length=128)
    senha_nova: str | None = Field(default=None, min_length=6, max_length=128)
    endereco: EnderecoEntrada | None = None

    @field_validator("nome")
    @classmethod
    def validar_nome(cls, valor):
        return None if valor is None else _nome(valor)

    @field_validator("cpf")
    @classmethod
    def validar_cpf(cls, valor):
        return _cpf(valor)

    @field_validator("email")
    @classmethod
    def validar_email(cls, valor):
        return _email(valor)
