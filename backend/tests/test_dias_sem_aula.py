"""Testes dos dias sem aula (feriados, recessos, férias) e do relatório, com banco SQLite de verdade."""

from sqlalchemy import text

from tests.test_banco_sqlite import cliente, fabrica  # noqa: F401  (fixtures)

URL = "/api/dias-sem-aula"
FERIAS = {"data_inicio": "2026-12-21", "data_fim": "2027-01-31", "fk_instituicoes": [], "motivo": "  Férias   acadêmicas "}


def test_cadastra_periodo_sem_duplicar(cliente):  # noqa: F811
    resposta = cliente.post(URL, json=FERIAS)
    assert resposta.status_code == 201, resposta.text
    # 42 dias; Natal (25/12) e 01/01 já existiam como feriado geral.
    assert resposta.json() == {"criados": 40, "ja_existiam": 2, "viagens_geradas": 0, "viagens_canceladas": 0}

    de_novo = cliente.post(URL, json=FERIAS).json()
    assert de_novo["criados"] == 0 and de_novo["ja_existiam"] == 42

    dias = cliente.get(URL, params={"inicio": "2026-12-21", "fim": "2027-01-31"}).json()
    assert len(dias) == 42
    assert {d["motivo"] for d in dias} == {"Férias acadêmicas", "Natal", "Confraternização Universal"}


def test_um_dia_so_para_uma_instituicao(cliente):  # noqa: F811
    resposta = cliente.post(
        URL, json={"data_inicio": "2026-11-24", "data_fim": "2026-11-24", "fk_instituicoes": [1], "motivo": "Prova"}
    ).json()
    assert resposta["criados"] == 1
    da_uvv = cliente.get(URL, params={"inicio": "2026-11-24", "fim": "2026-11-24", "fk_instituicao": 1}).json()
    assert [d["instituicao"]["id"] for d in da_uvv] == [1]
    de_outra = cliente.get(URL, params={"inicio": "2026-11-24", "fim": "2026-11-24", "fk_instituicao": 2}).json()
    assert de_outra == []


def test_avisa_viagens_ja_geradas(cliente):  # noqa: F811
    # Os dados de teste têm viagens em 29/10.
    resposta = cliente.post(
        URL, json={"data_inicio": "2026-10-29", "data_fim": "2026-10-29", "motivo": "Greve"}
    ).json()
    assert resposta["viagens_geradas"] > 0


def test_valida_periodo_motivo_e_instituicao(cliente):  # noqa: F811
    base = {"data_inicio": "2026-12-10", "data_fim": "2026-12-01", "motivo": "x"}
    assert cliente.post(URL, json=base).status_code == 422
    assert cliente.post(URL, json={**base, "data_fim": "2026-12-11", "motivo": "   "}).status_code == 422
    assert cliente.post(URL, json={**base, "data_fim": "2028-01-01"}).status_code == 422
    resposta = cliente.post(URL, json={**base, "data_fim": "2026-12-11", "fk_instituicoes": [1, 999]})
    assert resposta.json()["mensagem"] == "Instituição não encontrada."


def test_periodos_agrupados_e_remocao(cliente):  # noqa: F811
    cliente.post(URL, json=FERIAS)
    periodos = cliente.get(f"{URL}/periodos", params={"inicio": "2026-12-01", "fim": "2027-01-31"}).json()
    ferias = [p for p in periodos if p["motivo"] == "Férias acadêmicas"]
    # O Natal e o 01/01 (outro motivo) quebram as férias em três pedaços seguidos.
    assert [(p["inicio"], p["fim"]) for p in ferias] == [
        ("2026-12-21", "2026-12-24"),
        ("2026-12-26", "2026-12-31"),
        ("2027-01-02", "2027-01-31"),
    ]
    assert ferias[2]["dias"] == 30 and ferias[2]["dias_uteis"] == 20  # 02/01/2027 é sábado
    assert ferias[0]["instituicao"] is None

    removidos = cliente.post(f"{URL}/remover", json={"ids": ferias[2]["ids"]}).json()
    assert removidos == {"removidos": 30}
    assert cliente.post(f"{URL}/remover", json={"ids": ferias[2]["ids"]}).status_code == 404


def test_relatorio_dias_sem_aula(cliente):  # noqa: F811
    relatorio = cliente.get(
        "/api/relatorios/dias-sem-aula", params={"data_inicio": "2026-11-01", "data_fim": "2026-11-30"}
    ).json()
    # Novembro: 3 feriados gerais (02, 15, 20) e 4 de instituições (06, 13, 19, 27).
    assert relatorio["total_dias"] == 7
    assert relatorio["gerais"] == 3
    assert relatorio["dias_uteis"] == 6  # 15/11/2026 é domingo
    assert [p["inicio"] for p in relatorio["periodos"]] == sorted(p["inicio"] for p in relatorio["periodos"])

    so_uvv = cliente.get(
        "/api/relatorios/dias-sem-aula",
        params={"data_inicio": "2026-11-01", "data_fim": "2026-11-30", "fk_instituicao": 1},
    ).json()
    assert so_uvv["total_dias"] == 4  # 3 gerais + a semana acadêmica da UVV
    assert cliente.get("/api/relatorios/dias-sem-aula", params={"data_inicio": "2026-11-30", "data_fim": "2026-11-01"}).status_code == 422


def test_varias_instituicoes_de_uma_vez(cliente):  # noqa: F811
    resposta = cliente.post(
        URL,
        json={"data_inicio": "2026-12-07", "data_fim": "2026-12-09", "fk_instituicoes": [3, 1, 3], "motivo": "Semana de provas"},
    ).json()
    assert resposta["criados"] == 6  # 3 dias x 2 instituições (o 3 repetido conta uma vez)
    periodos = cliente.get(f"{URL}/periodos", params={"inicio": "2026-12-07", "fim": "2026-12-09"}).json()
    provas = [p for p in periodos if p["motivo"] == "Semana de provas"]
    assert sorted(p["instituicao"]["id"] for p in provas) == [1, 3]
    assert all(p["dias"] == 3 for p in provas)


def test_feriados_nacionais_calculados_sem_internet():
    from datetime import date

    from app.modules.dia_sem_aula.feriados import calculados, pascoa

    assert pascoa(2026) == date(2026, 4, 5) and pascoa(2027) == date(2027, 3, 28)
    dias = dict(calculados(2026))
    assert dias[date(2026, 4, 3)] == "Sexta-feira Santa"
    assert dias[date(2026, 2, 16)] == dias[date(2026, 2, 17)] == "Carnaval"
    assert dias[date(2026, 11, 20)] == "Dia da Consciência Negra"


def test_importa_feriados_uma_vez_e_respeita_o_cancelado(fabrica, monkeypatch):  # noqa: F811
    from datetime import date

    from sqlalchemy import select

    from app.modules.dia_sem_aula import feriados
    from app.modules.dia_sem_aula.dia_sem_aula_model import DiaSemAula

    def fora_do_ar(ano):
        raise OSError("sem internet")

    monkeypatch.setattr(feriados, "da_brasilapi", fora_do_ar)
    with fabrica() as sessao:
        ja_tinha = {d for (d,) in sessao.execute(select(DiaSemAula.data).where(DiaSemAula.fk_instituicao.is_(None)))}
        entraram = feriados.importar_feriados(sessao, 2026)
        assert entraram == len({d for d, _ in feriados.calculados(2026)} - ja_tinha)  # os que já estavam não duplicam
        natal = sessao.scalar(select(DiaSemAula).where(DiaSemAula.data == date(2026, 12, 25)))
        sessao.delete(natal)  # o admin cancelou o Natal
        sessao.commit()
        assert feriados.importar_feriados(sessao, 2026) == 0  # não volta
        assert sessao.scalar(select(DiaSemAula).where(DiaSemAula.data == date(2026, 12, 25))) is None


def test_cancela_as_agendadas_e_devolve_ao_remover(cliente, fabrica):  # noqa: F811
    # 30/10 tem 2 viagens agendadas nos dados de teste.
    def situacao():
        with fabrica() as sessao:
            return sessao.execute(text("SELECT status, motivo_encerramento FROM viagem WHERE data = '2026-10-30'")).all()

    resposta = cliente.post(URL, json={"data_inicio": "2026-10-30", "data_fim": "2026-10-30", "motivo": "Greve"}).json()
    assert resposta["viagens_canceladas"] == 2
    assert set(situacao()) == {("cancelada", "Sem aula: Greve")}
    ids = [d["id"] for d in cliente.get(URL, params={"inicio": "2026-10-30", "fim": "2026-10-30"}).json()]
    assert cliente.post(f"{URL}/remover", json={"ids": ids}).status_code == 200
    assert set(situacao()) == {("agendada", None)}
