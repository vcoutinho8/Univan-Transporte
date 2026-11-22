#!/usr/bin/env bash
# PASSO 1 de 3 · Cria o banco SQLite com os dados de demonstração: 2 empresas (Guarapari Vans e
# Rota Certa), cada uma com gestor, 2 auxiliares, 2 motoristas, passageiros, viagens e financeiro,
# e o gerente do app (login "univan"). Senha de todos: 123456.
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
try:
    conexao.executescript(pathlib.Path("docs/univan-sqlite.sql").read_text(encoding="utf-8"))

    # Dados de demonstração: 2 empresas separadas (tenant), com gestores, auxiliares, motoristas,
    # passageiros, viagens, financeiro e assinatura. Detalhes em scripts/dados_demo.py.
    sys.path.insert(0, "scripts")
    from dados_demo import popular
    popular(conexao)
    for perfil, login, nome in conexao.execute("SELECT perfil, login, nome FROM usuario ORDER BY id").fetchall():
        print(f"  login {perfil:<9} {login:<15} {nome}")

    problemas = conexao.execute("PRAGMA foreign_key_check").fetchall()
    if problemas:
        sys.exit(f"Chaves estrangeiras quebradas: {problemas}")
    conexao.commit()
    conexao.execute("VACUUM")

    tabelas = [n for (n,) in conexao.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")]
    for tabela in tabelas:
        total = conexao.execute(f"SELECT count(*) FROM {tabela}").fetchone()[0]
        print(f"   {tabela:<15} {total:>3} registros")
except BaseException:
    # Qualquer falha: não deixa o .novo para trás e mantém o banco antigo intacto.
    conexao.close()
    temporario.unlink(missing_ok=True)
    raise
conexao.close()

# Só troca o banco antigo depois que o novo ficou pronto.
try:
    temporario.replace(arquivo)
except PermissionError:
    # Windows: a API (ou outro programa) está com o banco aberto e o arquivo não pode ser
    # trocado. Copia o conteúdo para dentro dele pelo próprio SQLite, que funciona aberto.
    with sqlite3.connect(temporario) as novo, sqlite3.connect(arquivo, timeout=30) as destino:
        novo.backup(destino)
    novo.close()
    destino.close()
    temporario.unlink()
    print("   O banco estava aberto (API rodando?): os dados foram copiados para dentro dele.")
    print("   Reinicie a API para ela gerar as viagens de hoje.")
EOF

info "Banco pronto. Próximo passo:  bash scripts/2-backend.sh"
