"""Rotas HTTP de veículos."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.shared.enums import StatusCadastro
from app.modules.empresa.empresa_repositorio import RepositorioEmpresa
from app.modules.veiculo.veiculo_repositorio import RepositorioVeiculo
from app.modules.veiculo.veiculo_schema import VeiculoAtualizacao, VeiculoCriacao, VeiculoResposta
from app.modules.veiculo.veiculo_servico import ServicoVeiculo

roteador = APIRouter(prefix="/veiculos", tags=["Veículos"])


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


@roteador.get("/{id_veiculo}", response_model=VeiculoResposta, summary="Buscar veículo")
def obter_veiculo(id_veiculo: int, servico: Servico):
    return servico.obter(id_veiculo)


@roteador.post(
    "",
    response_model=VeiculoResposta,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastrar veículo",
)
def cadastrar_veiculo(dados: VeiculoCriacao, servico: Servico):
    return servico.cadastrar(dados)


@roteador.patch("/{id_veiculo}", response_model=VeiculoResposta, summary="Alterar veículo")
def atualizar_veiculo(id_veiculo: int, dados: VeiculoAtualizacao, servico: Servico):
    return servico.atualizar(id_veiculo, dados)


@roteador.delete(
    "/{id_veiculo}",
    response_model=VeiculoResposta,
    summary="Inativar veículo (não apaga o registro)",
)
def inativar_veiculo(id_veiculo: int, servico: Servico):
    return servico.inativar(id_veiculo)
