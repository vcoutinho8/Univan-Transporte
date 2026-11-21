"""Schemas do login (usuário e senha)."""

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

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


class LoginResposta(BaseModel):
    token: str = Field(description='Envie em cada requisição: "Authorization: Bearer <token>".')
    expira_em_minutos: int
    usuario: UsuarioResposta
