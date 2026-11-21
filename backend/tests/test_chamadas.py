"""Testes da chamada (aviso prévio "não vou"), com banco SQLite de verdade."""

from datetime import datetime, timedelta

import pytest

from app.modules.viagem import viagem_servico
from tests.test_banco_sqlite import cliente, fabrica  # noqa: F401  (fixtures)

SEGUNDA = "2026-11-23"
URL = "/api/chamadas"


@pytest.fixture
def relogio(monkeypatch):
    """Permite mudar a hora "atual" da API dentro do teste."""
    atual = {"agora": datetime(2026, 11, 23, 7, 0, 0)}
    monkeypatch.setattr(viagem_servico, "agora", lambda: atual["agora"])
    return atual


def _dia(cliente):  # noqa: F811
    cliente.post("/api/viagens/gerar", json={"data": SEGUNDA})
    return cliente.get(URL, params={"data": SEGUNDA}).json()


def _com_ida_e_volta(dia):
    return next(p for p in dia["passageiros"] if p["ida"] and p["volta"] and p["ida"]["horario_previsto"])


def test_lista_do_dia_com_ida_e_volta(cliente, relogio):  # noqa: F811
    dia = _dia(cliente)
    assert dia["resumo"]["passageiros"] == len(dia["passageiros"]) > 0
    assert dia["resumo"]["confirmados"] == dia["resumo"]["passageiros"]  # ninguém avisou ainda
    p = _com_ida_e_volta(dia)
    assert p["ida"]["status"] == "pendente" and p["volta"]["status"] == "pendente"
    assert p["estudante"]["bairro"] and p["motorista"]["nome"] and p["instituicao"]["nome"]

    noite = cliente.get(URL, params={"data": SEGUNDA, "turno": "noite"}).json()
    assert noite["passageiros"] and all(x["turno"] == "noite" for x in noite["passageiros"])


def test_aviso_tira_da_fila_e_pode_ser_desfeito(cliente, relogio):  # noqa: F811
    p = _com_ida_e_volta(_dia(cliente))
    pedido = {"data": SEGUNDA, "fk_estudante": p["estudante"]["id"], "sentidos": ["ida"]}

    avisou = cliente.post(f"{URL}/aviso", json=pedido)
    assert avisou.status_code == 200, avisou.text
    assert avisou.json()["ida"]["status"] == "nao_vai" and avisou.json()["volta"]["status"] == "pendente"
    assert avisou.json()["ida"]["tardio"] is False  # 07:00, bem antes do horário

    # A fila da jornada do motorista não traz mais esse passageiro na ida.
    ida = cliente.get(f"/api/viagens/{p['ida']['fk_viagem']}").json()
    chave = {"data": SEGUNDA, "fk_motorista": ida["motorista"]["id"], "turno": ida["rota"]["turno"], "sentido": "ida"}
    fila = cliente.get("/api/viagens/jornada", params=chave).json()["fila"]
    assert p["estudante"]["id"] not in {c["estudante"]["id"] for c in fila}

    resumo = cliente.get(URL, params={"data": SEGUNDA}).json()["resumo"]
    assert resumo["avisaram"] == 1 and resumo["tardios"] == 0

    voltou = cliente.post(f"{URL}/aviso/desfazer", json=pedido).json()
    assert voltou["ida"]["status"] == "pendente" and voltou["ida"]["horario_aviso"] is None


def test_aviso_de_ultima_hora(cliente, relogio):  # noqa: F811
    p = _com_ida_e_volta(_dia(cliente))
    previsto = datetime.combine(datetime(2026, 11, 23).date(), datetime.strptime(p["ida"]["horario_previsto"], "%H:%M:%S").time())
    relogio["agora"] = previsto - timedelta(minutes=20)
    resposta = cliente.post(f"{URL}/aviso", json={"data": SEGUNDA, "fk_estudante": p["estudante"]["id"], "sentidos": ["ida", "volta"]}).json()
    assert resposta["ida"]["tardio"] is True  # 20 min antes: aceito, mas de última hora
    assert resposta["volta"]["status"] == "nao_vai"
    assert cliente.get(URL, params={"data": SEGUNDA}).json()["resumo"]["tardios"] == 1


def test_nao_avisa_quem_ja_embarcou_nem_viagem_concluida(cliente, relogio):  # noqa: F811
    p = _com_ida_e_volta(_dia(cliente))
    id_viagem, id_estudante = p["ida"]["fk_viagem"], p["estudante"]["id"]
    cliente.post(f"/api/viagens/{id_viagem}/iniciar")
    cliente.post(f"/api/viagens/{id_viagem}/chamadas/{id_estudante}/embarque")
    pedido = {"data": SEGUNDA, "fk_estudante": id_estudante, "sentidos": ["ida"]}
    resposta = cliente.post(f"{URL}/aviso", json=pedido)
    assert resposta.status_code == 409 and "presente" in resposta.json()["mensagem"]

    cliente.post(f"/api/viagens/{id_viagem}/concluir")
    assert cliente.post(f"{URL}/aviso/desfazer", json=pedido).status_code == 409


def test_sem_viagem_no_dia(cliente, relogio):  # noqa: F811
    resposta = cliente.post(f"{URL}/aviso", json={"data": "2026-11-24", "fk_estudante": 1, "sentidos": ["ida"]})
    assert resposta.status_code == 404
    assert "Gere as viagens do dia" in resposta.json()["mensagem"]
    assert cliente.post(f"{URL}/aviso", json={"data": SEGUNDA, "fk_estudante": 1, "sentidos": []}).status_code == 422
