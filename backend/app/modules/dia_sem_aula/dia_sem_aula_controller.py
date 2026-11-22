"""Rotas HTTP dos dias sem aula (feriados, recessos e férias acadêmicas)."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.documentacao import erros
from app.config.seguranca import ADMIN_OU_AUXILIAR
from app.modules.dia_sem_aula.dia_sem_aula_repositorio import RepositorioDiaSemAula
from app.modules.dia_sem_aula.dia_sem_aula_schema import (
    DiaSemAulaResposta,
    PeriodoSemAula,
    PeriodoSemAulaCriacao,
    PeriodoSemAulaResultado,
    RemocaoPedido,
)
from app.modules.dia_sem_aula.dia_sem_aula_servico import ServicoDiaSemAula
from app.modules.instituicao.instituicao_repositorio import RepositorioInstituicao

roteador = APIRouter(prefix="/dias-sem-aula", tags=["Dias sem aula"], dependencies=[ADMIN_OU_AUXILIAR])


def obter_servico(sessao: Annotated[Session, Depends(obter_sessao)]) -> ServicoDiaSemAula:
    return ServicoDiaSemAula(RepositorioDiaSemAula(sessao), RepositorioInstituicao(sessao))


Servico = Annotated[ServicoDiaSemAula, Depends(obter_servico)]


class RemocaoResultado(BaseModel):
    removidos: int


@roteador.get("", response_model=list[DiaSemAulaResposta], summary="Listar dias sem aula do período")
def listar_dias_sem_aula(
    servico: Servico,
    inicio: date,
    fim: date,
    fk_instituicao: Annotated[int | None, Query(gt=0, description="Os dela e os gerais.")] = None,
):
    return servico.listar(inicio, fim, fk_instituicao)


@roteador.get(
    "/periodos",
    response_model=list[PeriodoSemAula],
    summary="Dias sem aula agrupados em períodos (dias seguidos com o mesmo motivo e instituição)",
)
def listar_periodos(
    servico: Servico,
    inicio: date,
    fim: date,
    fk_instituicao: Annotated[int | None, Query(gt=0)] = None,
):
    return servico.periodos(inicio, fim, fk_instituicao)


@roteador.post(
    "",
    response_model=PeriodoSemAulaResultado,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastrar um dia ou um período sem aula (ex.: férias acadêmicas)",
    responses=erros(409),
)
def cadastrar_periodo(dados: PeriodoSemAulaCriacao, servico: Servico):
    return servico.cadastrar(dados)


@roteador.post(
    "/remover",
    response_model=RemocaoResultado,
    summary="Remover dias sem aula (um período inteiro de uma vez)",
    responses=erros(404, 409),
)
def remover_dias(dados: RemocaoPedido, servico: Servico):
    return RemocaoResultado(removidos=servico.remover(dados.ids))
