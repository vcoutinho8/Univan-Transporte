"""Rotas HTTP das configurações: o admin gerencia os acessos; cada um cuida da própria conta."""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.shared.cpf import garantir_cpf_livre
from app.config.banco import obter_sessao
from app.config.documentacao import erros
from app.config.erros import ConflitoDeDados, DadosInvalidos, RecursoNaoEncontrado
from app.config.seguranca import ADMIN, TODOS, Logado, conferir_senha, gerar_hash
from app.modules.endereco.endereco_model import Endereco
from app.modules.motorista.motorista_model import Motorista
from app.modules.usuario.usuario_model import Usuario
from app.modules.usuario.usuario_schema import (
    MinhaConta,
    MinhaContaAlteracao,
    UsuarioAlteracao,
    UsuarioDetalhe,
    UsuarioNovo,
)
from app.modules.endereco.endereco_schema import EnderecoResposta
from app.shared.enums import PerfilUsuario, StatusCadastro

roteador = APIRouter(prefix="/usuarios", tags=["Acesso"])

Sessao = Annotated[Session, Depends(obter_sessao)]


def _garantir_motorista(sessao: Session, perfil: str, fk_motorista: int | None) -> None:
    """Perfil motorista precisa apontar para um motorista cadastrado (e os outros, para nenhum)."""
    if perfil == PerfilUsuario.MOTORISTA.value:
        if fk_motorista is None:
            raise DadosInvalidos("Escolha o motorista deste usuário.")
        if sessao.get(Motorista, fk_motorista) is None:
            raise RecursoNaoEncontrado("Motorista não encontrado.")


@roteador.get("", response_model=list[UsuarioDetalhe], dependencies=[ADMIN], summary="Listar usuários")
def listar_usuarios(sessao: Sessao):
    return sessao.scalars(select(Usuario).order_by(Usuario.nome)).all()


@roteador.post(
    "",
    response_model=UsuarioDetalhe,
    status_code=status.HTTP_201_CREATED,
    dependencies=[ADMIN],
    summary="Criar usuário (ex.: o login de uma auxiliar)",
    responses=erros(404, 409, 422),
)
def criar_usuario(dados: UsuarioNovo, logado: Logado, sessao: Sessao):
    fk_motorista = dados.fk_motorista if dados.perfil == "motorista" else None
    garantir_cpf_livre(sessao, dados.cpf, "usuario")
    _garantir_motorista(sessao, dados.perfil, fk_motorista)
    usuario = Usuario(
        **dados.model_dump(exclude={"senha", "fk_motorista", "perfil"}),
        perfil=PerfilUsuario(dados.perfil),
        fk_empresa=logado.fk_empresa,
        fk_motorista=fk_motorista,
        senha_hash=gerar_hash(dados.senha),
    )
    sessao.add(usuario)
    sessao.commit()
    return usuario


@roteador.get("/eu", response_model=MinhaConta, dependencies=[TODOS], summary="Minha conta")
def minha_conta(logado: Logado, sessao: Sessao):
    return _minha_conta(sessao.get(Usuario, logado.id))


@roteador.patch(
    "/eu",
    response_model=MinhaConta,
    dependencies=[TODOS],
    summary="Alterar minha conta: e-mail, senha (com a atual) e, motorista, a casa",
    responses=erros(409, 422),
)
def alterar_minha_conta(dados: MinhaContaAlteracao, logado: Logado, sessao: Sessao):
    usuario = sessao.get(Usuario, logado.id)
    alteracoes = dados.model_dump(exclude_unset=True)
    if "email" in alteracoes:
        usuario.email = dados.email
    if dados.senha_nova:
        if not dados.senha_atual or not conferir_senha(dados.senha_atual, usuario.senha_hash):
            raise DadosInvalidos("A senha atual não confere.")
        usuario.senha_hash = gerar_hash(dados.senha_nova)
    if dados.endereco is not None:
        if usuario.motorista is None:
            raise DadosInvalidos("Só o motorista tem endereço na conta (a casa, de onde a ida sai).")
        novo = dados.endereco.model_dump()
        if usuario.motorista.endereco is None:
            usuario.motorista.endereco = Endereco(**novo)
        else:
            for campo, valor in novo.items():
                setattr(usuario.motorista.endereco, campo, valor)
    sessao.commit()
    return _minha_conta(usuario)


@roteador.put(
    "/{id_usuario}",
    response_model=UsuarioDetalhe,
    dependencies=[ADMIN],
    summary="Alterar usuário (nome, login, e-mail, CPF, perfil, situação ou redefinir a senha)",
    responses=erros(404, 409, 422),
)
def alterar_usuario(id_usuario: int, dados: UsuarioAlteracao, logado: Logado, sessao: Sessao):
    usuario = sessao.get(Usuario, id_usuario)
    if usuario is None:
        raise RecursoNaoEncontrado("Usuário não encontrado.")
    alteracoes = dados.model_dump(exclude_unset=True)
    # O admin não tira o próprio acesso (senão ninguém mais administra o sistema).
    if usuario.id == logado.id and (alteracoes.get("perfil", "admin") != "admin" or alteracoes.get("status", "ativo") != "ativo"):
        raise ConflitoDeDados("Você não pode tirar o seu próprio acesso de administrador.")
    if alteracoes.get("cpf"):
        garantir_cpf_livre(sessao, alteracoes["cpf"], "usuario", usuario.id)
    if "senha" in alteracoes:
        usuario.senha_hash = gerar_hash(alteracoes.pop("senha"))
    perfil = alteracoes.get("perfil", usuario.perfil.value)
    if perfil != "motorista":
        alteracoes["fk_motorista"] = None
    else:
        _garantir_motorista(sessao, perfil, alteracoes.get("fk_motorista", usuario.fk_motorista))
    if "perfil" in alteracoes:
        alteracoes["perfil"] = PerfilUsuario(alteracoes["perfil"])
    if "status" in alteracoes:
        alteracoes["status"] = StatusCadastro(alteracoes["status"])
    for campo, valor in alteracoes.items():
        setattr(usuario, campo, valor)
    sessao.commit()
    return usuario


def _minha_conta(usuario: Usuario) -> MinhaConta:
    conta = MinhaConta.model_validate(usuario)
    if usuario.motorista is not None:
        # Do motorista, o CPF e a casa vêm do cadastro dele (o CPF ele só vê, não muda).
        endereco = usuario.motorista.endereco
        conta = conta.model_copy(
            update={"cpf": usuario.motorista.cpf, "endereco": EnderecoResposta.model_validate(endereco) if endereco else None}
        )
    return conta
