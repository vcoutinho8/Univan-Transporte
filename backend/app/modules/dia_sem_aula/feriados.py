"""Feriados nacionais no calendário, sozinhos: BrasilAPI e, se ela cair, o cálculo local.

Importa uma vez por ano (tabela feriado_importado). Depois disso o calendário é do admin: o
feriado que ele excluir (cancelar) não volta, e o que já estava cadastrado não duplica.
"""

import json
import logging
from datetime import date, timedelta
from urllib.request import Request, urlopen

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.dia_sem_aula.dia_sem_aula_model import DiaSemAula, FeriadoImportado
from app.modules.viagem import viagem_servico

log = logging.getLogger("univan.feriados")

FIXOS = {
    (1, 1): "Confraternização Universal",
    (4, 21): "Tiradentes",
    (5, 1): "Dia do Trabalho",
    (9, 7): "Independência do Brasil",
    (10, 12): "Nossa Senhora Aparecida",
    (11, 2): "Finados",
    (11, 15): "Proclamação da República",
    (11, 20): "Dia da Consciência Negra",
    (12, 25): "Natal",
}


def pascoa(ano: int) -> date:
    """Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano)."""
    a, b, c = ano % 19, ano // 100, ano % 100
    d, e = b // 4, b % 4
    g = (8 * b + 13) // 25
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7  # noqa: E741
    m = (a + 11 * h + 19 * l) // 433
    mes = (h + l - 7 * m + 90) // 25
    return date(ano, mes, (h + l - 7 * m + 33 * mes + 19) % 32)


def calculados(ano: int) -> list[tuple[date, str]]:
    """Os nacionais sem internet: datas fixas e os móveis (Carnaval, Sexta-feira Santa, Corpus Christi)."""
    p = pascoa(ano)
    moveis = [
        (p - timedelta(days=48), "Carnaval"),
        (p - timedelta(days=47), "Carnaval"),
        (p - timedelta(days=2), "Sexta-feira Santa"),
        (p + timedelta(days=60), "Corpus Christi"),
    ]
    return sorted([(date(ano, m, d), nome) for (m, d), nome in FIXOS.items()] + moveis)


def da_brasilapi(ano: int) -> list[tuple[date, str]]:
    pedido = Request(f"https://brasilapi.com.br/api/feriados/v1/{ano}", headers={"User-Agent": "UniVan"})
    with urlopen(pedido, timeout=5) as resposta:  # noqa: S310 (URL fixa, https)
        return [(date.fromisoformat(f["date"]), f["name"]) for f in json.load(resposta)]


def importar_feriados(sessao: Session, ano: int) -> int:
    """Põe os feriados nacionais do ano como dia sem aula geral. Devolve quantos entraram (0 se já foi)."""
    if sessao.get(FeriadoImportado, ano) is not None:
        return 0
    try:
        feriados, fonte = da_brasilapi(ano), "brasilapi"
    except Exception as erro:  # sem internet, fora do ar, resposta estranha: calcula aqui
        log.warning("BrasilAPI indisponível (%s): feriados de %s pelo cálculo local.", erro, ano)
        feriados, fonte = calculados(ano), "calculo"
    ja_tem = set(
        sessao.scalars(
            select(DiaSemAula.data).where(
                DiaSemAula.fk_instituicao.is_(None), DiaSemAula.data.between(date(ano, 1, 1), date(ano, 12, 31))
            )
        )
    )
    novos = {dia: nome for dia, nome in feriados if dia not in ja_tem}
    sessao.add_all(DiaSemAula(data=dia, fk_instituicao=None, motivo=nome) for dia, nome in sorted(novos.items()))
    sessao.add(FeriadoImportado(ano=ano, fonte=fonte, importado_em=viagem_servico.agora()))
    sessao.commit()
    return len(novos)
