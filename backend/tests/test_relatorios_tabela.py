"""Relatórios em tabela: viagens por período, frequência, CNH vencendo e inadimplentes."""

from tests.test_banco_sqlite import cliente, entrar, fabrica  # noqa: F401  (fixtures)


def test_relatorios_em_tabela(cliente):  # noqa: F811
    entrar(cliente, "auxiliar", "123456")
    periodo = {"inicio": "2026-10-01", "fim": "2026-10-31"}
    viagens = cliente.get("/api/relatorios/viagens-periodo", params=periodo).json()
    assert viagens["linhas"] and {"data", "rota", "presentes"} <= set(viagens["linhas"][0])
    frequencia = cliente.get("/api/relatorios/frequencia-passageiro", params=periodo).json()
    assert all(l["frequencia"] is None or 0 <= l["frequencia"] <= 1 for l in frequencia["linhas"])
    cnh = cliente.get("/api/relatorios/cnh-vencendo", params={"dias": 365}).json()
    assert [c["chave"] for c in cnh["colunas"]][:3] == ["motorista", "cnh", "validade"]
    assert "passageiro(s) em atraso" in cliente.get("/api/relatorios/inadimplentes").json()["resumo"]
    assert cliente.get("/api/relatorios/viagens-periodo", params={"inicio": "2026-10-31", "fim": "2026-10-01"}).status_code == 422
    entrar(cliente, "motorista", "123456")
    assert cliente.get("/api/relatorios/inadimplentes").status_code == 403
