"""Finanças: mensalidades (a receber) e gastos (a pagar), com banco SQLite de verdade."""

from datetime import datetime

import pytest

from app.modules.viagem import viagem_servico
from tests.test_banco_sqlite import cliente, entrar, fabrica  # noqa: F401  (fixtures)

MES = "2026-11-01"


@pytest.fixture(autouse=True)
def hoje_dia_20(monkeypatch):
    monkeypatch.setattr(viagem_servico, "agora", lambda: datetime(2026, 11, 20, 9, 0, 0))


def test_mes_atual_gera_sozinho_e_futuro_nao(cliente):  # noqa: F811
    entrar(cliente, "40000000124", "123456")
    assert cliente.get("/api/financeiro/receber", params={"competencia": "2026-12-01"}).json() == []  # futuro: nada
    mensalidades = cliente.get("/api/financeiro/receber", params={"competencia": "2026-11-15"}).json()
    assert len(mensalidades) == len(cliente.get("/api/financeiro/receber", params={"competencia": MES}).json())  # não duplica
    salarios = [g for g in cliente.get("/api/financeiro/pagar", params={"competencia": MES}).json() if g["categoria"] == "salario"]
    assert salarios
    assert cliente.post(f"/api/financeiro/pagar/{salarios[0]['id']}/cancelar").status_code == 409  # salário não se cancela

    vencida = next(m for m in mensalidades if m["vencido"])  # venceu antes do dia 20 e está em aberto
    pago = cliente.post(f"/api/financeiro/receber/{vencida['id']}/baixa", json={}).json()
    assert (pago["status"], pago["valor_recebido"], pago["vencido"]) == ("pago", vencida["valor"], False)
    assert cliente.post(f"/api/financeiro/receber/{vencida['id']}/baixa", json={}).status_code == 409


def test_lanca_paga_e_resume_gastos(cliente):  # noqa: F811
    entrar(cliente, "11222333000181", "123456")
    nova = {"categoria": "manutencao", "descricao": " Troca  de pneus ", "valor": "1200.00", "data_vencimento": "2026-11-25", "fk_veiculo": 1}
    gasto = cliente.post("/api/financeiro/pagar", json=nova)
    assert gasto.status_code == 201, gasto.text
    assert (gasto.json()["descricao"], gasto.json()["veiculo_placa"]) == ("Troca de pneus", "QJA1B23")
    assert cliente.post("/api/financeiro/pagar", json={**nova, "categoria": "salario"}).status_code == 422  # salário vem do cadastro
    assert cliente.post("/api/financeiro/pagar", json={**nova, "categoria": "outros", "descricao": " "}).status_code == 422  # outros: descreva
    sem_descricao = cliente.post("/api/financeiro/pagar", json={**nova, "descricao": None, "categoria": "combustivel"}).json()
    assert sem_descricao["descricao"] == "Combustível"
    cliente.post(f"/api/financeiro/pagar/{gasto.json()['id']}/baixa", json={"valor": "1100.00"})
    resumo = cliente.get("/api/financeiro/resumo", params={"competencia": MES}).json()
    assert float(resumo["pago"]) >= 1100 and float(resumo["saldo"]) == float(resumo["recebido"]) - float(resumo["pago"])


def test_motorista_nao_ve_financas(cliente):  # noqa: F811
    entrar(cliente, "20130140155", "123456")
    assert cliente.get("/api/financeiro/resumo", params={"competencia": MES}).status_code == 403


def test_salario_de_motorista_inativo_fica_bloqueado(cliente):  # noqa: F811
    entrar(cliente, "11222333000181", "123456")
    salario = next(g for g in cliente.get("/api/financeiro/pagar", params={"competencia": MES}).json() if g["categoria"] == "salario" and g["status"] == "aberto")
    assert cliente.delete(f"/api/motoristas/{salario['motorista']['id']}").status_code == 200
    bloqueado = next(g for g in cliente.get("/api/financeiro/pagar", params={"competencia": MES}).json() if g["id"] == salario["id"])
    assert bloqueado["bloqueado"] is True
    assert cliente.post(f"/api/financeiro/pagar/{salario['id']}/baixa", json={}).status_code == 409
