"""Rotas HTTP do gerente UniVan (dono do app): gestores (empresas que assinam), pagamentos da
assinatura, painel e relatório. Assinatura vencida: a empresa entra "em negociação" e, passados
30 dias, é inativada sozinha (os usuários dela não entram mais). O gerente também inativa à mão."""

import re
from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.documentacao import erros
from app.config.erros import ConflitoDeDados, RecursoNaoEncontrado
from app.config.seguranca import UNIVAN, gerar_hash
from app.modules.empresa.assinatura_model import AssinaturaPagamento
from app.modules.empresa.empresa_model import Empresa
from app.modules.relatorio.relatorio_tabelas import Coluna, Tabela
from app.modules.usuario.usuario_model import Usuario
from app.modules.viagem import viagem_servico
from app.shared.documentos import cnpj_valido
from app.shared.enums import PerfilUsuario, StatusEmpresa, StatusTitulo
from app.shared.texto import so_digitos

roteador = APIRouter(prefix="/univan", tags=["UniVan"], dependencies=[UNIVAN])

Sessao = Annotated[Session, Depends(obter_sessao)]

PRAZO_NEGOCIACAO_DIAS = 30
MOTIVO_AUTOMATICO = "Assinatura em atraso há mais de 30 dias."
DIA_VENCIMENTO = 10


# ---------------------------------------------------------------- regra da assinatura


def em_atraso_desde(sessao: Session, id_empresa: int, hoje: date) -> date | None:
    return sessao.scalar(
        select(AssinaturaPagamento.data_vencimento)
        .where(
            AssinaturaPagamento.fk_empresa == id_empresa,
            AssinaturaPagamento.status == StatusTitulo.ABERTO,
            AssinaturaPagamento.data_vencimento < hoje,
        )
        .order_by(AssinaturaPagamento.data_vencimento)
        .limit(1)
    )


def atualizar_situacao(sessao: Session, empresa: Empresa, hoje: date | None = None) -> None:
    """Em dia: ativa. Em atraso: em negociação; mais de 30 dias: inativa (automática). A
    inativação feita à mão pelo gerente não muda sozinha."""
    hoje = hoje or viagem_servico.agora().date()
    manual = empresa.status == StatusEmpresa.INATIVA and empresa.motivo_inativacao not in (None, MOTIVO_AUTOMATICO)
    if manual:
        return
    desde = em_atraso_desde(sessao, empresa.id, hoje)
    if desde is None:
        empresa.status, empresa.motivo_inativacao = StatusEmpresa.ATIVA, None
    elif (hoje - desde).days > PRAZO_NEGOCIACAO_DIAS:
        empresa.status, empresa.motivo_inativacao = StatusEmpresa.INATIVA, MOTIVO_AUTOMATICO
    else:
        empresa.status, empresa.motivo_inativacao = StatusEmpresa.EM_NEGOCIACAO, None


def aviso_de_assinatura(sessao: Session, empresa: Empresa) -> str | None:
    """Mensagem para o gestor quando a assinatura está em negociação (quantos dias faltam)."""
    hoje = viagem_servico.agora().date()
    desde = em_atraso_desde(sessao, empresa.id, hoje)
    if empresa.status != StatusEmpresa.EM_NEGOCIACAO or desde is None:
        return None
    restam = max(0, PRAZO_NEGOCIACAO_DIAS - (hoje - desde).days)
    return f"A assinatura do UniVan está em atraso desde {desde:%d/%m}. Regularize em até {restam} dia(s) para não perder o acesso."


# ---------------------------------------------------------------- schemas


class GestorDoApp(BaseModel):
    id: int | None
    nome: str
    login: str
    email: str | None


class GestorResumo(BaseModel):
    """Uma empresa assinante e o gestor (admin) dela."""

    id: int
    nome_fantasia: str | None
    razao_social: str
    cnpj: str
    responsavel: str | None
    status: StatusEmpresa
    valor_assinatura: Decimal
    motivo_inativacao: str | None
    gestor: GestorDoApp | None
    em_atraso_desde: date | None
    dias_para_inativar: int | None


class GestorNovo(BaseModel):
    """Nova empresa assinante e o acesso do gestor: login = CNPJ da empresa, senha 123456."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"examples": [{"nome_fantasia": "Vans do Sul", "cnpj": "12.345.678/0001-95", "responsavel": "Marta Lima", "email": "marta@vansdosul.com.br"}]},
    )

    nome_fantasia: str = Field(max_length=100)
    razao_social: str | None = Field(default=None, max_length=100)
    cnpj: str
    responsavel: str = Field(max_length=100)
    email: str | None = Field(default=None, max_length=120)
    telefone: str | None = Field(default=None, max_length=20)

    @field_validator("cnpj")
    @classmethod
    def validar_cnpj(cls, valor: str) -> str:
        numeros = so_digitos(valor)
        if not cnpj_valido(numeros):
            raise ValueError("CNPJ inválido. Confira os 14 números.")
        return numeros

    @field_validator("email")
    @classmethod
    def validar_email(cls, valor: str | None) -> str | None:
        email = (valor or "").strip().lower()
        if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            raise ValueError("E-mail inválido. Ex.: nome@empresa.com.br")
        return email or None

    @field_validator("telefone")
    @classmethod
    def validar_telefone(cls, valor: str | None) -> str | None:
        numeros = so_digitos(valor or "")
        if numeros and len(numeros) not in (10, 11):
            raise ValueError("Telefone inválido. Informe o DDD e o número.")
        return numeros or None

    @field_validator("nome_fantasia", "responsavel")
    @classmethod
    def validar_texto(cls, valor: str) -> str:
        texto = " ".join(valor.split())
        if not texto:
            raise ValueError("Campo obrigatório.")
        return texto


class GestorAlteracao(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome_fantasia: str | None = Field(default=None, max_length=100)
    responsavel: str | None = Field(default=None, max_length=100)


class Assinatura(BaseModel):
    """Valor mensal da assinatura: um só para todos os gestores."""

    model_config = ConfigDict(extra="forbid")

    valor: Decimal = Field(gt=0, le=100000)


class Inativacao(BaseModel):
    model_config = ConfigDict(extra="forbid")

    motivo: str = Field(min_length=3, max_length=200)


class Pagamento(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    fk_empresa: int
    empresa: str
    competencia: date
    valor: Decimal
    data_vencimento: date
    data_pagamento: date | None
    status: StatusTitulo
    vencido: bool


class PontoDoGrafico(BaseModel):
    mes: date
    previsto: Decimal
    recebido: Decimal


class PainelUnivan(BaseModel):
    gestores_ativos: int
    em_negociacao: int
    inativos: int
    previsto_mes: Decimal
    recebido_mes: Decimal
    em_atraso: Decimal
    meses: list[PontoDoGrafico] = Field(description="Últimos 6 meses: previsto x recebido.")


# ---------------------------------------------------------------- ajudantes


def _empresas(sessao: Session) -> list[Empresa]:
    empresas = list(sessao.scalars(select(Empresa).order_by(Empresa.nome_fantasia, Empresa.razao_social)))
    for empresa in empresas:
        atualizar_situacao(sessao, empresa)
    sessao.commit()
    return empresas


def _resumo(sessao: Session, empresa: Empresa) -> GestorResumo:
    hoje = viagem_servico.agora().date()
    gestor = sessao.scalar(select(Usuario).where(Usuario.fk_empresa == empresa.id, Usuario.perfil == PerfilUsuario.ADMIN).order_by(Usuario.id).limit(1))
    desde = em_atraso_desde(sessao, empresa.id, hoje)
    return GestorResumo(
        id=empresa.id,
        nome_fantasia=empresa.nome_fantasia,
        razao_social=empresa.razao_social,
        cnpj=empresa.cnpj,
        responsavel=empresa.responsavel,
        status=empresa.status,
        valor_assinatura=empresa.valor_assinatura,
        motivo_inativacao=empresa.motivo_inativacao,
        gestor=GestorDoApp(id=gestor.id, nome=gestor.nome, login=gestor.login, email=gestor.email) if gestor else None,
        em_atraso_desde=desde,
        dias_para_inativar=max(0, PRAZO_NEGOCIACAO_DIAS - (hoje - desde).days) if desde and empresa.status == StatusEmpresa.EM_NEGOCIACAO else None,
    )


def _empresa(sessao: Session, id_empresa: int) -> Empresa:
    empresa = sessao.get(Empresa, id_empresa)
    if empresa is None:
        raise RecursoNaoEncontrado("Gestor (empresa) não encontrado.")
    return empresa


def _pagamento(p: AssinaturaPagamento) -> Pagamento:
    hoje = viagem_servico.agora().date()
    return Pagamento(
        id=p.id,
        fk_empresa=p.fk_empresa,
        empresa=p.empresa.nome_fantasia or p.empresa.razao_social,
        competencia=p.competencia,
        valor=p.valor,
        data_vencimento=p.data_vencimento,
        data_pagamento=p.data_pagamento,
        status=p.status,
        vencido=p.status == StatusTitulo.ABERTO and p.data_vencimento < hoje,
    )


def _valor_da_assinatura(sessao: Session) -> Decimal:
    # shortcut: o valor geral fica repetido em cada empresa (todas iguais); vira tabela de configuração se um dia houver planos.
    return sessao.scalar(select(Empresa.valor_assinatura).order_by(Empresa.id.desc()).limit(1)) or Decimal("199.90")


def _mes(d: date, deslocamento: int = 0) -> date:
    total = d.year * 12 + d.month - 1 + deslocamento
    return date(total // 12, total % 12 + 1, 1)


# ---------------------------------------------------------------- painel


@roteador.get("/painel", response_model=PainelUnivan, summary="Painel do gerente: gestores e pagamentos da assinatura")
def painel(sessao: Sessao):
    empresas = _empresas(sessao)
    hoje = viagem_servico.agora().date()
    pagamentos = list(sessao.scalars(select(AssinaturaPagamento).where(AssinaturaPagamento.status != StatusTitulo.CANCELADO)))
    mes_atual = _mes(hoje)
    zero = Decimal("0")

    def do_mes(mes: date, so_pagos: bool) -> Decimal:
        return sum((p.valor for p in pagamentos if p.competencia == mes and (not so_pagos or p.status == StatusTitulo.PAGO)), zero)

    return PainelUnivan(
        gestores_ativos=sum(1 for e in empresas if e.status == StatusEmpresa.ATIVA),
        em_negociacao=sum(1 for e in empresas if e.status == StatusEmpresa.EM_NEGOCIACAO),
        inativos=sum(1 for e in empresas if e.status == StatusEmpresa.INATIVA),
        previsto_mes=do_mes(mes_atual, False),
        recebido_mes=do_mes(mes_atual, True),
        em_atraso=sum((p.valor for p in pagamentos if p.status == StatusTitulo.ABERTO and p.data_vencimento < hoje), zero),
        meses=[PontoDoGrafico(mes=_mes(hoje, -i), previsto=do_mes(_mes(hoje, -i), False), recebido=do_mes(_mes(hoje, -i), True)) for i in range(5, -1, -1)],
    )


# ---------------------------------------------------------------- gestores


@roteador.get("/gestores", response_model=list[GestorResumo], summary="Gestores (empresas assinantes), com a situação da assinatura")
def listar_gestores(sessao: Sessao):
    return [_resumo(sessao, e) for e in _empresas(sessao)]


@roteador.post("/gestores", response_model=GestorResumo, status_code=201, summary="Criar gestor: a empresa e o acesso (CNPJ, senha 123456)", responses=erros(409, 422))
def criar_gestor(dados: GestorNovo, sessao: Sessao):
    if sessao.scalar(select(Empresa.id).where(Empresa.cnpj == dados.cnpj)) or sessao.scalar(select(Usuario.id).where(Usuario.login == dados.cnpj)):
        raise ConflitoDeDados("Já existe uma empresa com este CNPJ.")
    empresa = Empresa(
        razao_social=dados.razao_social or dados.nome_fantasia,
        nome_fantasia=dados.nome_fantasia,
        cnpj=dados.cnpj,
        telefone=dados.telefone,
        responsavel=dados.responsavel,
        valor_assinatura=_valor_da_assinatura(sessao),
    )
    sessao.add(empresa)
    sessao.flush()
    sessao.add(
        Usuario(
            fk_empresa=empresa.id,
            nome=dados.responsavel,
            login=dados.cnpj,
            email=dados.email,
            perfil=PerfilUsuario.ADMIN,
            senha_hash=gerar_hash("123456"),
            trocar_senha=True,
        )
    )
    sessao.commit()
    return _resumo(sessao, empresa)


@roteador.put("/gestores/{id_empresa}", response_model=GestorResumo, summary="Alterar nome fantasia ou responsável", responses=erros(404, 422))
def alterar_gestor(id_empresa: int, dados: GestorAlteracao, sessao: Sessao):
    empresa = _empresa(sessao, id_empresa)
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        if valor is not None:
            setattr(empresa, campo, valor)
    sessao.commit()
    return _resumo(sessao, empresa)


@roteador.post("/gestores/{id_empresa}/inativar", response_model=GestorResumo, summary="Inativar o gestor (os usuários da empresa não entram mais)", responses=erros(404, 409, 422))
def inativar_gestor(id_empresa: int, dados: Inativacao, sessao: Sessao):
    empresa = _empresa(sessao, id_empresa)
    empresa.status, empresa.motivo_inativacao = StatusEmpresa.INATIVA, " ".join(dados.motivo.split())
    sessao.commit()
    return _resumo(sessao, empresa)


@roteador.post("/gestores/{id_empresa}/reativar", response_model=GestorResumo, summary="Reativar o gestor (volta a valer a regra da assinatura)", responses=erros(404, 409))
def reativar_gestor(id_empresa: int, sessao: Sessao):
    empresa = _empresa(sessao, id_empresa)
    empresa.status, empresa.motivo_inativacao = StatusEmpresa.ATIVA, None
    atualizar_situacao(sessao, empresa)
    sessao.commit()
    return _resumo(sessao, empresa)


# ---------------------------------------------------------------- pagamentos


@roteador.get("/assinatura", response_model=Assinatura, summary="Valor mensal da assinatura (o mesmo para todos)")
def ver_assinatura(sessao: Sessao):
    return Assinatura(valor=_valor_da_assinatura(sessao))


@roteador.put("/assinatura", response_model=Assinatura, summary="Mudar o valor da assinatura de todos (vale a partir do próximo lançamento)", responses=erros(409, 422))
def mudar_assinatura(dados: Assinatura, sessao: Sessao):
    sessao.execute(update(Empresa).values(valor_assinatura=dados.valor))
    hoje = viagem_servico.agora().date()
    # O que ainda não venceu e está em aberto acompanha o valor novo; o que já venceu fica como foi cobrado.
    sessao.execute(
        update(AssinaturaPagamento)
        .where(AssinaturaPagamento.status == StatusTitulo.ABERTO, AssinaturaPagamento.data_vencimento >= hoje)
        .values(valor=dados.valor)
    )
    sessao.commit()
    return dados


@roteador.get("/pagamentos", response_model=list[Pagamento], summary="Pagamentos da assinatura no mês")
def listar_pagamentos(sessao: Sessao, competencia: date = Query(description="Qualquer dia do mês.")):
    consulta = select(AssinaturaPagamento).where(AssinaturaPagamento.competencia == _mes(competencia)).order_by(AssinaturaPagamento.data_vencimento)
    return [_pagamento(p) for p in sessao.scalars(consulta)]


@roteador.post("/pagamentos/gerar", response_model=list[Pagamento], summary="Lançar a assinatura do mês de cada gestor (não duplica)", responses=erros(409, 422))
def gerar_pagamentos(sessao: Sessao, competencia: date = Query(description="Qualquer dia do mês.")):
    mes = _mes(competencia)
    ja_tem = set(sessao.scalars(select(AssinaturaPagamento.fk_empresa).where(AssinaturaPagamento.competencia == mes)))
    manual = lambda e: e.status == StatusEmpresa.INATIVA and e.motivo_inativacao != MOTIVO_AUTOMATICO  # noqa: E731
    for empresa in sessao.scalars(select(Empresa)):
        if empresa.id not in ja_tem and not manual(empresa):
            sessao.add(AssinaturaPagamento(fk_empresa=empresa.id, competencia=mes, valor=empresa.valor_assinatura, data_vencimento=mes.replace(day=DIA_VENCIMENTO)))
    sessao.commit()
    return listar_pagamentos(sessao, mes)


@roteador.post("/pagamentos/{id_pagamento}/baixa", response_model=Pagamento, summary="Registrar o pagamento da assinatura (libera o acesso)", responses=erros(404, 409))
def receber_pagamento(id_pagamento: int, sessao: Sessao):
    pagamento = sessao.get(AssinaturaPagamento, id_pagamento)
    if pagamento is None:
        raise RecursoNaoEncontrado("Pagamento não encontrado.")
    if pagamento.status != StatusTitulo.ABERTO:
        raise ConflitoDeDados("Este pagamento não está em aberto.")
    pagamento.status, pagamento.data_pagamento = StatusTitulo.PAGO, viagem_servico.agora().date()
    atualizar_situacao(sessao, pagamento.empresa)
    sessao.commit()
    return _pagamento(pagamento)


# ---------------------------------------------------------------- relatório


@roteador.get("/relatorios/inadimplencia", response_model=Tabela, summary="Gestores com assinatura em atraso (e quanto falta para inativar)")
def relatorio_inadimplencia(sessao: Sessao):
    linhas = []
    for g in listar_gestores(sessao):
        if g.em_atraso_desde:
            linhas.append(
                {
                    "empresa": g.nome_fantasia or g.razao_social,
                    "responsavel": g.responsavel,
                    "desde": g.em_atraso_desde.isoformat(),
                    "valor": float(g.valor_assinatura),
                    "situacao": {"em_negociacao": "Em negociação", "inativa": "Inativa", "ativa": "Ativa"}[g.status.value],
                    "dias": g.dias_para_inativar,
                }
            )
    return Tabela(
        colunas=[
            Coluna(chave="empresa", rotulo="Empresa"),
            Coluna(chave="responsavel", rotulo="Responsável"),
            Coluna(chave="desde", rotulo="Em atraso desde", tipo="data"),
            Coluna(chave="valor", rotulo="Assinatura", tipo="moeda"),
            Coluna(chave="situacao", rotulo="Situação"),
            Coluna(chave="dias", rotulo="Dias até inativar", tipo="numero"),
        ],
        linhas=linhas,
        resumo=f"{len(linhas)} gestor(es) com assinatura em atraso.",
    )
