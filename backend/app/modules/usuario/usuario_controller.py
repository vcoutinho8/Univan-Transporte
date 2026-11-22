"""Rotas HTTP do login: entrar, saber quem está logado e recuperar a senha."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.configuracoes import obter_configuracoes
from app.config.documentacao import erros
from app.config.erros import AcessoNegado, ConflitoDeDados, DadosInvalidos, NaoAutenticado, RecursoNaoEncontrado
from app.config.seguranca import Logado, conferir_bloqueio, conferir_senha, criar_token, gerar_hash, limpar_falhas, registrar_falha
from app.modules.usuario.usuario_model import Usuario
from app.modules.usuario.senha import INVALIDO, enviar_email_de_senha, ler_link, link_ainda_vale
from app.modules.usuario.usuario_schema import LoginPedido, LoginResposta, UsuarioResposta
from app.modules.empresa.empresa_model import Empresa
from app.modules.empresa.univan_controller import atualizar_situacao, aviso_de_assinatura
from app.shared.enums import PerfilUsuario, StatusEmpresa
from app.shared.documentos import cnpj_valido, cpf_valido
from app.shared.texto import normalizar_login
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
    # Só o gerente UniVan entra com letras; os demais, com o CPF (ou o CNPJ, o gestor).
    if usuario is not None and not usuario.login.isdigit() and usuario.perfil != PerfilUsuario.UNIVAN:
        usuario = None
    # Mesma mensagem para usuário inexistente e senha errada: não revela quais usuários existem.
    if usuario is None or not conferir_senha(dados.senha, usuario.senha_hash):
        registrar_falha(dados.usuario)
        raise NaoAutenticado("Usuário ou senha incorretos.")
    if usuario.status != "ativo":
        raise AcessoNegado("Este usuário está inativo. Fale com o administrador.")
    aviso = None
    if usuario.perfil != PerfilUsuario.UNIVAN:
        empresa = sessao.get(Empresa, usuario.fk_empresa)
        atualizar_situacao(sessao, empresa)
        if empresa.status == StatusEmpresa.INATIVA:
            sessao.commit()
            raise AcessoNegado("O acesso desta empresa está suspenso. O gestor precisa falar com a UniVan para regularizar a assinatura.")
        if usuario.perfil == PerfilUsuario.ADMIN:
            aviso = aviso_de_assinatura(sessao, empresa)
    limpar_falhas(dados.usuario)
    usuario.ultimo_acesso = viagem_servico.agora()
    sessao.commit()
    return LoginResposta(
        token=criar_token(usuario.id, usuario.perfil.value),
        expira_em_minutos=obter_configuracoes().minutos_sessao,
        usuario=UsuarioResposta.model_validate(usuario),
        aviso_assinatura=aviso,
    )


@roteador.get("/eu", response_model=UsuarioResposta, summary="Usuário logado", responses=erros(401))
def quem_sou_eu(usuario: Logado, sessao: Sessao):
    return sessao.get(Usuario, usuario.id)


class EsqueciPedido(BaseModel):
    """Usuário de acesso (CPF ou login) de quem esqueceu a senha."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [{"usuario": "529.982.247-25"}]})

    usuario: str = Field(min_length=3, max_length=30)

    @field_validator("usuario")
    @classmethod
    def validar_documento(cls, valor: str) -> str:
        login = normalizar_login(valor)
        if not (cpf_valido(login) or cnpj_valido(login)):
            raise ValueError("CPF ou CNPJ inválido. Confira os números digitados.")
        return login


class EsqueciResposta(BaseModel):
    canal: Literal["email", "gestor"] = Field(description="email: link enviado ao gestor; gestor: pedido ao gestor do sistema.")


class RedefinirPedido(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(max_length=500)
    senha_nova: str = Field(min_length=6, max_length=128)


@roteador.post(
    "/esqueci-senha",
    response_model=EsqueciResposta,
    summary="Esqueci a senha: o gestor recebe um link por e-mail; os demais pedem ao gestor",
    responses=erros(404, 409, 422),
)
def esqueci_senha(dados: EsqueciPedido, sessao: Sessao):
    login = normalizar_login(dados.usuario)
    usuario = sessao.scalar(select(Usuario).where(Usuario.login == login))
    if usuario is None or usuario.status != "ativo":
        raise RecursoNaoEncontrado("Não encontramos esse usuário. Confira o CPF (ou o CNPJ, se for o gestor).")
    if usuario.perfil == PerfilUsuario.ADMIN:
        if not usuario.email:
            raise ConflitoDeDados("Este gestor não tem e-mail cadastrado. Fale com a UniVan para voltar à senha padrão.")
        enviar_email_de_senha(usuario)
        return EsqueciResposta(canal="email")
    usuario.pediu_senha_em = viagem_servico.agora()
    sessao.commit()
    return EsqueciResposta(canal="gestor")


@roteador.post(
    "/redefinir-senha",
    response_model=UsuarioResposta,
    summary="Criar a senha nova pelo link do e-mail (vale 1 hora, uma vez só)",
    responses=erros(409, 422),
)
def redefinir_senha(dados: RedefinirPedido, sessao: Sessao):
    lido = ler_link(dados.token)
    usuario = sessao.get(Usuario, lido["sub"])
    if usuario is None or not link_ainda_vale(lido, usuario):
        raise DadosInvalidos(INVALIDO)
    usuario.senha_hash = gerar_hash(dados.senha_nova)
    usuario.trocar_senha = False
    usuario.pediu_senha_em = None
    sessao.commit()
    return usuario
