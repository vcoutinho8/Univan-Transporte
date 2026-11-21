"""Rotas HTTP dos motoristas (tabela `motorista`)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.documentacao import erros
from app.config.empresa_atual import IdEmpresaAtual
from app.modules.empresa.empresa_repositorio import RepositorioEmpresa
from app.modules.motorista.motorista_repositorio import RepositorioMotorista
from app.modules.motorista.motorista_schema import MotoristaAtualizacao, MotoristaCriacao, MotoristaResposta
from app.modules.motorista.motorista_servico import ServicoMotorista
from app.modules.veiculo.veiculo_repositorio import RepositorioVeiculo
from app.shared.enums import StatusCadastro

roteador = APIRouter(prefix="/motoristas", tags=["Motoristas"])


def obter_servico_motorista(sessao: Annotated[Session, Depends(obter_sessao)]) -> ServicoMotorista:
    return ServicoMotorista(RepositorioMotorista(sessao), RepositorioVeiculo(sessao), RepositorioEmpresa(sessao))


Servico = Annotated[ServicoMotorista, Depends(obter_servico_motorista)]


@roteador.get("", response_model=list[MotoristaResposta], summary="Listar motoristas")
def listar_motoristas(
    servico: Servico,
    status_motorista: Annotated[StatusCadastro | None, Query(alias="status")] = None,
):
    return servico.listar(status=status_motorista)


@roteador.get("/{id_motorista}", response_model=MotoristaResposta, summary="Buscar motorista", responses=erros(404))
def obter_motorista(id_motorista: int, servico: Servico):
    return servico.obter(id_motorista)


@roteador.post(
    "",
    response_model=MotoristaResposta,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastrar motorista",
    responses=erros(409),
)
def cadastrar_motorista(dados: MotoristaCriacao, servico: Servico, id_empresa: IdEmpresaAtual):
    return servico.cadastrar(dados, id_empresa)


@roteador.patch(
    "/{id_motorista}", response_model=MotoristaResposta, summary="Alterar motorista", responses=erros(404, 409)
)
def atualizar_motorista(id_motorista: int, dados: MotoristaAtualizacao, servico: Servico):
    return servico.atualizar(id_motorista, dados)


@roteador.delete(
    "/{id_motorista}",
    response_model=MotoristaResposta,
    summary="Inativar motorista (não apaga o registro)",
    responses=erros(404, 409),
)
def inativar_motorista(id_motorista: int, servico: Servico):
    return servico.inativar(id_motorista)
