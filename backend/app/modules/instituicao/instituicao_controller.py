"""Rotas HTTP das instituições: consulta e ajuste do ponto de parada no mapa."""

from math import asin, cos, radians, sin, sqrt
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.documentacao import erros
from app.config.erros import ConflitoDeDados, DadosInvalidos, RecursoNaoEncontrado
from app.config.seguranca import ADMIN_OU_AUXILIAR, TODOS
from app.modules.instituicao.instituicao_model import Instituicao, InstituicaoParada
from app.modules.instituicao.instituicao_repositorio import RepositorioInstituicao
from app.modules.instituicao.instituicao_schema import InstituicaoResposta, ParadaExtraPedido, ParadaPedido

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
    instituicao = _instituicao(repositorio, id_instituicao)
    if dados.latitude is not None:
        _garantir_perto(instituicao, dados.latitude, dados.longitude)
    instituicao.parada_latitude = dados.latitude
    instituicao.parada_longitude = dados.longitude
    repositorio.salvar(instituicao)
    return repositorio.buscar_por_id(id_instituicao)


def _instituicao(repositorio: RepositorioInstituicao, id_instituicao: int) -> Instituicao:
    instituicao = repositorio.buscar_por_id(id_instituicao)
    if instituicao is None:
        raise RecursoNaoEncontrado("Instituição não encontrada.")
    return instituicao


def _garantir_perto(instituicao: Instituicao, latitude: float, longitude: float | None) -> None:
    """Parada é um ponto na rua em volta da faculdade, não outro endereço."""
    endereco = instituicao.endereco
    if longitude is None or endereco.latitude is None or endereco.longitude is None:
        return
    distancia = distancia_km((float(endereco.latitude), float(endereco.longitude)), (latitude, longitude))
    if distancia > DISTANCIA_MAXIMA_KM:
        raise DadosInvalidos(
            f"O ponto de parada ficou a {distancia:.1f} km da faculdade. Coloque-o na rua em volta do campus "
            f"(até {DISTANCIA_MAXIMA_KM:g} km); para outro endereço, altere o cadastro da instituição."
        )


def _garantir_nome_livre(instituicao: Instituicao, nome: str, id_parada: int | None = None) -> None:
    if any(p.nome.lower() == nome.lower() and p.id != id_parada for p in instituicao.paradas):
        raise ConflitoDeDados(f"Já existe a parada {nome} nesta faculdade.")


@roteador.post(
    "/{id_instituicao}/paradas",
    dependencies=[ADMIN_OU_AUXILIAR],
    response_model=InstituicaoResposta,
    status_code=201,
    summary="Adicionar uma parada extra (ex.: Biopráticas, fundos do campus)",
    responses=erros(404, 409),
)
def adicionar_parada_extra(id_instituicao: int, dados: ParadaExtraPedido, repositorio: Repositorio):
    instituicao = _instituicao(repositorio, id_instituicao)
    _garantir_perto(instituicao, dados.latitude, dados.longitude)
    _garantir_nome_livre(instituicao, dados.nome)
    instituicao.paradas.append(InstituicaoParada(nome=dados.nome, latitude=dados.latitude, longitude=dados.longitude))
    repositorio.salvar(instituicao)
    return repositorio.buscar_por_id(id_instituicao)


@roteador.put(
    "/{id_instituicao}/paradas/{id_parada}",
    dependencies=[ADMIN_OU_AUXILIAR],
    response_model=InstituicaoResposta,
    summary="Renomear ou mover uma parada extra",
    responses=erros(404, 409),
)
def alterar_parada_extra(id_instituicao: int, id_parada: int, dados: ParadaExtraPedido, repositorio: Repositorio):
    instituicao = _instituicao(repositorio, id_instituicao)
    parada = repositorio.buscar_parada(id_instituicao, id_parada)
    if parada is None:
        raise RecursoNaoEncontrado("Parada não encontrada.")
    _garantir_perto(instituicao, dados.latitude, dados.longitude)
    _garantir_nome_livre(instituicao, dados.nome, id_parada)
    parada.nome, parada.latitude, parada.longitude = dados.nome, dados.latitude, dados.longitude
    repositorio.salvar(instituicao)
    return repositorio.buscar_por_id(id_instituicao)


@roteador.delete(
    "/{id_instituicao}/paradas/{id_parada}",
    dependencies=[ADMIN_OU_AUXILIAR],
    response_model=InstituicaoResposta,
    summary="Remover uma parada extra (quem usava volta para a parada principal)",
    responses=erros(404, 409),
)
def remover_parada_extra(id_instituicao: int, id_parada: int, repositorio: Repositorio):
    _instituicao(repositorio, id_instituicao)
    parada = repositorio.buscar_parada(id_instituicao, id_parada)
    if parada is None:
        raise RecursoNaoEncontrado("Parada não encontrada.")
    repositorio.remover_parada(parada)
    return repositorio.buscar_por_id(id_instituicao)
