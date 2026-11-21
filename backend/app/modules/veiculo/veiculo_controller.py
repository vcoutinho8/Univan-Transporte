"""Rotas HTTP de veículos."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.documentacao import erros
from app.config.seguranca import ADMIN, ADMIN_OU_AUXILIAR
from app.config.empresa_atual import IdEmpresaAtual
from app.shared.enums import StatusCadastro
from app.modules.empresa.empresa_repositorio import RepositorioEmpresa
from app.modules.veiculo.veiculo_repositorio import RepositorioVeiculo
from app.modules.veiculo.veiculo_schema import VeiculoAtualizacao, VeiculoCriacao, VeiculoResposta
from app.modules.veiculo.veiculo_servico import ServicoVeiculo

roteador = APIRouter(prefix="/veiculos", tags=["Veículos"], dependencies=[ADMIN_OU_AUXILIAR])


def obter_servico_veiculo(sessao: Annotated[Session, Depends(obter_sessao)]) -> ServicoVeiculo:
    return ServicoVeiculo(RepositorioVeiculo(sessao), RepositorioEmpresa(sessao))


Servico = Annotated[ServicoVeiculo, Depends(obter_servico_veiculo)]


@roteador.get("", response_model=list[VeiculoResposta], summary="Listar veículos")
def listar_veiculos(
    servico: Servico,
    status_veiculo: Annotated[StatusCadastro | None, Query(alias="status")] = None,
    fk_empresa: Annotated[int | None, Query(gt=0)] = None,
):
    return servico.listar(status=status_veiculo, fk_empresa=fk_empresa)


@roteador.get("/{id_veiculo}", response_model=VeiculoResposta, summary="Buscar veículo", responses=erros(404))
def obter_veiculo(id_veiculo: int, servico: Servico):
    return servico.obter(id_veiculo)


@roteador.post(
    "",
    response_model=VeiculoResposta,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastrar veículo",
    responses=erros(409),
)
def cadastrar_veiculo(dados: VeiculoCriacao, servico: Servico, id_empresa: IdEmpresaAtual):
    return servico.cadastrar(dados, id_empresa)


@roteador.patch("/{id_veiculo}", dependencies=[ADMIN], response_model=VeiculoResposta, summary="Alterar veículo", responses=erros(404, 409))
def atualizar_veiculo(id_veiculo: int, dados: VeiculoAtualizacao, servico: Servico):
    return servico.atualizar(id_veiculo, dados)


@roteador.delete(
    "/{id_veiculo}",
    dependencies=[ADMIN], response_model=VeiculoResposta,
    summary="Inativar veículo (não apaga o registro)",
    responses=erros(404, 409),
)
def inativar_veiculo(id_veiculo: int, servico: Servico):
    return servico.inativar(id_veiculo)
