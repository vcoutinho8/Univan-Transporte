"""Melhor ordem das paradas, paradas extras das faculdades e endereço do motorista."""

import itertools

import pytest

from app.modules.rota import otimizacao
from tests.test_banco_sqlite import cliente, entrar, fabrica  # noqa: F401  (fixtures)


@pytest.fixture(autouse=True)
def sem_osrm(monkeypatch):
    """Nada de rede nos testes: só a estimativa em linha reta."""
    monkeypatch.setattr(otimizacao, "_osrm", lambda *_: None)


# ---------------------------------------------------------------- algoritmo


def test_melhor_caminho_acha_o_otimo_em_casos_pequenos():
    # Pontos espalhados; o ótimo é conferido por força bruta.
    pontos = [(0, 0), (5, 1), (1, 4), (6, 5), (2, 1), (4, 4), (7, 0), (3, 6)]
    custo = lambda a, b: ((pontos[a][0] - pontos[b][0]) ** 2 + (pontos[a][1] - pontos[b][1]) ** 2) ** 0.5  # noqa: E731
    meio = list(range(1, 7))
    achado = otimizacao.melhor_caminho(meio, custo, inicio=0, fim=7)
    otimo = min(
        otimizacao.custo_do_caminho([0, *p, 7], custo) for p in itertools.permutations(meio)
    )
    assert sorted(achado) == meio
    assert otimizacao.custo_do_caminho([0, *achado, 7], custo) == pytest.approx(otimo)


def test_vizinho_mais_proximo_desfaz_cruzamentos():
    # Em linha: a ordem certa é 1, 2, 3, 4 mesmo vindo embaralhada.
    pontos = [(0, 0), (1, 0), (2, 0), (3, 0), (4, 0)]
    custo = lambda a, b: abs(pontos[a][0] - pontos[b][0])  # noqa: E731
    assert otimizacao.melhor_caminho([3, 1, 4, 2], custo, inicio=0) == [1, 2, 3, 4]


def test_estimativa_sem_osrm():
    tempos, km, real = otimizacao.matriz_de_tempos([(-20.67, -40.50), (-20.35, -40.30)], None)
    assert not real and tempos[0][0] == 0 and km[0][1] > 40  # Guarapari → Vila Velha


# ---------------------------------------------------------------- API da ordem


def test_ordem_sugerida_sai_da_casa_do_motorista(cliente):  # noqa: F811
    corpo = cliente.get("/api/rotas/ordem", params={"fk_motorista": 1, "turno": "noite"}).json()
    assert corpo["partida"] and corpo["partida"]["endereco"].startswith("Rua Doutor Silva Mello")
    sugerida, atual = corpo["sugerida"], corpo["atual"]
    passageiros = [p for p in sugerida["paradas"] if p["tipo"] == "passageiro"]
    faculdades = [p for p in sugerida["paradas"] if p["tipo"] == "faculdade"]
    assert passageiros and faculdades
    # Todas as casas antes das faculdades, horários crescendo a partir da saída.
    tipos = [p["tipo"] for p in sugerida["paradas"]]
    assert tipos == sorted(tipos, key=lambda t: t == "faculdade")
    horarios = [p["horario"] for p in sugerida["paradas"]]
    assert horarios == sorted(horarios) and horarios[0] >= corpo["horario_saida"]
    assert sugerida["duracao_min"] <= atual["duracao_min"]
    assert corpo["pelas_ruas"] is False


def test_passageiro_da_bioprativas_desce_na_parada_dele(cliente):  # noqa: F811
    corpo = cliente.get("/api/rotas/ordem", params={"fk_motorista": 1, "turno": "noite"}).json()
    nomes = [p["nome"] for p in corpo["sugerida"]["paradas"] if p["tipo"] == "faculdade"]
    assert any("Biopráticas" in n for n in nomes)


def test_aplicar_ordem_grava_os_horarios(cliente):  # noqa: F811
    corpo = cliente.get("/api/rotas/ordem", params={"fk_motorista": 1, "turno": "noite"}).json()
    ordem = [p["fk_estudante"] for p in corpo["sugerida"]["paradas"] if p["tipo"] == "passageiro"]
    invertida = list(reversed(ordem))

    simulada = cliente.post("/api/rotas/ordem/simular", json={"fk_motorista": 1, "turno": "noite", "ordem": invertida})
    assert simulada.status_code == 200
    assert [p["fk_estudante"] for p in simulada.json()["sugerida"]["paradas"] if p["fk_estudante"]] == invertida

    aplicada = cliente.put("/api/rotas/ordem", json={"fk_motorista": 1, "turno": "noite", "ordem": invertida}).json()
    # A ordem atual (pelo horário gravado) agora é a escolhida.
    assert [p["fk_estudante"] for p in aplicada["atual"]["paradas"] if p["fk_estudante"]] == invertida
    primeiro = cliente.get(f"/api/estudantes/{invertida[0]}").json()
    assert primeiro["horario_embarque"][:5] == aplicada["atual"]["paradas"][0]["horario"][:5]


def test_ordem_incompleta_e_recusada(cliente):  # noqa: F811
    resposta = cliente.put("/api/rotas/ordem", json={"fk_motorista": 1, "turno": "noite", "ordem": [1]})
    assert resposta.status_code == 422
    assert "cada passageiro" in resposta.json()["mensagem"]


def test_motorista_nao_mexe_na_ordem(cliente):  # noqa: F811
    entrar(cliente, "motorista", "123456")
    assert cliente.get("/api/rotas/ordem", params={"fk_motorista": 1, "turno": "noite"}).status_code == 403


# ---------------------------------------------------------------- paradas extras e endereços


def test_paradas_extras_da_faculdade(cliente):  # noqa: F811
    uvv = next(i for i in cliente.get("/api/instituicoes").json() if i["id"] == 1)
    assert {p["nome"] for p in uvv["paradas"]} == {"Biopráticas", "Fundos da UVV"}

    nova = cliente.post("/api/instituicoes/1/paradas", json={"nome": "Portão 3", "latitude": -20.3550, "longitude": -40.2985})
    assert nova.status_code == 201 and len(nova.json()["paradas"]) == 3
    repetida = cliente.post("/api/instituicoes/1/paradas", json={"nome": "portão 3", "latitude": -20.3550, "longitude": -40.2985})
    assert repetida.status_code == 409
    # Sem limite de distância: portão afastado do campus também vale.
    longe = cliente.post("/api/instituicoes/1/paradas", json={"nome": "Centro", "latitude": -20.67, "longitude": -40.50})
    assert longe.status_code == 201, longe.text

    # Removendo a Biopráticas, quem usava volta para a principal.
    bio = next(p for p in uvv["paradas"] if p["nome"] == "Biopráticas")
    assert cliente.delete(f"/api/instituicoes/1/paradas/{bio['id']}").status_code == 200
    assert cliente.get("/api/estudantes/1").json()["fk_parada"] is None


def test_parada_do_passageiro_tem_que_ser_da_faculdade_dele(cliente):  # noqa: F811
    assert cliente.get("/api/estudantes/1").json()["parada"]["nome"] == "Biopráticas"
    # Estudante 2 é da UniSales: não pode usar parada da UVV.
    resposta = cliente.patch("/api/estudantes/2", json={"fk_parada": 1})
    assert resposta.status_code == 422 and "não é da faculdade" in resposta.json()["mensagem"]
    # Trocando de faculdade, a parada volta para a principal.
    assert cliente.patch("/api/estudantes/1", json={"fk_instituicao": 2}).json()["fk_parada"] is None


def test_endereco_do_motorista(cliente):  # noqa: F811
    carlos = cliente.get("/api/motoristas/1").json()
    assert carlos["endereco"]["bairro"] == "Centro"
    endereco = {**carlos["endereco"]}
    endereco.pop("id")
    endereco["numero"] = "999"
    alterado = cliente.patch("/api/motoristas/1", json={"endereco": endereco}).json()
    assert alterado["endereco"]["numero"] == "999"
    assert cliente.patch("/api/motoristas/1", json={"endereco": None}).json()["endereco"] is None


# ---------------------------------------------------------------- painel: semana


def test_semana_do_painel_conta_presencas(cliente, monkeypatch):  # noqa: F811
    from datetime import datetime

    from app.modules.viagem import viagem_servico

    monkeypatch.setattr(viagem_servico, "agora", lambda: datetime(2026, 11, 23, 7, 0))  # segunda
    cliente.post("/api/viagens/gerar", json={"data": "2026-11-23"})
    viagem = cliente.get("/api/viagens", params={"data": "2026-11-23", "fk_motorista": 1}).json()[0]
    cliente.post(f"/api/viagens/{viagem['id']}/iniciar")
    detalhe = cliente.get(f"/api/viagens/{viagem['id']}").json()
    cliente.post(f"/api/viagens/{viagem['id']}/chamadas/{detalhe['chamadas'][0]['estudante']['id']}/embarque")

    dias = cliente.get("/api/painel/semana", params={"fim": "2026-11-23"}).json()
    assert len(dias) == 7 and dias[-1]["data"] == "2026-11-23"
    assert dias[-1]["viagens"] > 0 and dias[-1]["presentes"] == 1
    assert dias[0]["viagens"] == 0
