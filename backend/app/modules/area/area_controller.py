"""Rotas HTTP das áreas (bairros desenhados no mapa)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.documentacao import erros
from app.config.seguranca import ADMIN_OU_AUXILIAR
from app.modules.area.area_repositorio import RepositorioArea
from app.modules.area.area_schema import AreaAtualizacao, AreaCriacao, AreaResposta
from app.modules.area.area_servico import ServicoArea
from app.modules.motorista.motorista_repositorio import RepositorioMotorista
from app.shared.enums import StatusCadastro

roteador = APIRouter(prefix="/areas", tags=["Áreas"], dependencies=[ADMIN_OU_AUXILIAR])


def obter_servico_area(sessao: Annotated[Session, Depends(obter_sessao)]) -> ServicoArea:
    return ServicoArea(RepositorioArea(sessao), RepositorioMotorista(sessao))


Servico = Annotated[ServicoArea, Depends(obter_servico_area)]


@roteador.get("", response_model=list[AreaResposta], summary="Listar áreas com o polígono")
def listar_areas(servico: Servico, status_area: Annotated[StatusCadastro | None, Query(alias="status")] = None):
    return servico.listar(status=status_area)


@roteador.get("/{id_area}", response_model=AreaResposta, summary="Buscar área", responses=erros(404))
def obter_area(id_area: int, servico: Servico):
    return servico.obter(id_area)


@roteador.post("", response_model=AreaResposta, status_code=status.HTTP_201_CREATED, summary="Cadastrar área", responses=erros(409))
def cadastrar_area(dados: AreaCriacao, servico: Servico):
    return servico.cadastrar(dados)


@roteador.patch("/{id_area}", response_model=AreaResposta, summary="Alterar área (nome, motorista, contorno)", responses=erros(404, 409))
def atualizar_area(id_area: int, dados: AreaAtualizacao, servico: Servico):
    return servico.atualizar(id_area, dados)


@roteador.delete("/{id_area}", response_model=AreaResposta, summary="Inativar área (não apaga)", responses=erros(404, 409))
def inativar_area(id_area: int, servico: Servico):
    return servico.inativar(id_area)
