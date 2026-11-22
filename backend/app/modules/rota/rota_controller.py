"""Rotas HTTP das rotas (trajetos fixos motorista + instituição + turno)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.configuracoes import obter_configuracoes
from app.config.documentacao import erros
from app.config.seguranca import ADMIN_OU_AUXILIAR
from app.modules.estudante.estudante_schema import EstudanteResposta
from app.modules.instituicao.instituicao_repositorio import RepositorioInstituicao
from app.modules.motorista.motorista_repositorio import RepositorioMotorista
from app.modules.rota.ordem_schema import OrdemPedido, OrdemResposta
from app.modules.rota.ordem_servico import ServicoOrdem
from app.modules.rota.rota_repositorio import RepositorioRota
from app.modules.rota.rota_schema import RotaAtualizacao, RotaCriacao, RotaResposta
from app.modules.rota.rota_servico import ServicoRota
from app.shared.enums import StatusCadastro, Turno

roteador = APIRouter(prefix="/rotas", tags=["Rotas"], dependencies=[ADMIN_OU_AUXILIAR])


def obter_servico_rota(sessao: Annotated[Session, Depends(obter_sessao)]) -> ServicoRota:
    return ServicoRota(RepositorioRota(sessao), RepositorioMotorista(sessao), RepositorioInstituicao(sessao))


Servico = Annotated[ServicoRota, Depends(obter_servico_rota)]


def obter_servico_ordem(sessao: Annotated[Session, Depends(obter_sessao)]) -> ServicoOrdem:
    return ServicoOrdem(sessao, obter_configuracoes().url_osrm)


Ordem = Annotated[ServicoOrdem, Depends(obter_servico_ordem)]


@roteador.get("", response_model=list[RotaResposta], summary="Listar rotas (com total de passageiros)")
def listar_rotas(
    servico: Servico,
    status_rota: Annotated[StatusCadastro | None, Query(alias="status")] = None,
    fk_motorista: Annotated[int | None, Query(gt=0)] = None,
):
    return servico.listar(status=status_rota, fk_motorista=fk_motorista)


# ------------------------------------------------------------------ ordem das paradas (antes de /{id_rota})


@roteador.get(
    "/ordem",
    response_model=OrdemResposta,
    summary="Ordem das paradas de um motorista no turno: a atual e a melhor (calculada)",
    description="Sai da casa do motorista, busca os passageiros de todas as rotas dele no turno e termina nas "
    "paradas das faculdades. A sugerida usa tempos reais pelas ruas (OSRM) e heurísticas do caixeiro viajante "
    "(vizinho mais próximo + 2-opt + or-opt).",
    responses=erros(404),
)
def ordem_das_paradas(ordem: Ordem, fk_motorista: Annotated[int, Query(gt=0)], turno: Turno):
    return ordem.calcular(fk_motorista, turno)


@roteador.post(
    "/ordem/simular",
    response_model=OrdemResposta,
    summary="Horários e totais de uma ordem escolhida à mão (não grava)",
    responses=erros(404, 409),
)
def simular_ordem(dados: OrdemPedido, ordem: Ordem):
    return ordem.simular(dados.fk_motorista, dados.turno, dados.ordem)


@roteador.put(
    "/ordem",
    response_model=OrdemResposta,
    summary="Aplicar uma ordem: grava o horário de embarque de cada passageiro",
    responses=erros(404, 409),
)
def aplicar_ordem(dados: OrdemPedido, ordem: Ordem):
    return ordem.aplicar(dados.fk_motorista, dados.turno, dados.ordem)


@roteador.get("/{id_rota}", response_model=RotaResposta, summary="Buscar rota", responses=erros(404))
def obter_rota(id_rota: int, servico: Servico):
    return servico.obter(id_rota)


@roteador.get(
    "/{id_rota}/passageiros",
    response_model=list[EstudanteResposta],
    summary="Passageiros da rota, na ordem de embarque (mesma regra do gerar_dia)",
    responses=erros(404),
)
def listar_passageiros_da_rota(id_rota: int, servico: Servico):
    return servico.passageiros(id_rota)


@roteador.post("", response_model=RotaResposta, status_code=status.HTTP_201_CREATED, summary="Cadastrar rota", responses=erros(409))
def cadastrar_rota(dados: RotaCriacao, servico: Servico):
    return servico.cadastrar(dados)


@roteador.patch("/{id_rota}", response_model=RotaResposta, summary="Alterar rota", responses=erros(404, 409))
def atualizar_rota(id_rota: int, dados: RotaAtualizacao, servico: Servico):
    return servico.atualizar(id_rota, dados)


@roteador.delete("/{id_rota}", response_model=RotaResposta, summary="Inativar rota (não apaga)", responses=erros(404, 409))
def inativar_rota(id_rota: int, servico: Servico):
    return servico.inativar(id_rota)
