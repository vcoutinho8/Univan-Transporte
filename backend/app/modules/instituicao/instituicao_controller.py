"""Rotas HTTP das instituições: consulta e ajuste do ponto de parada no mapa."""

import csv
import unicodedata
from functools import cache
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.documentacao import erros
from app.config.erros import ConflitoDeDados, DadosInvalidos, RecursoNaoEncontrado
from app.config.seguranca import ADMIN, ADMIN_OU_AUXILIAR, TODOS
from app.modules.endereco.endereco_model import Endereco
from app.modules.instituicao.instituicao_model import Instituicao, InstituicaoParada
from app.modules.instituicao.instituicao_repositorio import RepositorioInstituicao
from app.modules.instituicao.instituicao_schema import (
    FaculdadeDoCatalogo,
    InstituicaoAlteracao,
    InstituicaoNova,
    InstituicaoResposta,
    ParadaExtraPedido,
    ParadaPedido,
)

roteador = APIRouter(prefix="/instituicoes", tags=["Instituições"], dependencies=[TODOS])

def obter_repositorio_instituicao(sessao: Annotated[Session, Depends(obter_sessao)]) -> RepositorioInstituicao:
    return RepositorioInstituicao(sessao)


Repositorio = Annotated[RepositorioInstituicao, Depends(obter_repositorio_instituicao)]


# Cadastro oficial das faculdades (Censo da Educação Superior 2024/INEP, 2.561 IES). Vai junto
# com a API: a busca funciona mesmo sem internet. shortcut: arquivo de 2024, atualizar com o censo
# novo (download.inep.gov.br/microdados) quando faltar alguma faculdade recente.
CATALOGO = Path(__file__).with_name("catalogo_ies.csv")


def _sem_acento(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()


@cache
def _catalogo() -> list[dict]:
    with CATALOGO.open(encoding="utf-8") as arquivo:
        return [linha | {"_busca": _sem_acento(f"{linha['nome']} {linha['sigla']} {linha['municipio']}")} for linha in csv.DictReader(arquivo, delimiter=";")]


@roteador.get(
    "/catalogo",
    response_model=list[FaculdadeDoCatalogo],
    summary="Buscar faculdades do cadastro oficial (INEP/e-MEC) por UF e nome",
)
def buscar_no_catalogo(
    uf: str = Query(min_length=2, max_length=2, description="Sigla do estado (ex.: ES)."),
    busca: str = Query(default="", max_length=60, description="Parte do nome, sigla ou cidade (sem ligar para acento)."),
):
    termos = _sem_acento(busca).split()
    return [l for l in _catalogo() if l["uf"] == uf.upper() and all(t in l["_busca"] for t in termos)][:100]


@roteador.get("", response_model=list[InstituicaoResposta], summary="Listar instituições")
def listar_instituicoes(repositorio: Repositorio):
    return repositorio.listar()


@roteador.post(
    "",
    response_model=InstituicaoResposta,
    status_code=201,
    dependencies=[ADMIN],
    summary="Criar instituição (faculdade de destino)",
    responses=erros(409, 422),
)
def criar_instituicao(dados: InstituicaoNova, repositorio: Repositorio):
    _garantir_unica(repositorio, dados.nome, dados.codigo_inep)
    return repositorio.salvar(
        Instituicao(nome=dados.nome, codigo_inep=dados.codigo_inep, endereco=Endereco(**dados.endereco.model_dump()))
    )


def _garantir_unica(repositorio: RepositorioInstituicao, nome: str | None, codigo: int | None, id_atual: int | None = None) -> None:
    """A mesma faculdade (pelo código do INEP ou pelo nome) não entra duas vezes."""
    for outra in repositorio.listar():
        if outra.id != id_atual and ((codigo and outra.codigo_inep == codigo) or (nome and outra.nome.lower() == nome.lower())):
            raise ConflitoDeDados(f"A {outra.nome} já está cadastrada.")


@roteador.delete(
    "/{id_instituicao}",
    response_model=InstituicaoResposta,
    dependencies=[ADMIN],
    summary="Excluir instituição (só se nenhum passageiro, rota ou dia sem aula usa ela)",
    responses=erros(404, 409),
)
def excluir_instituicao(id_instituicao: int, repositorio: Repositorio):
    instituicao = _instituicao(repositorio, id_instituicao)
    sessao = repositorio.sessao
    uso = {
        "passageiro(s)": "SELECT count(*) FROM estudante WHERE fk_instituicao = :id",
        "rota(s)": "SELECT count(*) FROM rota WHERE fk_instituicao = :id",
        "dia(s) sem aula": "SELECT count(*) FROM dia_sem_aula WHERE fk_instituicao = :id",
    }
    em_uso = [f"{n} {rotulo}" for rotulo, sql in uso.items() if (n := sessao.scalar(text(sql), {"id": id_instituicao}))]
    if em_uso:
        raise ConflitoDeDados(f"A {instituicao.nome} ainda é usada por {', '.join(em_uso)}. Troque esses cadastros antes de excluir.")
    excluida = InstituicaoResposta.model_validate(instituicao)
    endereco = instituicao.endereco
    sessao.delete(instituicao)
    sessao.delete(endereco)
    sessao.commit()
    return excluida


@roteador.put(
    "/{id_instituicao}",
    response_model=InstituicaoResposta,
    dependencies=[ADMIN],
    summary="Alterar nome ou endereço da instituição",
    responses=erros(404, 422),
)
def alterar_instituicao(id_instituicao: int, dados: InstituicaoAlteracao, repositorio: Repositorio):
    instituicao = repositorio.buscar_por_id(id_instituicao)
    if instituicao is None:
        raise RecursoNaoEncontrado("Instituição não encontrada.")
    _garantir_unica(repositorio, dados.nome, dados.codigo_inep, instituicao.id)
    if dados.nome is not None:
        instituicao.nome = dados.nome
    if dados.codigo_inep is not None:
        instituicao.codigo_inep = dados.codigo_inep
    if dados.endereco is not None:
        for campo, valor in dados.endereco.model_dump().items():
            setattr(instituicao.endereco, campo, valor)
    return repositorio.salvar(instituicao)


@roteador.patch(
    "/{id_instituicao}/parada",
    dependencies=[ADMIN_OU_AUXILIAR],
    response_model=InstituicaoResposta,
    summary="Ajustar o ponto de parada na rua (vazio = volta a usar o endereço)",
    responses=erros(404, 409),
)
def ajustar_parada(id_instituicao: int, dados: ParadaPedido, repositorio: Repositorio):
    instituicao = _instituicao(repositorio, id_instituicao)
    instituicao.parada_latitude = dados.latitude
    instituicao.parada_longitude = dados.longitude
    repositorio.salvar(instituicao)
    return repositorio.buscar_por_id(id_instituicao)


def _instituicao(repositorio: RepositorioInstituicao, id_instituicao: int) -> Instituicao:
    instituicao = repositorio.buscar_por_id(id_instituicao)
    if instituicao is None:
        raise RecursoNaoEncontrado("Instituição não encontrada.")
    return instituicao


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
