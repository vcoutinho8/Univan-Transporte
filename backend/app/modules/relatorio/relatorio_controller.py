"""Rotas HTTP dos relatórios (só leitura)."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.documentacao import erros
from app.config.seguranca import ADMIN_OU_AUXILIAR
from app.modules.relatorio.relatorio_repositorio import RepositorioRelatorio
from app.modules.relatorio.relatorio_schema import RelatorioDiasSemAula, RelatorioEstudantesAtivos
from app.modules.relatorio.relatorio_servico import ServicoRelatorio
from app.shared.enums import Turno

roteador = APIRouter(prefix="/relatorios", tags=["Relatórios"], dependencies=[ADMIN_OU_AUXILIAR])


def obter_servico_relatorio(sessao: Annotated[Session, Depends(obter_sessao)]) -> ServicoRelatorio:
    return ServicoRelatorio(RepositorioRelatorio(sessao))


Servico = Annotated[ServicoRelatorio, Depends(obter_servico_relatorio)]


@roteador.get(
    "/estudantes-ativos",
    response_model=RelatorioEstudantesAtivos,
    summary="Passageiros ativos, com frequência no período e totais por instituição e turno",
    responses=erros(422),
)
def relatorio_estudantes_ativos(
    servico: Servico,
    data_inicio: Annotated[date, Query(description="Início do período (AAAA-MM-DD).")],
    data_fim: Annotated[date, Query(description="Fim do período (AAAA-MM-DD), inclusive.")],
    fk_instituicao: Annotated[int | None, Query(gt=0)] = None,
    turno: Turno | None = None,
    fk_area: Annotated[int | None, Query(gt=0)] = None,
):
    return servico.estudantes_ativos(
        data_inicio=data_inicio, data_fim=data_fim, fk_instituicao=fk_instituicao, turno=turno, fk_area=fk_area
    )


@roteador.get(
    "/dias-sem-aula",
    response_model=RelatorioDiasSemAula,
    summary="Dias sem aula do período (feriados, recessos, férias), agrupados em períodos",
    responses=erros(422),
)
def relatorio_dias_sem_aula(
    servico: Servico,
    data_inicio: Annotated[date, Query(description="Início do período (AAAA-MM-DD).")],
    data_fim: Annotated[date, Query(description="Fim do período (AAAA-MM-DD), inclusive.")],
    fk_instituicao: Annotated[int | None, Query(gt=0, description="Os da instituição e os gerais.")] = None,
):
    return servico.dias_sem_aula(data_inicio=data_inicio, data_fim=data_fim, fk_instituicao=fk_instituicao)
