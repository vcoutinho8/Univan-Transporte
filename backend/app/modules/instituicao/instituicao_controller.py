"""Rotas HTTP das instituições: consulta e ajuste do ponto de parada no mapa."""

from math import asin, cos, radians, sin, sqrt
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.documentacao import erros
from app.config.erros import DadosInvalidos, RecursoNaoEncontrado
from app.config.seguranca import ADMIN_OU_AUXILIAR, TODOS
from app.modules.instituicao.instituicao_repositorio import RepositorioInstituicao
from app.modules.instituicao.instituicao_schema import InstituicaoResposta, ParadaPedido

roteador = APIRouter(prefix="/instituicoes", tags=["Instituições"], dependencies=[TODOS])

# Um ajuste de pino, não uma mudança de endereço: a parada fica perto da faculdade.
DISTANCIA_MAXIMA_KM = 1.0


def distancia_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distância em linha reta entre dois pontos (fórmula de haversine)."""
    lat1, lng1, lat2, lng2 = map(radians, (*a, *b))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lng2 - lng1) / 2) ** 2
    return 2 * 6371 * asin(sqrt(h))


def obter_repositorio_instituicao(sessao: Annotated[Session, Depends(obter_sessao)]) -> RepositorioInstituicao:
    return RepositorioInstituicao(sessao)


Repositorio = Annotated[RepositorioInstituicao, Depends(obter_repositorio_instituicao)]


@roteador.get("", response_model=list[InstituicaoResposta], summary="Listar instituições")
def listar_instituicoes(repositorio: Repositorio):
    return repositorio.listar()


@roteador.patch(
    "/{id_instituicao}/parada",
    dependencies=[ADMIN_OU_AUXILIAR],
    response_model=InstituicaoResposta,
    summary="Ajustar o ponto de parada na rua (vazio = volta a usar o endereço)",
    responses=erros(404, 409),
)
def ajustar_parada(id_instituicao: int, dados: ParadaPedido, repositorio: Repositorio):
    instituicao = repositorio.buscar_por_id(id_instituicao)
    if instituicao is None:
        raise RecursoNaoEncontrado("Instituição não encontrada.")
    endereco = instituicao.endereco
    if dados.latitude is not None and endereco.latitude is not None and endereco.longitude is not None:
        distancia = distancia_km((float(endereco.latitude), float(endereco.longitude)), (dados.latitude, dados.longitude))
        if distancia > DISTANCIA_MAXIMA_KM:
            raise DadosInvalidos(
                f"O ponto de parada ficou a {distancia:.1f} km da faculdade. Coloque-o na rua em frente "
                f"(até {DISTANCIA_MAXIMA_KM:g} km); para outro endereço, altere o cadastro da instituição."
            )
    instituicao.parada_latitude = dados.latitude
    instituicao.parada_longitude = dados.longitude
    repositorio.salvar(instituicao)
    return repositorio.buscar_por_id(id_instituicao)
