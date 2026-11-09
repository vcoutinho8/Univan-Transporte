"""Conexão com o banco SQLite via SQLAlchemy.

O banco é um arquivo (por padrão backend/univan.db). Ele é criado por `scripts/1-banco.sh`
(5 registros de exemplo por tabela) ou, se ainda não existir quando a API subir, a partir de
docs/univan-sqlite.sql (dados de teste completos).

A aplicação NÃO cria nem altera tabelas pelos models: a estrutura vem sempre do script em docs/.
"""

import logging
import sqlite3
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session, sessionmaker

from app.config.configuracoes import RAIZ_PROJETO, obter_configuracoes

SCRIPT_SQLITE = RAIZ_PROJETO / "docs" / "univan-sqlite.sql"

log = logging.getLogger("univan.banco")


def criar_motor(url: str, exibir_sql: bool = False) -> Engine:
    """Cria o engine do SQLAlchemy para o arquivo SQLite."""
    if make_url(url).get_backend_name() != "sqlite":
        raise ValueError(
            f"DATABASE_URL inválida: {url!r}. O UniVan usa SQLite, ex.: sqlite:///backend/univan.db"
        )
    motor = create_engine(
        url,
        echo=exibir_sql,
        # O FastAPI atende requisições em várias threads.
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(motor, "connect")
    def _ligar_chaves_estrangeiras(conexao, _):
        # O SQLite só confere chaves estrangeiras se isso for ligado em cada conexão.
        cursor = conexao.cursor()
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.close()

    return motor


def criar_banco_sqlite(arquivo: Path, script: Path = SCRIPT_SQLITE) -> None:
    """Cria o arquivo do SQLite com as tabelas e os dados de teste de docs/univan-sqlite.sql."""
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    conexao = sqlite3.connect(arquivo)
    try:
        conexao.executescript(script.read_text(encoding="utf-8"))
    finally:
        conexao.close()


def preparar_banco(url: str) -> None:
    """Se o arquivo do banco ainda não existir, cria a partir do script."""
    endereco = make_url(url)
    if endereco.database in (None, "", ":memory:"):
        return
    arquivo = Path(endereco.database)
    if not arquivo.exists():
        log.warning("Banco %s não encontrado. Criando a partir de %s.", arquivo, SCRIPT_SQLITE.name)
        criar_banco_sqlite(arquivo)


configuracoes = obter_configuracoes()

motor = criar_motor(configuracoes.url_banco_resolvida, configuracoes.exibir_sql)

FabricaSessao = sessionmaker(bind=motor, autoflush=False, expire_on_commit=False)


def obter_sessao() -> Iterator[Session]:
    """Dependência do FastAPI: abre uma sessão por requisição e fecha ao final."""
    sessao = FabricaSessao()
    try:
        yield sessao
    finally:
        sessao.close()
