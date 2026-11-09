#!/usr/bin/env bash
# PASSO 3 de 3 · Sobe a interface (frontend) em http://localhost:5173
#
# Uso, na raiz do projeto (Git Bash, Linux ou macOS):
#   bash scripts/3-frontend.sh
#
# Antes: bash scripts/1-banco.sh  e  bash scripts/2-backend.sh (este em outro terminal, aberto)
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

info() { printf '\033[1;36m==> %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33mAtenção: %s\033[0m\n' "$*"; }
erro() { printf '\033[1;31mErro: %s\033[0m\n' "$*" >&2; exit 1; }

command -v npm >/dev/null 2>&1 || erro "npm não encontrado. Instale o Node.js 20+."

# Instala as dependências na primeira vez ou quando o package-lock.json mudar.
if [ ! -d frontend/node_modules ] || [ frontend/package-lock.json -nt frontend/node_modules ]; then
  info "Instalando dependências do frontend"
  (cd frontend && npm install --no-audit --no-fund)
  touch frontend/node_modules
fi

# Só avisa: o frontend sobe mesmo sem a API, mas as telas vão mostrar erro de conexão.
if command -v curl >/dev/null 2>&1 && ! curl -s -m 2 http://localhost:8000/api/saude >/dev/null; then
  aviso "a API não respondeu em http://localhost:8000. Rode  bash scripts/2-backend.sh  em outro terminal."
fi

info "Interface em http://localhost:5173  ·  Para parar: Ctrl + C"
cd frontend
exec npm run dev
