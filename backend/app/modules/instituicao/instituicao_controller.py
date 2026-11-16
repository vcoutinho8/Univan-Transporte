"""Rotas HTTP das instituições (só leitura por enquanto)."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.modules.instituicao.instituicao_repositorio import RepositorioInstituicao
from app.modules.instituicao.instituicao_schema import InstituicaoResposta

roteador = APIRouter(prefix="/instituicoes", tags=["Instituições"])


def obter_repositorio_instituicao(sessao: Annotated[Session, Depends(obter_sessao)]) -> RepositorioInstituicao:
    return RepositorioInstituicao(sessao)


@roteador.get("", response_model=list[InstituicaoResposta], summary="Listar instituições")
def listar_instituicoes(repositorio: Annotated[RepositorioInstituicao, Depends(obter_repositorio_instituicao)]):
    return repositorio.listar()
