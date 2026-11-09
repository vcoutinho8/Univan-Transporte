#!/usr/bin/env bash
# PASSO 2 de 3 · Sobe a API (backend) em http://localhost:8000/api
#
# Uso, na raiz do projeto (Git Bash, Linux ou macOS):
#   bash scripts/2-backend.sh
#
# Antes: bash scripts/1-banco.sh   ·   Depois, em OUTRO terminal: bash scripts/3-frontend.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

info() { printf '\033[1;36m==> %s\033[0m\n' "$*"; }
erro() { printf '\033[1;31mErro: %s\033[0m\n' "$*" >&2; exit 1; }

# ---------- Ambiente virtual do Python ----------
if [ -x backend/.venv/Scripts/python.exe ]; then
  PY="backend/.venv/Scripts/python.exe"
elif [ -x backend/.venv/bin/python ]; then
  PY="backend/.venv/bin/python"
else
  info "Criando o ambiente virtual do backend"
  PY_SISTEMA="$(command -v python3 || command -v python || command -v py || true)"
  [ -n "$PY_SISTEMA" ] || erro "Python não encontrado. Instale o Python 3.12+."
  "$PY_SISTEMA" -m venv backend/.venv
  if [ -x backend/.venv/Scripts/python.exe ]; then PY="backend/.venv/Scripts/python.exe"; else PY="backend/.venv/bin/python"; fi
fi

# Reinstala as dependências só quando o requirements.txt mudar.
MARCA="backend/.venv/.requirements.sha"
HASH_ATUAL="$("$PY" -c "import hashlib;print(hashlib.sha256(open('backend/requirements.txt','rb').read()).hexdigest())")"
if [ "$(cat "$MARCA" 2>/dev/null || true)" != "$HASH_ATUAL" ]; then
  info "Instalando dependências do backend"
  "$PY" -m pip install -q -r backend/requirements.txt
  echo "$HASH_ATUAL" > "$MARCA"
fi

# ---------- .env e banco ----------
[ -f .env ] || erro "Arquivo .env não encontrado. Rode primeiro: bash scripts/1-banco.sh"

URL_BANCO="$(grep -E '^DATABASE_URL=' .env | tail -n 1 | cut -d= -f2- | tr -d '\r' || true)"
URL_BANCO="${URL_BANCO:-sqlite:///backend/univan.db}"
[[ "$URL_BANCO" == sqlite:///* ]] || erro "A DATABASE_URL do .env deve ser SQLite, ex.: sqlite:///backend/univan.db"
ARQUIVO="${URL_BANCO#sqlite:///}"
[ -f "$ARQUIVO" ] || erro "Banco $ARQUIVO não encontrado. Rode primeiro: bash scripts/1-banco.sh"
info "Banco: SQLite ($ARQUIVO)"

# ---------- Sobe a API ----------
PY_ABS="$RAIZ/$PY"
info "API em http://localhost:8000/api  ·  documentação em http://localhost:8000/api/docs"
info "Deixe este terminal aberto. Próximo passo, em outro terminal:  bash scripts/3-frontend.sh"
info "Para parar: Ctrl + C"
cd backend
exec "$PY_ABS" -m uvicorn app.main:app --reload
