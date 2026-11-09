"""Rotas HTTP do painel administrativo."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.modules.painel.painel_repositorio import RepositorioPainel
from app.modules.painel.painel_schema import ResumoPainel
from app.modules.painel.painel_servico import ServicoPainel

roteador = APIRouter(prefix="/painel", tags=["Painel"])


def obter_servico_painel(sessao: Annotated[Session, Depends(obter_sessao)]) -> ServicoPainel:
    return ServicoPainel(RepositorioPainel(sessao))


@roteador.get("/resumo", response_model=ResumoPainel, summary="Números da tela inicial")
def obter_resumo(
    servico: Annotated[ServicoPainel, Depends(obter_servico_painel)],
    data: Annotated[date | None, Query(description="Dia das viagens (padrão: hoje)")] = None,
):
    return servico.resumo(data)
