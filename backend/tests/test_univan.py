"""Gerente UniVan: gestores, assinaturas (em atraso: negociação; 30 dias: inativa) e o login."""

from datetime import datetime

import pytest

from app.config import seguranca
from app.modules.viagem import viagem_servico
from tests.test_banco_sqlite import cliente, entrar, fabrica  # noqa: F401  (fixtures)


@pytest.fixture(autouse=True)
def hoje_dia_22(monkeypatch):
    monkeypatch.setattr(viagem_servico, "agora", lambda: datetime(2026, 11, 22, 9, 0, 0))
    seguranca._tentativas.clear()


def _por_cnpj(gestores, cnpj):
    return next(g for g in gestores if g["cnpj"] == cnpj)


def test_painel_e_situacao_pelas_datas(cliente):  # noqa: F811
    entrar(cliente, "univan", "123456")
    gestores = cliente.get("/api/univan/gestores").json()
    assert _por_cnpj(gestores, "44555666000181")["status"] == "em_negociacao"  # novembro em atraso (12 dias)
    assert _por_cnpj(gestores, "44555666000181")["dias_para_inativar"] == 18
    assert _por_cnpj(gestores, "55666777000181")["status"] == "inativa"  # desde outubro: mais de 30 dias
    painel = cliente.get("/api/univan/painel").json()
    assert painel["em_negociacao"] >= 1 and painel["inativos"] >= 1 and len(painel["meses"]) == 6
    assert "em atraso" in cliente.get("/api/univan/relatorios/inadimplencia").json()["resumo"]


def test_cria_gestor_que_entra_pelo_cnpj(cliente):  # noqa: F811
    entrar(cliente, "univan", "123456")
    novo = {"nome_fantasia": "Vans do Sul", "cnpj": "12.345.678/0001-95", "responsavel": "Marta Lima", "email": "marta@vansdosul.com.br"}
    assert cliente.post("/api/univan/gestores", json={**novo, "cnpj": "12.345.678/0001-00"}).status_code == 422  # dígito errado
    assert cliente.post("/api/univan/gestores", json={**novo, "email": "marta@"}).status_code == 422
    cliente.put("/api/univan/assinatura", json={"valor": "249.90"})
    criado = cliente.post("/api/univan/gestores", json=novo)
    assert criado.status_code == 201, criado.text
    assert (criado.json()["gestor"]["login"], criado.json()["valor_assinatura"]) == ("12345678000195", "249.90")
    assert cliente.get("/api/univan/assinatura").json()["valor"] == "249.90"
    assert cliente.post("/api/univan/gestores", json=novo).status_code == 409  # CNPJ repetido
    assert entrar(cliente, "12.345.678/0001-95", "123456")["usuario"]["trocar_senha"] is True  # com máscara também entra


def test_inativar_bloqueia_e_pagamento_libera(cliente):  # noqa: F811
    entrar(cliente, "univan", "123456")
    joao = _por_cnpj(cliente.get("/api/univan/gestores").json(), "22333444000181")
    cliente.post(f"/api/univan/gestores/{joao['id']}/inativar", json={"motivo": "Pediu cancelamento"})
    cliente.headers.pop("Authorization", None)
    assert cliente.post("/api/auth/login", json={"usuario": "joao", "senha": "123456"}).status_code == 403
    entrar(cliente, "univan", "123456")
    cliente.post(f"/api/univan/gestores/{joao['id']}/reativar")
    entrar(cliente, "joao", "123456")

    # Assinatura de agosto em aberto para todos: mais de 30 dias de atraso, a empresa trava sozinha.
    entrar(cliente, "univan", "123456")
    pagamentos = cliente.post("/api/univan/pagamentos/gerar", params={"competencia": "2026-08-01"}).json()
    cliente.headers.pop("Authorization", None)
    assert cliente.post("/api/auth/login", json={"usuario": "admin", "senha": "123456"}).status_code == 403
    entrar(cliente, "univan", "123456")
    da_empresa_1 = next(p for p in pagamentos if p["fk_empresa"] == 1)
    assert cliente.post(f"/api/univan/pagamentos/{da_empresa_1['id']}/baixa").json()["status"] == "pago"
    assert entrar(cliente, "admin", "123456")["aviso_assinatura"] is None  # pagou: volta ao normal


def test_so_o_gerente_acessa(cliente):  # noqa: F811
    for login in ("admin", "motorista"):
        entrar(cliente, login, "123456")
        assert cliente.get("/api/univan/gestores").status_code == 403
