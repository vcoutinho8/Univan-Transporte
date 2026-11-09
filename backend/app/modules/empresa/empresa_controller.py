"""Rotas HTTP de empresas."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.modules.empresa.empresa_repositorio import RepositorioEmpresa
from app.modules.empresa.empresa_schema import EmpresaResumo
from app.modules.empresa.empresa_servico import ServicoEmpresa

roteador = APIRouter(prefix="/empresas", tags=["Empresas"])


def obter_servico_empresa(sessao: Annotated[Session, Depends(obter_sessao)]) -> ServicoEmpresa:
    return ServicoEmpresa(RepositorioEmpresa(sessao))


@roteador.get("", response_model=list[EmpresaResumo], summary="Listar empresas")
def listar_empresas(servico: Annotated[ServicoEmpresa, Depends(obter_servico_empresa)]):
    return servico.listar()
