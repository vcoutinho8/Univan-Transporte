"""Rotas HTTP das finanças: a receber (mensalidades dos passageiros) e a pagar (motoristas,
manutenção dos veículos e outros gastos). Gestor e auxiliar."""

from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select, text
from sqlalchemy.orm import Session, joinedload

from app.config.banco import obter_sessao
from app.config.documentacao import erros
from app.config.erros import ConflitoDeDados, DadosInvalidos, RecursoNaoEncontrado
from app.config.rotinas import comandos_da_rotina
from app.config.seguranca import ADMIN_OU_AUXILIAR, Logado
from app.modules.financeiro.titulo_pagar_model import TituloPagar
from app.modules.financeiro.titulo_receber_model import TituloReceber
from app.modules.viagem import viagem_servico
from app.shared.enums import CategoriaTituloPagar, StatusTitulo

roteador = APIRouter(prefix="/financeiro", tags=["Financeiro"], dependencies=[ADMIN_OU_AUXILIAR])

Sessao = Annotated[Session, Depends(obter_sessao)]


# ---------------------------------------------------------------- schemas


class PessoaResumo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    apelido: str | None = None
    celular: str | None = None


class Titulo(BaseModel):
    """Campos comuns: `vencido` = em aberto e com o vencimento já passado."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    competencia: date | None
    valor: Decimal
    data_vencimento: date
    status: StatusTitulo
    vencido: bool = False


class MensalidadeResposta(Titulo):
    estudante: PessoaResumo
    data_recebimento: date | None
    valor_recebido: Decimal | None


class DespesaResposta(Titulo):
    categoria: CategoriaTituloPagar
    descricao: str
    favorecido: str | None
    motorista: PessoaResumo | None
    veiculo_placa: str | None = None
    data_pagamento: date | None
    valor_pago: Decimal | None


class Baixa(BaseModel):
    """Pagamento recebido/feito. Sem valor ou data: o valor do título, hoje."""

    model_config = ConfigDict(extra="forbid")

    valor: Decimal | None = Field(default=None, ge=0)
    data: date | None = None


class DespesaNova(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [{"categoria": "manutencao", "descricao": "Troca de pneus", "valor": "1200.00", "data_vencimento": "2026-12-10", "fk_veiculo": 1}]
        },
    )

    categoria: CategoriaTituloPagar = Field(description="manutencao, combustivel ou outros (o salário entra sozinho).")
    descricao: str | None = Field(default=None, max_length=150, description="Obrigatória em \"outros\".")
    valor: Decimal = Field(gt=0, le=1000000)
    data_vencimento: date
    fk_motorista: int | None = Field(default=None, gt=0)
    fk_veiculo: int | None = Field(default=None, gt=0)

    @field_validator("categoria")
    @classmethod
    def validar_categoria(cls, valor: CategoriaTituloPagar) -> CategoriaTituloPagar:
        if valor not in CATEGORIAS_DO_FORMULARIO:
            raise ValueError("Escolha manutenção, combustível ou outros. O salário entra sozinho pelo cadastro do motorista.")
        return valor

    @field_validator("descricao")
    @classmethod
    def validar_descricao(cls, valor: str | None) -> str | None:
        return " ".join((valor or "").split()) or None


class ResumoMes(BaseModel):
    a_receber: Decimal = Field(description="Total das mensalidades do mês (sem as canceladas).")
    recebido: Decimal
    em_aberto: Decimal
    vencido: Decimal
    a_pagar: Decimal
    pago: Decimal
    saldo: Decimal = Field(description="Recebido menos pago.")


# ---------------------------------------------------------------- ajudantes


CATEGORIAS_DO_FORMULARIO = {CategoriaTituloPagar.MANUTENCAO, CategoriaTituloPagar.COMBUSTIVEL, CategoriaTituloPagar.OUTROS}
ROTULOS = {CategoriaTituloPagar.MANUTENCAO: "Manutenção", CategoriaTituloPagar.COMBUSTIVEL: "Combustível"}


def _mes(competencia: date) -> date:
    return competencia.replace(day=1)


def _gerar_mes_atual(sessao: Session, competencia: date) -> None:
    """Mensalidades e salários entram sozinhos, só no mês corrente (nunca nos futuros). Não duplica."""
    mes = _mes(competencia)
    if mes != _mes(viagem_servico.agora().date()):
        return
    for comando in comandos_da_rotina("gerar_titulos_mes"):
        sessao.execute(text(comando), {"competencia": mes.isoformat()})
    sessao.commit()


def _com_vencido(titulo, resposta):
    hoje = viagem_servico.agora().date()
    return resposta.model_copy(update={"vencido": titulo.status == StatusTitulo.ABERTO and titulo.data_vencimento < hoje})


def _mensalidade(t: TituloReceber) -> MensalidadeResposta:
    return _com_vencido(t, MensalidadeResposta.model_validate(t))


def _despesa(t: TituloPagar) -> DespesaResposta:
    resposta = DespesaResposta.model_validate(t).model_copy(update={"veiculo_placa": t.veiculo.placa if t.veiculo else None})
    return _com_vencido(t, resposta)


def _buscar(sessao: Session, modelo, id_titulo: int):
    titulo = sessao.get(modelo, id_titulo)
    if titulo is None:
        raise RecursoNaoEncontrado("Título não encontrado.")
    return titulo


# ---------------------------------------------------------------- a receber


@roteador.get("/receber", response_model=list[MensalidadeResposta], summary="Mensalidades do mês (pagas, em aberto e vencidas)")
def listar_mensalidades(sessao: Sessao, competencia: date = Query(description="Qualquer dia do mês (ex.: 2026-11-01).")):
    _gerar_mes_atual(sessao, competencia)
    consulta = (
        select(TituloReceber)
        .options(joinedload(TituloReceber.estudante))
        .where(TituloReceber.competencia == _mes(competencia))
        .order_by(TituloReceber.data_vencimento, TituloReceber.id)
    )
    return [_mensalidade(t) for t in sessao.scalars(consulta)]


@roteador.post("/receber/{id_titulo}/baixa", response_model=MensalidadeResposta, summary="Registrar o pagamento da mensalidade", responses=erros(404, 409, 422))
def receber(id_titulo: int, dados: Baixa, sessao: Sessao):
    titulo = _buscar(sessao, TituloReceber, id_titulo)
    if titulo.status != StatusTitulo.ABERTO:
        raise ConflitoDeDados("Esta mensalidade não está em aberto.")
    titulo.status = StatusTitulo.PAGO
    titulo.valor_recebido = dados.valor if dados.valor is not None else titulo.valor
    titulo.data_recebimento = dados.data or viagem_servico.agora().date()
    sessao.commit()
    return _mensalidade(titulo)


# ---------------------------------------------------------------- a pagar


@roteador.get("/pagar", response_model=list[DespesaResposta], summary="Gastos do mês (motoristas, manutenção e outros)")
def listar_despesas(sessao: Sessao, competencia: date = Query(description="Qualquer dia do mês.")):
    _gerar_mes_atual(sessao, competencia)
    inicio = _mes(competencia)
    fim = date(inicio.year + (inicio.month == 12), inicio.month % 12 + 1, 1)
    consulta = (
        select(TituloPagar)
        .options(joinedload(TituloPagar.motorista), joinedload(TituloPagar.veiculo))
        .where((TituloPagar.competencia == inicio) | ((TituloPagar.competencia.is_(None)) & (TituloPagar.data_vencimento >= inicio) & (TituloPagar.data_vencimento < fim)))
        .order_by(TituloPagar.data_vencimento, TituloPagar.id)
    )
    return [_despesa(t) for t in sessao.scalars(consulta)]


@roteador.post("/pagar", response_model=DespesaResposta, status_code=201, summary="Lançar um gasto", responses=erros(409, 422))
def lancar_despesa(dados: DespesaNova, logado: Logado, sessao: Sessao):
    if dados.categoria == CategoriaTituloPagar.OUTROS and not dados.descricao:
        raise DadosInvalidos("Descreva o gasto (ex.: Lavagem da van).")
    descricao = dados.descricao or ROTULOS[dados.categoria]
    campos = dados.model_dump(exclude={"descricao"})
    titulo = TituloPagar(**campos, descricao=descricao, fk_empresa=logado.fk_empresa, competencia=_mes(dados.data_vencimento))
    sessao.add(titulo)
    sessao.commit()
    return _despesa(_buscar(sessao, TituloPagar, titulo.id))


@roteador.post("/pagar/{id_titulo}/baixa", response_model=DespesaResposta, summary="Registrar o pagamento do gasto", responses=erros(404, 409, 422))
def pagar(id_titulo: int, dados: Baixa, sessao: Sessao):
    titulo = _buscar(sessao, TituloPagar, id_titulo)
    if titulo.status != StatusTitulo.ABERTO:
        raise ConflitoDeDados("Este gasto não está em aberto.")
    titulo.status = StatusTitulo.PAGO
    titulo.valor_pago = dados.valor if dados.valor is not None else titulo.valor
    titulo.data_pagamento = dados.data or viagem_servico.agora().date()
    sessao.commit()
    return _despesa(titulo)


@roteador.post("/pagar/{id_titulo}/cancelar", response_model=DespesaResposta, summary="Cancelar um gasto lançado errado", responses=erros(404, 409))
def cancelar_despesa(id_titulo: int, sessao: Sessao):
    titulo = _buscar(sessao, TituloPagar, id_titulo)
    if titulo.status == StatusTitulo.PAGO:
        raise ConflitoDeDados("Gasto já pago não se cancela.")
    if titulo.categoria == CategoriaTituloPagar.SALARIO:
        raise ConflitoDeDados("O salário vem do cadastro do motorista: ajuste lá.")
    titulo.status = StatusTitulo.CANCELADO
    sessao.commit()
    return _despesa(titulo)


# ---------------------------------------------------------------- resumo


@roteador.get("/resumo", response_model=ResumoMes, summary="Totais do mês: a receber, recebido, vencido, a pagar e saldo")
def resumo(sessao: Sessao, competencia: date = Query(description="Qualquer dia do mês.")):
    receber = [t for t in listar_mensalidades(sessao, competencia) if t.status != StatusTitulo.CANCELADO]
    pagar = [t for t in listar_despesas(sessao, competencia) if t.status != StatusTitulo.CANCELADO]
    zero = Decimal("0")
    recebido = sum((t.valor_recebido or zero for t in receber if t.status == StatusTitulo.PAGO), zero)
    pago = sum((t.valor_pago or zero for t in pagar if t.status == StatusTitulo.PAGO), zero)
    return ResumoMes(
        a_receber=sum((t.valor for t in receber), zero),
        recebido=recebido,
        em_aberto=sum((t.valor for t in receber if t.status == StatusTitulo.ABERTO), zero),
        vencido=sum((t.valor for t in receber if t.vencido), zero),
        a_pagar=sum((t.valor for t in pagar), zero),
        pago=pago,
        saldo=recebido - pago,
    )
