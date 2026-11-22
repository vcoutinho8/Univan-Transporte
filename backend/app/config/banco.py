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
    *((tabela, "fk_empresa", "INTEGER REFERENCES empresa (id)") for tabela in (
        "instituicao", "estudante", "area", "rota", "viagem", "chamada", "titulo_receber", "dia_sem_aula")),
)

# Banco de antes da separação por empresa: cada registro herda a empresa de quem ele depende (na
# falta, a primeira empresa, que era a única). O dia sem aula geral fica de todas (feriado nacional).
EMPRESA_DOS_DADOS = """
UPDATE instituicao    SET fk_empresa = (SELECT min(id) FROM empresa) WHERE fk_empresa IS NULL;
UPDATE area           SET fk_empresa = (SELECT fk_empresa FROM motorista m WHERE m.id = area.fk_motorista) WHERE fk_empresa IS NULL;
UPDATE rota           SET fk_empresa = (SELECT fk_empresa FROM motorista m WHERE m.id = rota.fk_motorista) WHERE fk_empresa IS NULL;
UPDATE estudante      SET fk_empresa = coalesce((SELECT fk_empresa FROM area a WHERE a.id = estudante.fk_area),
                                                (SELECT fk_empresa FROM instituicao i WHERE i.id = estudante.fk_instituicao)) WHERE fk_empresa IS NULL;
UPDATE viagem         SET fk_empresa = (SELECT fk_empresa FROM rota r WHERE r.id = viagem.fk_rota) WHERE fk_empresa IS NULL;
UPDATE chamada        SET fk_empresa = (SELECT fk_empresa FROM viagem v WHERE v.id = chamada.fk_viagem) WHERE fk_empresa IS NULL;
UPDATE titulo_receber SET fk_empresa = (SELECT fk_empresa FROM estudante e WHERE e.id = titulo_receber.fk_estudante) WHERE fk_empresa IS NULL;
UPDATE dia_sem_aula   SET fk_empresa = (SELECT fk_empresa FROM instituicao i WHERE i.id = dia_sem_aula.fk_instituicao)
    WHERE fk_empresa IS NULL AND fk_instituicao IS NOT NULL;
DROP INDEX IF EXISTS dia_sem_aula_data_fk_instituicao_key;
CREATE UNIQUE INDEX dia_sem_aula_data_fk_instituicao_key ON dia_sem_aula (data, ifnull(fk_instituicao, -1), ifnull(fk_empresa, -1));
"""

# Login de antes: o gestor passa a entrar com o CNPJ (e o nome da empresa), o motorista com o CPF do
# cadastro e o auxiliar com o CPF dele (sem CPF, o gestor informa em Configurações > Usuários).
LOGINS_POR_DOCUMENTO = """
UPDATE OR IGNORE usuario SET login = (SELECT cnpj FROM empresa e WHERE e.id = usuario.fk_empresa)
    WHERE perfil = 'admin' AND login GLOB '*[^0-9]*';
UPDATE usuario SET nome = (SELECT coalesce(nome_fantasia, razao_social) FROM empresa e WHERE e.id = usuario.fk_empresa)
    WHERE perfil = 'admin' AND nome = 'Administrador';
UPDATE OR IGNORE usuario SET login = (SELECT cpf FROM motorista m WHERE m.id = usuario.fk_motorista)
    WHERE perfil = 'motorista' AND login GLOB '*[^0-9]*';
UPDATE OR IGNORE usuario SET login = cpf WHERE perfil = 'auxiliar' AND cpf IS NOT NULL AND login GLOB '*[^0-9]*';
"""


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
        if {"empresa", "usuario", "motorista", "rota", "dia_sem_aula"} <= {t for (t,) in conexao.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}:
            conexao.executescript(EMPRESA_DOS_DADOS + LOGINS_POR_DOCUMENTO)
            _gestor_de_cada_empresa(conexao)
            _gatilhos_por_empresa(conexao)
        conexao.commit()
    finally:
        conexao.close()


def _gatilhos_por_empresa(conexao: sqlite3.Connection) -> None:
    """Gatilhos de antes da separação por empresa achavam o bairro do passageiro em qualquer empresa:
    recria os de docs/univan-sqlite.sql (que só olham os bairros da empresa dele)."""
    script = SCRIPT_SQLITE.read_text(encoding="utf-8")
    for nome in ("tg_estudante_area_insert", "tg_estudante_area_update"):
        (atual,) = conexao.execute("SELECT ifnull(max(sql), '') FROM sqlite_master WHERE type = 'trigger' AND name = ?", (nome,)).fetchone()
        if "fk_empresa" not in atual:
            inicio = script.index(f"CREATE TRIGGER {nome}")
            conexao.executescript(f"DROP TRIGGER IF EXISTS {nome}; " + script[inicio : script.index("END;", inicio) + 4])


def _gestor_de_cada_empresa(conexao: sqlite3.Connection) -> None:
    """Empresa sem gestor ganha o acesso dele: login = CNPJ, senha 123456 (trocada no primeiro acesso)."""
    from app.config.seguranca import gerar_hash

    conexao.execute(
        "INSERT INTO usuario (fk_empresa, nome, login, senha_hash, perfil, status, trocar_senha) "
        "SELECT e.id, coalesce(e.nome_fantasia, e.razao_social), e.cnpj, ?, 'admin', 'ativo', 1 FROM empresa e "
        "WHERE NOT EXISTS (SELECT 1 FROM usuario u WHERE u.fk_empresa = e.id AND u.perfil = 'admin') "
        "AND NOT EXISTS (SELECT 1 FROM usuario u WHERE u.login = e.cnpj)",
        (gerar_hash("123456"),),
    )


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
