"""Garante que os models espelham exatamente as tabelas de docs/univan-sqlite.sql.

O script é carregado de verdade num SQLite em memória. Se alguém criar/remover um campo no
model sem existir no banco (ou vice-versa), ou mudar os valores aceitos por um enum, este
teste falha.
"""

import re
import sqlite3
from enum import Enum
from pathlib import Path

import pytest
from sqlalchemy.orm import configure_mappers

import app.modules  # noqa: F401  (registra todos os models na Base)
from app.shared import enums as modulo_enums
from app.shared.base import Base

SCRIPT_SQLITE = Path(__file__).resolve().parents[2] / "docs" / "univan-sqlite.sql"


@pytest.fixture(scope="module")
def banco():
    conexao = sqlite3.connect(":memory:")
    conexao.executescript(SCRIPT_SQLITE.read_text(encoding="utf-8"))
    yield conexao
    conexao.close()


def _tabelas_do_banco(conexao) -> dict[str, set[str]]:
    nomes = [n for (n,) in conexao.execute("SELECT name FROM sqlite_master WHERE type = 'table'")]
    return {n: {linha[1] for linha in conexao.execute(f"PRAGMA table_info({n})")} for n in nomes}


def _enums_do_banco(conexao) -> dict[tuple[str, str], list[str]]:
    """Lê os CHECK (coluna IN (...)) que fazem o papel dos enums: (tabela, coluna) -> valores."""
    valores = {}
    for tabela, sql in conexao.execute("SELECT name, sql FROM sqlite_master WHERE type = 'table'"):
        for coluna, lista in re.findall(r"CHECK \(\s*(\w+) IN \(([^)]*)\)\s*\)", sql):
            valores[(tabela, coluna)] = re.findall(r"'(\w+)'", lista)
    return valores


def _colunas_enum_dos_models():
    """(tabela, coluna) -> tipo Enum do SQLAlchemy."""
    return {
        (tabela.name, coluna.name): coluna.type
        for tabela in Base.metadata.tables.values()
        for coluna in tabela.columns
        if getattr(coluna.type, "enum_class", None) is not None
    }


def test_mesmas_tabelas_do_banco(banco):
    assert set(Base.metadata.tables) == set(_tabelas_do_banco(banco))


@pytest.mark.parametrize("tabela", sorted(Base.metadata.tables))
def test_mesmas_colunas_do_banco(tabela, banco):
    colunas_model = {c.name for c in Base.metadata.tables[tabela].columns}
    assert colunas_model == _tabelas_do_banco(banco)[tabela]


def test_mesmos_enums_do_banco(banco):
    usados = {chave: list(tipo.enums) for chave, tipo in _colunas_enum_dos_models().items()}
    assert usados == _enums_do_banco(banco)


def test_todo_enum_python_e_usado():
    declarados = {
        valor
        for valor in vars(modulo_enums).values()
        if isinstance(valor, type) and issubclass(valor, Enum) and valor.__module__ == modulo_enums.__name__
    }
    usados = {tipo.enum_class for tipo in _colunas_enum_dos_models().values()}
    assert declarados == usados


def test_relacionamentos_configuram_sem_erro():
    configure_mappers()
