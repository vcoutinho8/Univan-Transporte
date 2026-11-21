"""Rotas HTTP das viagens (cada ida ou volta de uma rota num dia)."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.documentacao import erros
from app.config.erros import AcessoNegado
from app.config.seguranca import ADMIN, OPERACAO, TODOS, Logado, UsuarioLogado
from app.modules.motorista.motorista_repositorio import RepositorioMotorista
from app.modules.veiculo.veiculo_repositorio import RepositorioVeiculo
from app.modules.viagem.jornada_schema import JornadaPedido, JornadaResposta
from app.modules.viagem.jornada_servico import ServicoJornada
from app.modules.viagem.viagem_repositorio import RepositorioViagem
from app.modules.viagem.viagem_schema import (
    DiaDoCalendario,
    GeracaoPedido,
    GeracaoResposta,
    SubstituicaoPedido,
    ViagemDetalhe,
    ViagemResposta,
)
from app.modules.viagem.viagem_servico import ServicoViagem
from app.shared.enums import Sentido, StatusViagem, Turno

roteador = APIRouter(prefix="/viagens", tags=["Viagens"], dependencies=[TODOS])


def obter_servico_viagem(sessao: Annotated[Session, Depends(obter_sessao)]) -> ServicoViagem:
    return ServicoViagem(RepositorioViagem(sessao), RepositorioMotorista(sessao), RepositorioVeiculo(sessao))


Servico = Annotated[ServicoViagem, Depends(obter_servico_viagem)]


def obter_servico_jornada(servico: Servico) -> ServicoJornada:
    return ServicoJornada(servico)


Jornada = Annotated[ServicoJornada, Depends(obter_servico_jornada)]


def garantir_motorista(usuario: UsuarioLogado, fk_motorista: int) -> None:
    """Motorista só mexe nas próprias viagens; admin e auxiliar passam."""
    if usuario.motorista and fk_motorista != usuario.fk_motorista:
        raise AcessoNegado("Esta viagem é de outro motorista.")


def viagem_do_motorista(id_viagem: int, usuario: Logado, servico: Servico) -> None:
    """Dependência das rotas /{id_viagem}/...: confere o dono antes de qualquer ação."""
    if usuario.motorista:
        viagem = servico.repositorio.buscar_por_id(id_viagem)
        if viagem is not None:
            garantir_motorista(usuario, viagem.fk_motorista)


DONO = Depends(viagem_do_motorista)


@roteador.get("", response_model=list[ViagemResposta], summary="Listar viagens (em ordem de saída)")
def listar_viagens(
    servico: Servico,
    usuario: Logado,
    data: date | None = None,
    turno: Turno | None = None,
    status_viagem: Annotated[StatusViagem | None, Query(alias="status")] = None,
    fk_motorista: Annotated[int | None, Query(gt=0)] = None,
    fk_rota: Annotated[int | None, Query(gt=0)] = None,
):
    if usuario.motorista:
        fk_motorista = usuario.fk_motorista
    return servico.listar(
        data=data, turno=turno, status=status_viagem, fk_motorista=fk_motorista, fk_rota=fk_rota
    )


# Rotas com nome fixo antes de "/{id_viagem}", senão "jornada" ou "calendario" seriam lidos como id.
@roteador.get(
    "/calendario",
    response_model=list[DiaDoCalendario],
    summary="Resumo de cada dia (viagens geradas, rotas do dia, feriados), para a faixa da semana",
)
def calendario(servico: Servico, inicio: date, fim: date):
    return servico.calendario(inicio, fim)


@roteador.get(
    "/jornada",
    response_model=JornadaResposta,
    summary="Jornada do motorista (todas as rotas dele no turno e sentido) com a fila única de passageiros",
    responses=erros(404),
)
def obter_jornada(
    jornada: Jornada,
    usuario: Logado,
    data: date,
    fk_motorista: Annotated[int, Query(gt=0)],
    turno: Turno,
    sentido: Sentido,
):
    garantir_motorista(usuario, fk_motorista)
    return jornada.obter(JornadaPedido(data=data, fk_motorista=fk_motorista, turno=turno, sentido=sentido))


@roteador.post(
    "/jornada/iniciar",
    dependencies=[OPERACAO],
    response_model=JornadaResposta,
    summary="Iniciar a jornada: todas as rotas agendadas do motorista saem juntas",
    responses=erros(404, 409),
)
def iniciar_jornada(dados: JornadaPedido, jornada: Jornada, usuario: Logado):
    garantir_motorista(usuario, dados.fk_motorista)
    return jornada.iniciar(dados)


@roteador.post(
    "/jornada/concluir",
    dependencies=[OPERACAO],
    response_model=JornadaResposta,
    summary="Concluir a jornada (quem ficou pendente vira ausente)",
    responses=erros(404, 409),
)
def concluir_jornada(dados: JornadaPedido, jornada: Jornada, usuario: Logado):
    garantir_motorista(usuario, dados.fk_motorista)
    return jornada.concluir(dados)


@roteador.post(
    "/gerar",
    dependencies=[ADMIN],
    response_model=GeracaoResposta,
    summary="Gerar as viagens e chamadas de um dia (pode repetir: não duplica)",
    responses=erros(409),
)
def gerar_viagens_do_dia(dados: GeracaoPedido, servico: Servico):
    return servico.gerar_dia(dados.data)


@roteador.get(
    "/{id_viagem}",
    dependencies=[DONO],
    response_model=ViagemDetalhe,
    summary="Buscar viagem com a lista de passageiros",
    responses=erros(404),
)
def obter_viagem(id_viagem: int, servico: Servico):
    return servico.obter(id_viagem, com_chamadas=True)


@roteador.post(
    "/{id_viagem}/iniciar",
    dependencies=[OPERACAO, DONO],
    response_model=ViagemResposta,
    summary="Iniciar viagem (grava o horário de saída)",
    responses=erros(404, 409),
)
def iniciar_viagem(id_viagem: int, servico: Servico):
    return servico.iniciar(id_viagem)


@roteador.post(
    "/{id_viagem}/concluir",
    dependencies=[OPERACAO, DONO],
    response_model=ViagemResposta,
    summary="Concluir viagem (quem ficou pendente vira ausente)",
    responses=erros(404, 409),
)
def concluir_viagem(id_viagem: int, servico: Servico):
    return servico.concluir(id_viagem)


@roteador.post(
    "/{id_viagem}/chamadas/{id_estudante}/embarque",
    dependencies=[OPERACAO, DONO],
    response_model=ViagemDetalhe,
    summary="Passageiro embarcou (presente, com o horário de agora)",
    responses=erros(404, 409),
)
def registrar_embarque(id_viagem: int, id_estudante: int, servico: Servico):
    return servico.registrar_embarque(id_viagem, id_estudante)


@roteador.post(
    "/{id_viagem}/chamadas/{id_estudante}/falta",
    dependencies=[OPERACAO, DONO],
    response_model=ViagemDetalhe,
    summary="Passageiro não embarcou (ausente)",
    responses=erros(404, 409),
)
def registrar_falta(id_viagem: int, id_estudante: int, servico: Servico):
    return servico.registrar_falta(id_viagem, id_estudante)


@roteador.post(
    "/{id_viagem}/chamadas/{id_estudante}/desembarque",
    dependencies=[OPERACAO, DONO],
    response_model=ViagemDetalhe,
    summary="Passageiro desceu no destino (faculdade na ida, casa na volta)",
    responses=erros(404, 409),
)
def registrar_desembarque(id_viagem: int, id_estudante: int, servico: Servico):
    return servico.registrar_desembarque(id_viagem, id_estudante)


@roteador.post(
    "/{id_viagem}/desembarque",
    dependencies=[OPERACAO, DONO],
    response_model=ViagemDetalhe,
    summary="Todos os que estão a bordo nesta rota desceram no destino",
    responses=erros(404, 409),
)
def desembarcar_todos(id_viagem: int, servico: Servico):
    return servico.desembarcar_todos(id_viagem)


@roteador.post(
    "/{id_viagem}/chamadas/{id_estudante}/desfazer",
    dependencies=[OPERACAO, DONO],
    response_model=ViagemDetalhe,
    summary="Desfazer o último registro (desembarque, embarque ou falta) marcado por engano",
    responses=erros(404, 409),
)
def desfazer_registro(id_viagem: int, id_estudante: int, servico: Servico):
    return servico.desfazer_registro(id_viagem, id_estudante)


@roteador.post(
    "/{id_viagem}/cancelar",
    dependencies=[ADMIN],
    response_model=ViagemResposta,
    summary="Cancelar viagem agendada",
    responses=erros(404, 409),
)
def cancelar_viagem(id_viagem: int, servico: Servico):
    return servico.cancelar(id_viagem)


@roteador.patch(
    "/{id_viagem}",
    dependencies=[ADMIN],
    response_model=ViagemResposta,
    summary="Trocar motorista e/ou veículo só nesta viagem",
    responses=erros(404, 409),
)
def substituir_na_viagem(id_viagem: int, dados: SubstituicaoPedido, servico: Servico):
    return servico.substituir(id_viagem, dados)
