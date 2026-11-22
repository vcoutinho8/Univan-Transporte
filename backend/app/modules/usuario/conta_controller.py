"""Rotas HTTP das configurações: o admin gerencia os acessos; cada um cuida da própria conta.

O login é o CPF e todo acesso novo (ou senha resetada) começa com a senha padrão 123456: no
primeiro login a pessoa é levada a criar a dela (`trocar_senha`).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.documentacao import erros
from app.config.erros import ConflitoDeDados, DadosInvalidos, RecursoNaoEncontrado
from app.config.seguranca import ADMIN, TODOS, Logado, conferir_senha, gerar_hash
from app.modules.endereco.endereco_model import Endereco
from app.modules.endereco.endereco_schema import EnderecoResposta
from app.modules.motorista.motorista_model import Motorista
from app.modules.usuario.usuario_model import Usuario
from app.modules.usuario.usuario_schema import (
    MinhaConta,
    MinhaContaAlteracao,
    UsuarioAlteracao,
    UsuarioDetalhe,
    UsuarioNovo,
)
from app.shared.cpf import garantir_cpf_livre
from app.shared.enums import PerfilUsuario, StatusCadastro

roteador = APIRouter(prefix="/usuarios", tags=["Acesso"])

Sessao = Annotated[Session, Depends(obter_sessao)]

SENHA_PADRAO = "123456"


@roteador.get("", response_model=list[UsuarioDetalhe], dependencies=[ADMIN], summary="Listar usuários")
def listar_usuarios(sessao: Sessao):
    return sessao.scalars(select(Usuario).order_by(Usuario.nome)).all()


@roteador.post(
    "",
    response_model=UsuarioDetalhe,
    status_code=status.HTTP_201_CREATED,
    dependencies=[ADMIN],
    summary="Criar usuário: login = CPF, senha padrão 123456 (trocada no primeiro login)",
    responses=erros(404, 409, 422),
)
def criar_usuario(dados: UsuarioNovo, logado: Logado, sessao: Sessao):
    if dados.perfil == "motorista":
        if dados.fk_motorista is None:
            raise DadosInvalidos("Escolha o motorista deste usuário.")
        motorista = sessao.get(Motorista, dados.fk_motorista)
        if motorista is None:
            raise RecursoNaoEncontrado("Motorista não encontrado.")
        login, cpf, fk_motorista = motorista.cpf, None, motorista.id
    else:
        if not dados.cpf:
            raise DadosInvalidos("Informe o CPF: ele é o usuário de acesso.")
        garantir_cpf_livre(sessao, dados.cpf, "usuario")
        login, cpf, fk_motorista = dados.cpf, dados.cpf, None
    usuario = Usuario(
        nome=dados.nome,
        login=login,
        cpf=cpf,
        email=dados.email,
        perfil=PerfilUsuario(dados.perfil),
        fk_motorista=fk_motorista,
        fk_empresa=logado.fk_empresa,
        senha_hash=gerar_hash(SENHA_PADRAO),
        trocar_senha=True,
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
    summary="Alterar minha conta: nome, CPF (menos motorista), e-mail, senha e, motorista, a casa",
    responses=erros(409, 422),
)
def alterar_minha_conta(dados: MinhaContaAlteracao, logado: Logado, sessao: Sessao):
    usuario = sessao.get(Usuario, logado.id)
    alteracoes = dados.model_dump(exclude_unset=True)
    motorista = usuario.motorista is not None
    if motorista and ("nome" in alteracoes or "cpf" in alteracoes):
        raise DadosInvalidos("Nome e CPF do motorista ficam no cadastro de motorista: peça ao administrador.")
    if dados.nome:
        usuario.nome = dados.nome
    if "cpf" in alteracoes:
        _trocar_cpf(sessao, usuario, dados.cpf)
    if "email" in alteracoes:
        usuario.email = dados.email
    if dados.senha_nova:
        if not dados.senha_atual or not conferir_senha(dados.senha_atual, usuario.senha_hash):
            raise DadosInvalidos("A senha atual não confere.")
        if dados.senha_nova == SENHA_PADRAO:
            raise DadosInvalidos("Escolha uma senha diferente da padrão (123456).")
        usuario.senha_hash = gerar_hash(dados.senha_nova)
        usuario.trocar_senha = False
    if dados.endereco is not None:
        if not motorista:
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
    summary="Alterar usuário: nome, CPF (o login acompanha) e situação",
    responses=erros(404, 409, 422),
)
def alterar_usuario(id_usuario: int, dados: UsuarioAlteracao, logado: Logado, sessao: Sessao):
    usuario = _buscar(sessao, id_usuario)
    alteracoes = dados.model_dump(exclude_unset=True)
    # O admin não tira o próprio acesso (senão ninguém mais administra o sistema).
    if usuario.id == logado.id and alteracoes.get("status", "ativo") != "ativo":
        raise ConflitoDeDados("Você não pode desativar o seu próprio acesso.")
    if dados.nome:
        usuario.nome = dados.nome
    if "cpf" in alteracoes:
        if usuario.motorista is not None:
            raise DadosInvalidos("O CPF do motorista fica no cadastro de motorista.")
        _trocar_cpf(sessao, usuario, dados.cpf)
    if dados.status:
        usuario.status = StatusCadastro(dados.status)
    sessao.commit()
    return usuario


@roteador.post(
    "/{id_usuario}/resetar-senha",
    response_model=UsuarioDetalhe,
    dependencies=[ADMIN],
    summary="Voltar a senha para a padrão (123456): a pessoa cria a dela no próximo login",
    responses=erros(404, 409),
)
def resetar_senha(id_usuario: int, sessao: Sessao):
    usuario = _buscar(sessao, id_usuario)
    usuario.senha_hash = gerar_hash(SENHA_PADRAO)
    usuario.trocar_senha = True
    sessao.commit()
    return usuario


def _buscar(sessao: Session, id_usuario: int) -> Usuario:
    usuario = sessao.get(Usuario, id_usuario)
    if usuario is None:
        raise RecursoNaoEncontrado("Usuário não encontrado.")
    return usuario


def _trocar_cpf(sessao: Session, usuario: Usuario, cpf: str | None) -> None:
    """CPF de admin/auxiliar é obrigatório e é o login: muda um, muda o outro."""
    if not cpf:
        raise DadosInvalidos("Informe o CPF: ele é o usuário de acesso.")
    garantir_cpf_livre(sessao, cpf, "usuario", usuario.id)
    usuario.cpf = cpf
    usuario.login = cpf


def _minha_conta(usuario: Usuario) -> MinhaConta:
    conta = MinhaConta.model_validate(usuario)
    if usuario.motorista is not None:
        # Do motorista, o CPF e a casa vêm do cadastro dele (o CPF ele só vê, não muda).
        endereco = usuario.motorista.endereco
        conta = conta.model_copy(
            update={"cpf": usuario.motorista.cpf, "endereco": EnderecoResposta.model_validate(endereco) if endereco else None}
        )
    return conta
