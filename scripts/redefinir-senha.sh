#!/usr/bin/env bash
# Redefine a senha de um usuário direto no banco. Para quando o ADMINISTRADOR esquece a senha
# e não há outro admin para trocar em Configurações › Usuários (os demais pedem ao admin).
#
# Uso, na raiz do projeto, no servidor onde a API roda:
#   bash scripts/redefinir-senha.sh admin            (pergunta a senha nova, sem mostrar)
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ/backend"

erro() { printf '\033[1;31mErro: %s\033[0m\n' "$*" >&2; exit 1; }
[ -n "${1:-}" ] || erro "Informe o login. Ex.: bash scripts/redefinir-senha.sh admin"
if [ -x .venv/Scripts/python.exe ]; then PY=".venv/Scripts/python.exe"; elif [ -x .venv/bin/python ]; then PY=".venv/bin/python"
else erro "Rode antes: bash scripts/2-backend.sh (cria o ambiente do backend)."; fi

# A senha vai pelo ambiente (não aparece na lista de processos nem no histórico).
read -r -s -p "Senha nova para '$1' (mínimo 6): " SENHA_NOVA; echo
[ "${#SENHA_NOVA}" -ge 6 ] || erro "A senha precisa de pelo menos 6 caracteres."
SENHA_NOVA="$SENHA_NOVA" "$PY" - "$1" <<'EOF'
import os, sys
from sqlalchemy import select
from app.config.banco import FabricaSessao
from app.config.seguranca import gerar_hash
from app.modules.usuario.usuario_model import Usuario

with FabricaSessao() as sessao:
    usuario = sessao.scalar(select(Usuario).where(Usuario.login == sys.argv[1].strip().lower()))
    if usuario is None:
        sys.exit(f"Usuário '{sys.argv[1]}' não encontrado.")
    usuario.senha_hash = gerar_hash(os.environ["SENHA_NOVA"])
    sessao.commit()
    print(f"Senha de '{usuario.login}' ({usuario.nome}) redefinida.")
EOF
