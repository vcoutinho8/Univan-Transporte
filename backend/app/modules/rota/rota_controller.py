"""Rotas HTTP das rotas (trajetos fixos motorista + instituição + turno)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.documentacao import erros
from app.config.seguranca import ADMIN_OU_AUXILIAR
from app.modules.estudante.estudante_schema import EstudanteResposta
from app.modules.instituicao.instituicao_repositorio import RepositorioInstituicao
from app.modules.motorista.motorista_repositorio import RepositorioMotorista
from app.modules.rota.rota_repositorio import RepositorioRota
from app.modules.rota.rota_schema import RotaAtualizacao, RotaCriacao, RotaResposta
from app.modules.rota.rota_servico import ServicoRota
from app.shared.enums import StatusCadastro

roteador = APIRouter(prefix="/rotas", tags=["Rotas"], dependencies=[ADMIN_OU_AUXILIAR])


def obter_servico_rota(sessao: Annotated[Session, Depends(obter_sessao)]) -> ServicoRota:
    return ServicoRota(RepositorioRota(sessao), RepositorioMotorista(sessao), RepositorioInstituicao(sessao))


Servico = Annotated[ServicoRota, Depends(obter_servico_rota)]


@roteador.get("", response_model=list[RotaResposta], summary="Listar rotas (com total de passageiros)")
def listar_rotas(
    servico: Servico,
    status_rota: Annotated[StatusCadastro | None, Query(alias="status")] = None,
    fk_motorista: Annotated[int | None, Query(gt=0)] = None,
):
    return servico.listar(status=status_rota, fk_motorista=fk_motorista)


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
