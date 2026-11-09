#!/usr/bin/env bash
# PASSO 1 de 3 · Cria o banco SQLite com 5 registros de exemplo por tabela.
#
# Uso, na raiz do projeto (Git Bash, Linux ou macOS):
#   bash scripts/1-banco.sh          pergunta antes de apagar um banco que já existe
#   bash scripts/1-banco.sh --sim    apaga e recria sem perguntar
#
# Depois rode:  bash scripts/2-backend.sh   e, em outro terminal,  bash scripts/3-frontend.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

info() { printf '\033[1;36m==> %s\033[0m\n' "$*"; }
erro() { printf '\033[1;31mErro: %s\033[0m\n' "$*" >&2; exit 1; }

# Só precisa do Python (o sqlite3 já vem com ele). Usa o do backend se existir.
if [ -x backend/.venv/Scripts/python.exe ]; then
  PY="backend/.venv/Scripts/python.exe"
elif [ -x backend/.venv/bin/python ]; then
  PY="backend/.venv/bin/python"
else
  PY="$(command -v python3 || command -v python || command -v py || true)"
  [ -n "$PY" ] || erro "Python não encontrado. Instale o Python 3.12+."
fi

if [ ! -f .env ]; then
  info "Criando o .env a partir do .env.example"
  cp .env.example .env
fi

# Descobre o arquivo do banco pela DATABASE_URL do .env (padrão: backend/univan.db).
ARQUIVO="$("$PY" - <<'EOF'
import pathlib, sys
url = "sqlite:///backend/univan.db"
for linha in pathlib.Path(".env").read_text(encoding="utf-8").splitlines():
    if linha.startswith("DATABASE_URL="):
        url = linha.split("=", 1)[1].strip()
if not url.startswith("sqlite:///"):
    sys.exit("A DATABASE_URL do .env não é SQLite. Este script só cria banco SQLite.")
print(url.removeprefix("sqlite:///"))
EOF
)" || exit 1

if [ -f "$ARQUIVO" ] && [ "${1:-}" != "--sim" ]; then
  read -r -p "O banco $ARQUIVO já existe. Apagar e recriar com os dados de exemplo? [s/N] " RESPOSTA
  [[ "$RESPOSTA" =~ ^[sS]$ ]] || { info "Nada foi alterado."; exit 0; }
fi

info "Criando $ARQUIVO a partir de docs/univan-sqlite.sql"
"$PY" - "$ARQUIVO" <<'EOF'
import pathlib, sqlite3, sys

arquivo = pathlib.Path(sys.argv[1])
arquivo.parent.mkdir(parents=True, exist_ok=True)
temporario = arquivo.with_name(arquivo.name + ".novo")
temporario.unlink(missing_ok=True)

conexao = sqlite3.connect(temporario)
conexao.executescript(pathlib.Path("docs/univan-sqlite.sql").read_text(encoding="utf-8"))

# Fica com os registros 1 a 5 de cada tabela. Nos dados de teste eles só apontam
# uns para os outros, então nenhuma chave estrangeira fica quebrada.
conexao.executescript("""
    DELETE FROM chamada        WHERE fk_viagem > 5;
    DELETE FROM viagem         WHERE id > 5;
    DELETE FROM rota_dia       WHERE fk_rota > 5;
    DELETE FROM rota           WHERE id > 5;
    DELETE FROM titulo_receber WHERE id > 5;
    DELETE FROM titulo_pagar   WHERE id > 5;
    DELETE FROM dia_sem_aula   WHERE id > 5;
    DELETE FROM estudante      WHERE id > 5;
    DELETE FROM area           WHERE id > 5;
    DELETE FROM motorista      WHERE id > 5;
    DELETE FROM veiculo        WHERE id > 5;
    DELETE FROM instituicao    WHERE id > 5;
    DELETE FROM empresa        WHERE id > 5;
    -- endereços: só os usados pelas empresas, instituições e estudantes que ficaram
    DELETE FROM endereco WHERE id NOT IN (
        SELECT fk_endereco FROM empresa WHERE fk_endereco IS NOT NULL
        UNION SELECT fk_endereco FROM instituicao
        UNION SELECT fk_endereco FROM estudante);
""")

problemas = conexao.execute("PRAGMA foreign_key_check").fetchall()
if problemas:
    conexao.close()
    temporario.unlink()
    sys.exit(f"Chaves estrangeiras quebradas: {problemas}")
conexao.commit()
conexao.execute("VACUUM")

tabelas = [n for (n,) in conexao.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")]
for tabela in tabelas:
    total = conexao.execute(f"SELECT count(*) FROM {tabela}").fetchone()[0]
    print(f"   {tabela:<15} {total:>3} registros")
conexao.close()

# Só troca o banco antigo depois que o novo ficou pronto.
temporario.replace(arquivo)
EOF

info "Banco pronto. Próximo passo:  bash scripts/2-backend.sh"
