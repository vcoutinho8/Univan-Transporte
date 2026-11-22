"""Testes do relatório de passageiros ativos com banco SQLite de verdade."""

from decimal import Decimal

from tests.test_banco_sqlite import cliente, fabrica  # noqa: F401  (fixtures)

URL = "/api/relatorios/estudantes-ativos"
PERIODO = {"data_inicio": "2026-10-01", "data_fim": "2026-10-31"}


def test_relatorio_bate_com_o_cadastro(cliente):  # noqa: F811
    relatorio = cliente.get(URL, params=PERIODO).json()
    ativos = cliente.get("/api/estudantes", params={"status": "ativo"}).json()

    assert relatorio["total"] == len(ativos) == len(relatorio["estudantes"])
    assert {e["id"] for e in relatorio["estudantes"]} == {e["id"] for e in ativos}
    assert Decimal(relatorio["valor_mensal_total"]) == sum(Decimal(str(e["valor_mensal"])) for e in ativos)
    assert sum(i["total"] for i in relatorio["por_instituicao"]) == relatorio["total"]
    assert sum(t["total"] for t in relatorio["por_turno"]) == relatorio["total"]
    assert relatorio["sem_area"] == sum(1 for e in ativos if e["fk_area"] is None)

    nomes = [e["nome"] for e in relatorio["estudantes"]]
    assert nomes == sorted(nomes)
    totais = [i["total"] for i in relatorio["por_instituicao"]]
    assert totais == sorted(totais, reverse=True)


def test_rota_de_cada_passageiro(cliente):  # noqa: F811
    relatorio = cliente.get(URL, params=PERIODO).json()
    camila = next(e for e in relatorio["estudantes"] if e["nome"] == "Camila Rodrigues")
    assert camila["rota"]["id"] == 3
    # Quem não tem área não entra em rota nenhuma.
    assert all(e["rota"] is None for e in relatorio["estudantes"] if e["area"] is None)
    assert relatorio["sem_rota"] == sum(1 for e in relatorio["estudantes"] if e["rota"] is None)

    # Rota inativa deixa de levar o passageiro.
    cliente.delete("/api/rotas/3")
    camila = next(e for e in cliente.get(URL, params=PERIODO).json()["estudantes"] if e["nome"] == "Camila Rodrigues")
    assert camila["rota"] is None


def test_filtros(cliente):  # noqa: F811
    noite = cliente.get(URL, params={**PERIODO, "turno": "noite"}).json()
    assert noite["total"] > 0
    assert all(e["turno"] == "noite" for e in noite["estudantes"])
    assert [t["turno"] for t in noite["por_turno"]] == ["noite"]

    da_uvv = cliente.get(URL, params={**PERIODO, "fk_instituicao": 1}).json()
    assert all(e["instituicao"]["id"] == 1 for e in da_uvv["estudantes"])

    assert cliente.get(URL, params={**PERIODO, "turno": "madrugada"}).status_code == 422


def test_inativo_sai_do_relatorio(cliente):  # noqa: F811
    antes = cliente.get(URL, params=PERIODO).json()
    alvo = antes["estudantes"][0]
    cliente.delete(f"/api/estudantes/{alvo['id']}")
    depois = cliente.get(URL, params=PERIODO).json()
    assert depois["total"] == antes["total"] - 1
    assert alvo["id"] not in {e["id"] for e in depois["estudantes"]}


def test_periodo_obrigatorio_e_valido(cliente):  # noqa: F811
    assert cliente.get(URL).status_code == 422  # sem período
    invertido = cliente.get(URL, params={"data_inicio": "2026-10-31", "data_fim": "2026-10-01"})
    assert invertido.status_code == 422
    assert invertido.json()["mensagem"] == "Período inválido: a data final é anterior à data inicial."
    longo = cliente.get(URL, params={"data_inicio": "2025-01-01", "data_fim": "2026-10-01"})
    assert longo.json()["mensagem"] == "Período longo demais: escolha no máximo um ano."


def test_frequencia_no_periodo(cliente):  # noqa: F811
    outubro = cliente.get(URL, params=PERIODO).json()
    assert outubro["data_inicio"] == "2026-10-01"
    # Os dados de teste têm viagens em 29/10: alguém embarcou, alguém faltou.
    assert outubro["presencas"] > 0 and outubro["faltas"] > 0
    assert outubro["presencas"] == sum(e["presencas"] for e in outubro["estudantes"])

    novembro = cliente.get(URL, params={"data_inicio": "2026-11-01", "data_fim": "2026-11-30"}).json()
    assert novembro["presencas"] == 0 and novembro["total"] == outubro["total"]
