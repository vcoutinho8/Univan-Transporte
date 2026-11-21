"""Rotas HTTP dos relatórios (só leitura)."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.documentacao import erros
from app.modules.relatorio.relatorio_repositorio import RepositorioRelatorio
from app.modules.relatorio.relatorio_schema import RelatorioEstudantesAtivos
from app.modules.relatorio.relatorio_servico import ServicoRelatorio
from app.shared.enums import Turno

roteador = APIRouter(prefix="/relatorios", tags=["Relatórios"])


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
