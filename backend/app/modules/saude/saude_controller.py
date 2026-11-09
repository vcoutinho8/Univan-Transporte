"""Verificação de saúde da API e da conexão com o banco."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao

roteador = APIRouter(prefix="/saude", tags=["Saúde"])


@roteador.get("", summary="Verificar se a API e o banco estão respondendo")
def verificar_saude(sessao: Annotated[Session, Depends(obter_sessao)]):
    try:
        sessao.execute(text("SELECT 1"))
        banco = "conectado"
    except SQLAlchemyError:
        banco = "indisponível"
    return {"api": "ok", "banco": banco}
