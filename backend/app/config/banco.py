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


# Colunas criadas depois da primeira versão do script: (tabela, coluna, tipo).
# Um banco criado antes delas ganha a coluna ao subir a API (os dados são mantidos).
COLUNAS_NOVAS = (
    ("motorista", "apelido", "TEXT"),
    ("instituicao", "parada_latitude", "NUMERIC"),
    ("instituicao", "parada_longitude", "NUMERIC"),
    ("chamada", "horario_desembarque", "TEXT"),
    ("motorista", "fk_endereco", "INTEGER REFERENCES endereco (id)"),
    ("estudante", "fk_parada", "INTEGER REFERENCES instituicao_parada (id)"),
    ("viagem", "motivo_encerramento", "TEXT"),
    ("usuario", "email", "TEXT"),
    ("usuario", "cpf", "TEXT"),
    ("usuario", "trocar_senha", "INTEGER NOT NULL DEFAULT 0"),
    ("instituicao", "codigo_inep", "INTEGER"),
    ("usuario", "pediu_senha_em", "TEXT"),
    ("empresa", "responsavel", "TEXT"),
    ("empresa", "status", "TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'em_negociacao', 'inativa'))"),
    ("empresa", "valor_assinatura", "NUMERIC NOT NULL DEFAULT 199.90"),
    ("empresa", "motivo_inativacao", "TEXT"),
)


# Tabelas criadas depois da primeira versão do script: num banco antigo, são criadas (com os dados
# de teste delas) a partir do próprio docs/univan-sqlite.sql.
TABELAS_NOVAS = ("usuario", "instituicao_parada", "feriado_importado", "assinatura_pagamento")


def _sql_da_tabela(tabela: str) -> str:
    """CREATE TABLE e INSERTs da tabela, copiados de docs/univan-sqlite.sql."""
    script = SCRIPT_SQLITE.read_text(encoding="utf-8")
    inicio = script.index(f"CREATE TABLE {tabela} (")
    criar = script[inicio : script.index(");", inicio) + 2]
    inserts = [linha for linha in script.splitlines() if linha.startswith(f"INSERT INTO {tabela} VALUES")]
    return "\n".join([criar, *inserts])


def atualizar_estrutura(arquivo: Path) -> None:
    """Completa um banco antigo: tabelas de TABELAS_NOVAS e colunas de COLUNAS_NOVAS que faltarem."""
    conexao = sqlite3.connect(arquivo)
    try:
        existentes_tabelas = {linha[0] for linha in conexao.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        for tabela in TABELAS_NOVAS:
            if existentes_tabelas and tabela not in existentes_tabelas:
                log.warning("Banco %s: criando a tabela %s.", arquivo.name, tabela)
                conexao.executescript(_sql_da_tabela(tabela))
                # Assinatura de exemplo de uma empresa que este banco não tem: fica de fora.
                orfaos = conexao.execute(f"PRAGMA foreign_key_check({tabela})").fetchall() if tabela == "assinatura_pagamento" else []
                for (_, rowid, *_resto) in orfaos:
                    conexao.execute(f"DELETE FROM {tabela} WHERE rowid = ?", (rowid,))
        for tabela, coluna, tipo in COLUNAS_NOVAS:
            existentes = {linha[1] for linha in conexao.execute(f"PRAGMA table_info({tabela})")}
            if existentes and coluna not in existentes:
                log.warning("Banco %s: adicionando a coluna %s.%s.", arquivo.name, tabela, coluna)
                conexao.execute(f"ALTER TABLE {tabela} ADD COLUMN {coluna} {tipo}")
        _perfil_univan(conexao, arquivo)
        conexao.commit()
    finally:
        conexao.close()


def _perfil_univan(conexao: sqlite3.Connection, arquivo: Path) -> None:
    """O SQLite não muda um CHECK: recria a tabela usuario (com os dados) para aceitar o perfil
    univan e, se faltar, cria o login único do gerente do app (univan / 123456)."""
    tabelas = {nome for (nome,) in conexao.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    if not {"usuario", "empresa"} <= tabelas:
        return
    (sql,) = conexao.execute("SELECT sql FROM sqlite_master WHERE name = 'usuario'").fetchone()
    if "'univan'" not in sql:
        log.warning("Banco %s: atualizando a tabela usuario (perfil univan).", arquivo.name)
        colunas = [linha[1] for linha in conexao.execute("PRAGMA table_info(usuario)")]
        conexao.execute("PRAGMA foreign_keys = OFF")
        conexao.execute("ALTER TABLE usuario RENAME TO usuario_antigo")
        conexao.executescript(_sql_da_tabela("usuario").split("\nINSERT")[0])
        lista = ", ".join(colunas)
        conexao.execute(f"INSERT INTO usuario ({lista}) SELECT {lista} FROM usuario_antigo")
        conexao.execute("DROP TABLE usuario_antigo")
        conexao.execute("PRAGMA foreign_keys = ON")
    tem_empresa = conexao.execute("SELECT 1 FROM empresa").fetchone()
    if tem_empresa and not conexao.execute("SELECT 1 FROM usuario WHERE perfil = 'univan'").fetchone():
        from app.config.seguranca import gerar_hash

        conexao.execute(
            "INSERT INTO usuario (fk_empresa, nome, login, senha_hash, perfil, status, trocar_senha) "
            "VALUES ((SELECT min(id) FROM empresa), 'Gerente UniVan', 'univan', ?, 'univan', 'ativo', 0)",
            (gerar_hash("123456"),),
        )


def preparar_banco(url: str) -> None:
    """Se o arquivo do banco ainda não existir, cria a partir do script; se existir, completa a estrutura."""
    endereco = make_url(url)
    if endereco.database in (None, "", ":memory:"):
        return
    arquivo = Path(endereco.database)
    if not arquivo.exists():
        log.warning("Banco %s não encontrado. Criando a partir de %s.", arquivo, SCRIPT_SQLITE.name)
        criar_banco_sqlite(arquivo)
    else:
        atualizar_estrutura(arquivo)


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
