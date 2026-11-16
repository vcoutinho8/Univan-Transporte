"""Rotas HTTP dos passageiros (tabela `estudante`)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.documentacao import erros
from app.modules.estudante.estudante_repositorio import RepositorioEstudante
from app.modules.estudante.estudante_schema import (
    EstudanteAtualizacao,
    EstudanteCriacao,
    EstudanteResposta,
)
from app.modules.estudante.estudante_servico import ServicoEstudante
from app.modules.instituicao.instituicao_repositorio import RepositorioInstituicao
from app.shared.enums import StatusCadastro

roteador = APIRouter(prefix="/estudantes", tags=["Passageiros"])


def obter_servico_estudante(sessao: Annotated[Session, Depends(obter_sessao)]) -> ServicoEstudante:
    return ServicoEstudante(RepositorioEstudante(sessao), RepositorioInstituicao(sessao))


Servico = Annotated[ServicoEstudante, Depends(obter_servico_estudante)]


@roteador.get("", response_model=list[EstudanteResposta], summary="Listar passageiros")
def listar_estudantes(
    servico: Servico,
    status_estudante: Annotated[StatusCadastro | None, Query(alias="status")] = None,
    fk_area: Annotated[int | None, Query(gt=0)] = None,
    fk_instituicao: Annotated[int | None, Query(gt=0)] = None,
):
    return servico.listar(status=status_estudante, fk_area=fk_area, fk_instituicao=fk_instituicao)


@roteador.get("/{id_estudante}", response_model=EstudanteResposta, summary="Buscar passageiro", responses=erros(404))
def obter_estudante(id_estudante: int, servico: Servico):
    return servico.obter(id_estudante)


@roteador.post(
    "",
    response_model=EstudanteResposta,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastrar passageiro",
    responses=erros(409),
)
def cadastrar_estudante(dados: EstudanteCriacao, servico: Servico):
    return servico.cadastrar(dados)


@roteador.patch("/{id_estudante}", response_model=EstudanteResposta, summary="Alterar passageiro", responses=erros(404, 409))
def atualizar_estudante(id_estudante: int, dados: EstudanteAtualizacao, servico: Servico):
    return servico.atualizar(id_estudante, dados)


@roteador.delete(
    "/{id_estudante}",
    response_model=EstudanteResposta,
    summary="Inativar passageiro (não apaga o registro)",
    responses=erros(404, 409),
)
def inativar_estudante(id_estudante: int, servico: Servico):
    return servico.inativar(id_estudante)
