#!/usr/bin/env bash
# PASSO 4 (OPCIONAL · CELULAR / PWA) · Expõe a interface em HTTPS temporário via Cloudflare
#
# Uso, na raiz do projeto (Git Bash, Linux ou macOS):
#   bash scripts/4-cloudflare.sh
#
# Antes: deixe rodando em outros terminais  bash scripts/2-backend.sh  e  bash scripts/3-frontend.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

info() { printf '\033[1;36m==> %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33mAtenção: %s\033[0m\n' "$*"; }
erro() { printf '\033[1;31mErro: %s\033[0m\n' "$*" >&2; exit 1; }

# ---------- Localiza o cloudflared ----------
if command -v cloudflared >/dev/null 2>&1; then
  CF="cloudflared"
elif [ -x "/c/Program Files (x86)/cloudflared/cloudflared.exe" ]; then
  CF="/c/Program Files (x86)/cloudflared/cloudflared.exe"
elif [ -x "/c/Program Files/cloudflared/cloudflared.exe" ]; then
  CF="/c/Program Files/cloudflared/cloudflared.exe"
else
  erro "cloudflared não encontrado. Instale com: winget install --id Cloudflare.cloudflared"
fi

# ---------- Verifica se API e Frontend estão de pé ----------
if command -v curl >/dev/null 2>&1; then
  if ! curl -s -m 2 http://localhost:8000/api/saude >/dev/null; then
    aviso "a API não respondeu em http://localhost:8000. Rode  bash scripts/2-backend.sh  em outro terminal."
  fi
  if ! curl -s -m 2 http://localhost:5173 >/dev/null; then
    aviso "o frontend não respondeu em http://localhost:5173. Rode  bash scripts/3-frontend.sh  em outro terminal."
  fi
fi

# ---------- Abre o túnel HTTPS ----------
info "Abrindo túnel Cloudflare para http://localhost:5173"
info "Copie o link https://...trycloudflare.com que vai aparecer abaixo e abra no Chrome do Android."
info "Não feche este terminal durante a apresentação (reiniciar gera outro link). Para parar: Ctrl + C"
exec "$CF" tunnel --url http://localhost:5173