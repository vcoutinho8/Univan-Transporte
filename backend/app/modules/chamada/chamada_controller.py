"""Rotas HTTP das chamadas: lista do dia e aviso prévio ("não vou") do passageiro."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.documentacao import erros
from app.config.erros import AcessoNegado
from app.config.seguranca import TODOS, Logado
from app.modules.chamada.chamada_schema import AvisoPedido, ChamadasDoDia, PassageiroDoDia
from app.modules.chamada.chamada_servico import ServicoChamada
from app.shared.enums import Turno

roteador = APIRouter(prefix="/chamadas", tags=["Chamadas"], dependencies=[TODOS])


def obter_servico(sessao: Annotated[Session, Depends(obter_sessao)]) -> ServicoChamada:
    return ServicoChamada(sessao)


Servico = Annotated[ServicoChamada, Depends(obter_servico)]


@roteador.get("", response_model=ChamadasDoDia, summary="Passageiros esperados no dia, com ida, volta e avisos")
def chamadas_do_dia(servico: Servico, usuario: Logado, data: date, turno: Turno | None = None):
    dia = servico.do_dia(data, turno)
    if usuario.motorista:
        # O motorista vê só os passageiros das próprias viagens.
        return servico.so_do_motorista(dia, usuario.fk_motorista)
    return dia


def garantir_passageiro_do_motorista(servico: ServicoChamada, usuario, dados: AvisoPedido) -> None:
    if usuario.motorista:
        dia = servico.so_do_motorista(servico.do_dia(dados.data), usuario.fk_motorista)
        if dados.fk_estudante not in {p.estudante.id for p in dia.passageiros}:
            raise AcessoNegado("Este passageiro não está nas suas viagens deste dia.")


@roteador.post(
    "/aviso",
    response_model=PassageiroDoDia,
    summary='Passageiro avisou que não vai (ida, volta ou as duas); com menos de 1 hora fica como "última hora"',
    responses=erros(404, 409),
)
def avisar_nao_vou(dados: AvisoPedido, servico: Servico, usuario: Logado):
    garantir_passageiro_do_motorista(servico, usuario, dados)
    return servico.avisar(dados)


@roteador.post(
    "/aviso/desfazer",
    response_model=PassageiroDoDia,
    summary="Passageiro mudou de ideia e vai: tira o aviso",
    responses=erros(404, 409),
)
def desfazer_aviso(dados: AvisoPedido, servico: Servico, usuario: Logado):
    garantir_passageiro_do_motorista(servico, usuario, dados)
    return servico.desfazer(dados)
