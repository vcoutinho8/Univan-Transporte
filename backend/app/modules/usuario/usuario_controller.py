"""Rotas HTTP do login: entrar e saber quem está logado."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.configuracoes import obter_configuracoes
from app.config.documentacao import erros
from app.config.erros import AcessoNegado, NaoAutenticado
from app.config.seguranca import Logado, conferir_bloqueio, conferir_senha, criar_token, limpar_falhas, registrar_falha
from app.modules.usuario.usuario_model import Usuario
from app.modules.usuario.usuario_schema import LoginPedido, LoginResposta, UsuarioResposta
from app.modules.viagem import viagem_servico

roteador = APIRouter(prefix="/auth", tags=["Acesso"])

Sessao = Annotated[Session, Depends(obter_sessao)]


@roteador.post(
    "/login",
    response_model=LoginResposta,
    summary="Entrar com usuário e senha (devolve o token de sessão)",
    responses=erros(401, 403, 409, 429),
)
def entrar(dados: LoginPedido, sessao: Sessao):
    conferir_bloqueio(dados.usuario)
    usuario = sessao.scalar(select(Usuario).where(Usuario.login == dados.usuario))
    # Mesma mensagem para usuário inexistente e senha errada: não revela quais usuários existem.
    if usuario is None or not conferir_senha(dados.senha, usuario.senha_hash):
        registrar_falha(dados.usuario)
        raise NaoAutenticado("Usuário ou senha incorretos.")
    if usuario.status != "ativo":
        raise AcessoNegado("Este usuário está inativo. Fale com o administrador.")
    limpar_falhas(dados.usuario)
    usuario.ultimo_acesso = viagem_servico.agora()
    sessao.commit()
    return LoginResposta(
        token=criar_token(usuario.id, usuario.perfil.value),
        expira_em_minutos=obter_configuracoes().minutos_sessao,
        usuario=UsuarioResposta.model_validate(usuario),
    )


@roteador.get("/eu", response_model=UsuarioResposta, summary="Usuário logado", responses=erros(401))
def quem_sou_eu(usuario: Logado, sessao: Sessao):
    return sessao.get(Usuario, usuario.id)
