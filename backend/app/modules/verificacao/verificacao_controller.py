"""Rotas HTTP de conferência: o formulário avisa enquanto a pessoa digita (CPF inválido ou já usado,
celular de outro cadastro), antes de tentar salvar."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.seguranca import ADMIN_OU_AUXILIAR
from app.shared.cpf import dono_do
from app.shared.documentos import cpf_valido
from app.shared.texto import so_digitos

roteador = APIRouter(prefix="/cadastros", tags=["Acesso"], dependencies=[ADMIN_OU_AUXILIAR])


class Verificacao(BaseModel):
    cpf_valido: bool | None
    cpf_em_uso: str | None
    celular_em_uso: str | None


@roteador.get("/verificar", response_model=Verificacao, summary="Conferir CPF e celular antes de salvar (válido e não repetido)")
def verificar(
    sessao: Annotated[Session, Depends(obter_sessao)],
    cpf: str = Query(default="", max_length=20),
    celular: str = Query(default="", max_length=20),
    tabela: Literal["estudante", "motorista", "usuario"] | None = Query(default=None, description="Cadastro sendo editado."),
    id: int | None = Query(default=None, description="Registro sendo editado (não conta como repetido)."),
):
    cpf, celular = so_digitos(cpf), so_digitos(celular)
    return Verificacao(
        cpf_valido=cpf_valido(cpf) if len(cpf) == 11 else None,
        cpf_em_uso=dono_do(sessao, "cpf", cpf, tabela, id) if len(cpf) == 11 else None,
        celular_em_uso=dono_do(sessao, "celular", celular, tabela, id) if len(celular) >= 10 else None,
    )
