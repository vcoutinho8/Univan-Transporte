"""Rotas HTTP dos motoristas (só leitura por enquanto; o cadastro vem depois)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.modules.motorista.motorista_repositorio import RepositorioMotorista
from app.shared.enums import StatusCadastro

roteador = APIRouter(prefix="/motoristas", tags=["Motoristas"])


class MotoristaResumo(BaseModel):
    """Dados resumidos (seletor de motorista da área)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    celular: str | None
    status: StatusCadastro


def obter_repositorio_motorista(sessao: Annotated[Session, Depends(obter_sessao)]) -> RepositorioMotorista:
    return RepositorioMotorista(sessao)


@roteador.get("", response_model=list[MotoristaResumo], summary="Listar motoristas")
def listar_motoristas(
    repositorio: Annotated[RepositorioMotorista, Depends(obter_repositorio_motorista)],
    status_motorista: Annotated[StatusCadastro | None, Query(alias="status")] = None,
):
    return repositorio.listar(status=status_motorista)
