"""Segurança: senhas (scrypt), token de sessão assinado e permissões por perfil.

Tudo com a biblioteca padrão do Python:
- Senha: hashlib.scrypt com sal aleatório; guarda "scrypt$n$r$p$sal$hash". Nunca a senha.
- Sessão: token "dados.assinatura" (base64url), assinado com HMAC-SHA256 e a chave SECRET_KEY,
  com validade (exp). Quem altera os dados invalida a assinatura.
- Tentativas: 5 senhas erradas seguidas bloqueiam o usuário por 5 minutos (na memória do processo).

Perfis: admin (tudo), auxiliar (apoio, sem editar nem inativar cadastros), motorista (as
próprias viagens e chamadas).
"""

import base64
import hashlib
import hmac
import json
import secrets
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.configuracoes import obter_configuracoes
from app.config.erros import AcessoNegado, NaoAutenticado

PERFIS = ("admin", "auxiliar", "motorista", "univan")

# ---------------------------------------------------------------- senha

_N, _R, _P = 2**14, 8, 1


def gerar_hash(senha: str) -> str:
    sal = secrets.token_urlsafe(12)
    chave = hashlib.scrypt(senha.encode(), salt=sal.encode(), n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${sal}${base64.b64encode(chave).decode()}"


def conferir_senha(senha: str, guardado: str) -> bool:
    try:
        algoritmo, n, r, p, sal, esperado = guardado.split("$")
        if algoritmo != "scrypt":
            return False
        chave = hashlib.scrypt(senha.encode(), salt=sal.encode(), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(base64.b64encode(chave).decode(), esperado)
    except (ValueError, TypeError):
        return False


# ---------------------------------------------------------------- token

def _b64(dados: bytes) -> str:
    return base64.urlsafe_b64encode(dados).rstrip(b"=").decode()


def _desb64(texto: str) -> bytes:
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def _assinar(conteudo: str) -> str:
    chave = obter_configuracoes().chave_secreta.encode()
    return _b64(hmac.new(chave, conteudo.encode(), hashlib.sha256).digest())


def criar_token(id_usuario: int, perfil: str, agora: float | None = None) -> str:
    agora = time.time() if agora is None else agora
    validade = obter_configuracoes().minutos_sessao * 60
    conteudo = _b64(json.dumps({"sub": id_usuario, "perfil": perfil, "exp": int(agora + validade)}).encode())
    return f"{conteudo}.{_assinar(conteudo)}"


def ler_token(token: str, agora: float | None = None) -> dict:
    """Dados do token, se a assinatura confere e não expirou. Senão, NaoAutenticado."""
    try:
        conteudo, assinatura = token.split(".")
    except ValueError:
        raise NaoAutenticado("Sessão inválida. Entre de novo.") from None
    if not hmac.compare_digest(_assinar(conteudo), assinatura):
        raise NaoAutenticado("Sessão inválida. Entre de novo.")
    dados = json.loads(_desb64(conteudo))
    if dados.get("exp", 0) < (time.time() if agora is None else agora):
        raise NaoAutenticado("Sua sessão expirou. Entre de novo.")
    return dados


# ---------------------------------------------------------------- tentativas de login

MAX_TENTATIVAS = 5
BLOQUEIO_SEGUNDOS = 5 * 60
_tentativas: dict[str, list[float]] = {}


def conferir_bloqueio(login: str) -> None:
    recentes = [t for t in _tentativas.get(login, []) if time.time() - t < BLOQUEIO_SEGUNDOS]
    _tentativas[login] = recentes
    if len(recentes) >= MAX_TENTATIVAS:
        minutos = max(1, round((BLOQUEIO_SEGUNDOS - (time.time() - recentes[0])) / 60))
        raise AcessoNegado(f"Muitas tentativas erradas. Tente de novo em {minutos} minuto(s).", codigo_http=429)


def registrar_falha(login: str) -> None:
    _tentativas.setdefault(login, []).append(time.time())


def limpar_falhas(login: str) -> None:
    _tentativas.pop(login, None)


# ---------------------------------------------------------------- dependências do FastAPI

@dataclass(frozen=True)
class UsuarioLogado:
    id: int
    perfil: str
    fk_empresa: int
    fk_motorista: int | None

    @property
    def motorista(self) -> bool:
        return self.perfil == "motorista"


# Esquema "Bearer" no Swagger: o botão Authorize recebe o token de POST /auth/login.
_esquema = HTTPBearer(auto_error=False, description="Token de POST /api/auth/login")


def usuario_logado(
    requisicao: Request,
    sessao: Annotated[Session, Depends(obter_sessao)],
    credenciais: Annotated[HTTPAuthorizationCredentials | None, Depends(_esquema)],
) -> UsuarioLogado:
    """Lê o token do cabeçalho Authorization e confere se o usuário existe e está ativo."""
    from app.modules.usuario.usuario_model import Usuario

    if credenciais is None or not credenciais.credentials:
        raise NaoAutenticado("Entre no sistema para continuar.")
    dados = ler_token(credenciais.credentials.strip())
    usuario = sessao.get(Usuario, dados["sub"])
    if usuario is None or usuario.status != "ativo":
        raise NaoAutenticado("Usuário inativo ou removido. Fale com o administrador.")
    logado = UsuarioLogado(usuario.id, usuario.perfil.value, usuario.fk_empresa, usuario.fk_motorista)
    requisicao.state.usuario = logado
    return logado


Logado = Annotated[UsuarioLogado, Depends(usuario_logado)]


def exigir_perfil(*perfis: str) -> Callable[[UsuarioLogado], UsuarioLogado]:
    """Dependência: só deixa passar os perfis informados (403 para os outros)."""
    nomes = {"admin": "gestor do sistema", "auxiliar": "auxiliar", "motorista": "motorista", "univan": "gerente UniVan"}

    def verificar(usuario: Logado) -> UsuarioLogado:
        if usuario.perfil not in perfis:
            raise AcessoNegado(f"Seu perfil ({nomes[usuario.perfil]}) não tem acesso a esta ação.")
        return usuario

    return verificar


ADMIN = Depends(exigir_perfil("admin"))
ADMIN_OU_AUXILIAR = Depends(exigir_perfil("admin", "auxiliar"))
OPERACAO = Depends(exigir_perfil("admin", "motorista"))  # iniciar, embarcar, desembarcar
TODOS = Depends(exigir_perfil(*PERFIS))
UNIVAN = Depends(exigir_perfil("univan"))  # gerente do app: gestores e assinaturas
