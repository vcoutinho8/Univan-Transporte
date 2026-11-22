"""Relatórios em tabela (formato único: colunas + linhas), para a tela genérica de relatórios:
viagens por período, frequência por passageiro, CNH vencendo e inadimplentes."""

from datetime import date, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config.banco import obter_sessao
from app.config.erros import DadosInvalidos
from app.config.seguranca import ADMIN_OU_AUXILIAR
from app.modules.viagem import viagem_servico

roteador = APIRouter(prefix="/relatorios", tags=["Relatórios"], dependencies=[ADMIN_OU_AUXILIAR])

Sessao = Annotated[Session, Depends(obter_sessao)]
Tipo = Literal["texto", "numero", "moeda", "data", "percentual"]


class Coluna(BaseModel):
    chave: str
    rotulo: str
    tipo: Tipo = "texto"


class Tabela(BaseModel):
    colunas: list[Coluna]
    linhas: list[dict]
    resumo: str


def _periodo(inicio: date, fim: date) -> None:
    if fim < inicio:
        raise DadosInvalidos("A data final é anterior à inicial.")
    if (fim - inicio).days > 366:
        raise DadosInvalidos("Escolha no máximo um ano.")


def _linhas(sessao: Session, sql: str, parametros: dict) -> list[dict]:
    return [dict(linha) for linha in sessao.execute(text(sql), parametros).mappings()]


@roteador.get("/viagens-periodo", response_model=Tabela, summary="Viagens por período: rota, motorista, situação e presença")
def viagens_por_periodo(sessao: Sessao, inicio: date = Query(), fim: date = Query()):
    _periodo(inicio, fim)
    linhas = _linhas(
        sessao,
        """
        SELECT v.data, r.nome AS rota, m.nome AS motorista, v.sentido, v.status,
               SUM(CASE WHEN ch.status = 'presente' THEN 1 ELSE 0 END) AS presentes,
               SUM(CASE WHEN ch.status = 'ausente' THEN 1 ELSE 0 END) AS faltas,
               SUM(CASE WHEN ch.status = 'nao_vai' THEN 1 ELSE 0 END) AS avisaram
        FROM viagem v
        JOIN rota r ON r.id = v.fk_rota
        JOIN motorista m ON m.id = v.fk_motorista
        LEFT JOIN chamada ch ON ch.fk_viagem = v.id
        WHERE v.data BETWEEN :inicio AND :fim
        GROUP BY v.id, v.data, r.nome, m.nome, v.sentido, v.status
        ORDER BY v.data, v.sentido, m.nome
        """,
        {"inicio": inicio, "fim": fim},
    )
    concluidas = sum(1 for l in linhas if l["status"] == "concluida")
    return Tabela(
        colunas=[
            Coluna(chave="data", rotulo="Data", tipo="data"),
            Coluna(chave="rota", rotulo="Rota"),
            Coluna(chave="motorista", rotulo="Motorista"),
            Coluna(chave="sentido", rotulo="Sentido"),
            Coluna(chave="status", rotulo="Situação"),
            Coluna(chave="presentes", rotulo="Presentes", tipo="numero"),
            Coluna(chave="faltas", rotulo="Faltas", tipo="numero"),
            Coluna(chave="avisaram", rotulo="Avisaram", tipo="numero"),
        ],
        linhas=linhas,
        resumo=f"{len(linhas)} viagem(ns) no período, {concluidas} concluída(s).",
    )


@roteador.get("/frequencia-passageiro", response_model=Tabela, summary="Frequência por passageiro: presenças, faltas e avisos")
def frequencia_por_passageiro(sessao: Sessao, inicio: date = Query(), fim: date = Query()):
    _periodo(inicio, fim)
    linhas = _linhas(
        sessao,
        """
        SELECT e.nome AS passageiro, i.nome AS instituicao,
               SUM(CASE WHEN ch.status = 'presente' THEN 1 ELSE 0 END) AS presencas,
               SUM(CASE WHEN ch.status = 'ausente' THEN 1 ELSE 0 END) AS faltas,
               SUM(CASE WHEN ch.status = 'nao_vai' THEN 1 ELSE 0 END) AS avisos
        FROM chamada ch
        JOIN viagem v ON v.id = ch.fk_viagem
        JOIN estudante e ON e.id = ch.fk_estudante
        JOIN instituicao i ON i.id = e.fk_instituicao
        WHERE v.data BETWEEN :inicio AND :fim AND v.status <> 'cancelada'
        GROUP BY e.id, e.nome, i.nome
        ORDER BY e.nome
        """,
        {"inicio": inicio, "fim": fim},
    )
    for l in linhas:
        registradas = l["presencas"] + l["faltas"]
        l["frequencia"] = round(l["presencas"] / registradas, 4) if registradas else None
    return Tabela(
        colunas=[
            Coluna(chave="passageiro", rotulo="Passageiro"),
            Coluna(chave="instituicao", rotulo="Instituição"),
            Coluna(chave="presencas", rotulo="Presenças", tipo="numero"),
            Coluna(chave="faltas", rotulo="Faltas sem aviso", tipo="numero"),
            Coluna(chave="avisos", rotulo="Avisou que não ia", tipo="numero"),
            Coluna(chave="frequencia", rotulo="Frequência", tipo="percentual"),
        ],
        linhas=linhas,
        resumo=f"{len(linhas)} passageiro(s) com viagem no período.",
    )


@roteador.get("/cnh-vencendo", response_model=Tabela, summary="CNH vencida ou vencendo nos próximos dias")
def cnh_vencendo(sessao: Sessao, dias: int = Query(default=60, ge=0, le=365)):
    hoje = viagem_servico.agora().date()
    linhas = _linhas(
        sessao,
        "SELECT nome AS motorista, cnh, cnh_validade AS validade, status FROM motorista WHERE cnh_validade <= :limite ORDER BY cnh_validade",
        {"limite": hoje + timedelta(days=dias)},
    )
    for l in linhas:
        l["dias"] = (date.fromisoformat(str(l["validade"])) - hoje).days
        l["situacao"] = "Vencida" if l["dias"] < 0 else "Vence hoje" if l["dias"] == 0 else "Vencendo"
    return Tabela(
        colunas=[
            Coluna(chave="motorista", rotulo="Motorista"),
            Coluna(chave="cnh", rotulo="CNH"),
            Coluna(chave="validade", rotulo="Validade", tipo="data"),
            Coluna(chave="dias", rotulo="Dias restantes", tipo="numero"),
            Coluna(chave="situacao", rotulo="Situação"),
            Coluna(chave="status", rotulo="Cadastro"),
        ],
        linhas=linhas,
        resumo=f"{sum(1 for l in linhas if l['dias'] < 0)} vencida(s) e {sum(1 for l in linhas if l['dias'] >= 0)} vencendo em até {dias} dias.",
    )


@roteador.get("/inadimplentes", response_model=Tabela, summary="Passageiros com mensalidade vencida e em aberto")
def inadimplentes(sessao: Sessao):
    hoje = viagem_servico.agora().date()
    linhas = _linhas(
        sessao,
        """
        SELECT e.nome AS passageiro, e.celular, COUNT(*) AS mensalidades, SUM(t.valor) AS total, MIN(t.data_vencimento) AS desde
        FROM titulo_receber t
        JOIN estudante e ON e.id = t.fk_estudante
        WHERE t.status = 'aberto' AND t.data_vencimento < :hoje
        GROUP BY e.id, e.nome, e.celular
        ORDER BY total DESC
        """,
        {"hoje": hoje},
    )
    for l in linhas:
        l["total"] = float(l["total"] or 0)
    total = sum(l["total"] for l in linhas)
    return Tabela(
        colunas=[
            Coluna(chave="passageiro", rotulo="Passageiro"),
            Coluna(chave="celular", rotulo="Celular"),
            Coluna(chave="mensalidades", rotulo="Mensalidades em atraso", tipo="numero"),
            Coluna(chave="total", rotulo="Total em atraso", tipo="moeda"),
            Coluna(chave="desde", rotulo="Atrasado desde", tipo="data"),
        ],
        linhas=linhas,
        resumo=f"{len(linhas)} passageiro(s) em atraso, somando R$ {total:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") + ".",
    )
