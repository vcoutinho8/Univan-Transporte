"""Testes da API de viagens com banco SQLite de verdade (dados de teste completos)."""

from datetime import datetime

import pytest

from app.config.rotinas import comandos_da_rotina
from app.modules.viagem import viagem_servico
from tests.test_banco_sqlite import cliente, fabrica  # noqa: F401  (fixtures)

SEGUNDA = "2026-11-23"  # dia comum de aula
DOMINGO = "2026-11-22"  # nenhuma rota roda
FINADOS = "2026-11-02"  # feriado geral (dia_sem_aula sem instituição)
SEMANA_UVV = "2026-11-06"  # sem aula só na UVV (instituição 1)


@pytest.fixture
def hoje_e_segunda(monkeypatch):
    """Faz a API achar que agora é a segunda de teste, às 7h."""
    monkeypatch.setattr(viagem_servico, "agora", lambda: datetime(2026, 11, 23, 7, 0, 0))


def _gerar(cliente, data):  # noqa: F811
    resposta = cliente.post("/api/viagens/gerar", json={"data": data})
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def _viagem_com_passageiros(cliente, data=SEGUNDA, minimo=2):  # noqa: F811
    viagens = cliente.get("/api/viagens", params={"data": data}).json()
    return next(v for v in viagens if v["passageiros"]["total"] >= minimo)


def test_rotinas_lidas_do_arquivo():
    assert len(comandos_da_rotina("gerar_dia")) == 2
    assert all(c.startswith("UPDATE") for c in comandos_da_rotina("concluir_viagem"))
    with pytest.raises(KeyError):
        comandos_da_rotina("nao_existe")


def test_gera_o_dia_uma_vez_so(cliente):  # noqa: F811
    primeira = _gerar(cliente, SEGUNDA)
    assert primeira["viagens_criadas"] > 0
    assert primeira["chamadas_criadas"] > 0
    assert primeira["avisos"] == []

    viagens = cliente.get("/api/viagens", params={"data": SEGUNDA}).json()
    assert len(viagens) == primeira["viagens_criadas"]
    # Cada rota gera uma ida e uma volta.
    assert {v["sentido"] for v in viagens} == {"ida", "volta"}
    assert sum(v["passageiros"]["total"] for v in viagens) == primeira["chamadas_criadas"]
    assert all(v["status"] == "agendada" and v["passageiros"]["pendente"] == v["passageiros"]["total"] for v in viagens)
    # Em ordem de saída.
    horarios = [v["horario_previsto"] for v in viagens if v["horario_previsto"]]
    assert horarios == sorted(horarios)

    segunda = _gerar(cliente, SEGUNDA)
    assert segunda["viagens_criadas"] == 0 and segunda["chamadas_criadas"] == 0
    assert segunda["avisos"] == ["As viagens deste dia já tinham sido geradas."]
    assert len(cliente.get("/api/viagens", params={"data": SEGUNDA}).json()) == len(viagens)


def test_feriado_e_domingo_nao_geram(cliente):  # noqa: F811
    feriado = _gerar(cliente, FINADOS)
    assert feriado["viagens_criadas"] == 0
    assert feriado["avisos"] == ["Sem aula em todas as instituições: Finados."]

    domingo = _gerar(cliente, DOMINGO)
    assert domingo["viagens_criadas"] == 0
    assert domingo["avisos"] == ["Nenhuma rota ativa roda neste dia da semana."]


def test_sem_aula_numa_instituicao_so(cliente):  # noqa: F811
    resposta = _gerar(cliente, SEMANA_UVV)
    assert resposta["viagens_criadas"] > 0
    assert any("Semana acadêmica UVV" in aviso for aviso in resposta["avisos"])
    viagens = cliente.get("/api/viagens", params={"data": SEMANA_UVV}).json()
    assert all(v["rota"]["instituicao"]["id"] != 1 for v in viagens)


def test_filtros_da_lista(cliente):  # noqa: F811
    _gerar(cliente, SEGUNDA)
    noite = cliente.get("/api/viagens", params={"data": SEGUNDA, "turno": "noite"}).json()
    assert noite and all(v["rota"]["turno"] == "noite" for v in noite)
    do_marcos = cliente.get("/api/viagens", params={"data": SEGUNDA, "fk_motorista": 3}).json()
    assert do_marcos and all(v["motorista"]["id"] == 3 for v in do_marcos)
    concluidas = cliente.get("/api/viagens", params={"status": "concluida"}).json()
    assert concluidas and all(v["status"] == "concluida" for v in concluidas)


def test_detalhe_traz_os_passageiros_em_ordem(cliente):  # noqa: F811
    _gerar(cliente, SEGUNDA)
    viagem = _viagem_com_passageiros(cliente)
    detalhe = cliente.get(f"/api/viagens/{viagem['id']}").json()
    assert len(detalhe["chamadas"]) == viagem["passageiros"]["total"]
    horarios = [c["horario_previsto"] for c in detalhe["chamadas"] if c["horario_previsto"]]
    assert horarios == sorted(horarios)
    assert detalhe["chamadas"][0]["estudante"]["nome"]
    assert cliente.get("/api/viagens/99999").status_code == 404


def test_inicia_e_conclui(cliente, hoje_e_segunda):  # noqa: F811
    _gerar(cliente, SEGUNDA)
    viagem = _viagem_com_passageiros(cliente)

    assert cliente.post(f"/api/viagens/{viagem['id']}/concluir").status_code == 409  # ainda não iniciou

    iniciada = cliente.post(f"/api/viagens/{viagem['id']}/iniciar")
    assert iniciada.status_code == 200, iniciada.text
    assert iniciada.json()["status"] == "em_andamento"
    assert iniciada.json()["horario_saida"] == "2026-11-23T07:00:00"
    assert cliente.post(f"/api/viagens/{viagem['id']}/iniciar").status_code == 409

    concluida = cliente.post(f"/api/viagens/{viagem['id']}/concluir").json()
    assert concluida["status"] == "concluida"
    assert concluida["horario_chegada"] == "2026-11-23T07:00:00"
    # Ninguém teve presença registrada: todos os pendentes viram ausentes.
    assert concluida["passageiros"]["pendente"] == 0
    assert concluida["passageiros"]["ausente"] == viagem["passageiros"]["total"]

    resposta = cliente.post(f"/api/viagens/{viagem['id']}/cancelar")
    assert resposta.status_code == 409
    assert resposta.json()["mensagem"] == "Só dá para cancelar uma viagem agendada; esta está concluída."


def test_nao_inicia_viagem_de_dia_futuro(cliente, hoje_e_segunda):  # noqa: F811
    _gerar(cliente, "2026-11-24")
    viagem = cliente.get("/api/viagens", params={"data": "2026-11-24"}).json()[0]
    resposta = cliente.post(f"/api/viagens/{viagem['id']}/iniciar")
    assert resposta.status_code == 409
    assert "ainda não chegou" in resposta.json()["mensagem"]


def test_cancela_agendada(cliente):  # noqa: F811
    _gerar(cliente, SEGUNDA)
    viagem = _viagem_com_passageiros(cliente)
    cancelada = cliente.post(f"/api/viagens/{viagem['id']}/cancelar").json()
    assert cancelada["status"] == "cancelada"
    assert cliente.patch(f"/api/viagens/{viagem['id']}", json={"fk_veiculo": 3}).status_code == 409


def test_substitui_motorista_e_veiculo(cliente):  # noqa: F811
    _gerar(cliente, SEGUNDA)
    viagem = _viagem_com_passageiros(cliente)
    assert viagem["substituicao"] is False

    outro_motorista = 9 if viagem["motorista"]["id"] != 9 else 8
    resposta = cliente.patch(
        f"/api/viagens/{viagem['id']}", json={"fk_motorista": outro_motorista, "fk_veiculo": 3}
    )
    assert resposta.status_code == 200, resposta.text
    trocada = resposta.json()
    assert trocada["motorista"]["id"] == outro_motorista
    assert trocada["veiculo"]["placa"] == "MHB1234"
    assert trocada["substituicao"] is True
    # O cadastro da rota não muda.
    rota = cliente.get(f"/api/rotas/{viagem['rota']['id']}").json()
    assert rota["fk_motorista"] == viagem["motorista"]["id"]


def test_recusa_substituicao_invalida(cliente):  # noqa: F811
    _gerar(cliente, SEGUNDA)
    viagem = _viagem_com_passageiros(cliente)
    url = f"/api/viagens/{viagem['id']}"

    assert cliente.patch(url, json={}).status_code == 422
    assert cliente.patch(url, json={"fk_motorista": 10}).json()["mensagem"] == "O motorista Sérgio Mendes Ramos está inativo."
    assert cliente.patch(url, json={"fk_veiculo": 10}).json()["mensagem"] == "O veículo MLD9012 está inativo."
    assert cliente.patch(url, json={"fk_veiculo": 999}).status_code == 422

    pequeno = cliente.post("/api/veiculos", json={"placa": "ZZZ1A11", "modelo": "Carro", "capacidade": 1}).json()
    resposta = cliente.patch(url, json={"fk_veiculo": pequeno["id"]})
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"].startswith("O veículo ZZZ1A11 tem 1 lugares")


def test_registra_passageiro_por_passageiro(cliente, hoje_e_segunda):  # noqa: F811
    _gerar(cliente, SEGUNDA)
    viagem = _viagem_com_passageiros(cliente)
    url = f"/api/viagens/{viagem['id']}"
    primeiro, segundo = (c["estudante"] for c in cliente.get(url).json()["chamadas"][:2])
    assert primeiro["endereco"]["logradouro"]

    # Antes de iniciar, não dá para registrar.
    assert cliente.post(f"{url}/chamadas/{primeiro['id']}/embarque").status_code == 409
    cliente.post(f"{url}/iniciar")

    resposta = cliente.post(f"{url}/chamadas/{primeiro['id']}/embarque")
    assert resposta.status_code == 200, resposta.text
    chamada = next(c for c in resposta.json()["chamadas"] if c["estudante"]["id"] == primeiro["id"])
    assert chamada["status"] == "presente" and chamada["horario_embarque"] == "2026-11-23T07:00:00"
    assert cliente.post(f"{url}/chamadas/{primeiro['id']}/embarque").status_code == 409  # já registrado

    detalhe = cliente.post(f"{url}/chamadas/{segundo['id']}/falta").json()
    assert detalhe["passageiros"]["presente"] == 1 and detalhe["passageiros"]["ausente"] == 1

    desfeito = cliente.post(f"{url}/chamadas/{segundo['id']}/desfazer").json()
    assert desfeito["passageiros"]["ausente"] == 0
    assert cliente.post(f"{url}/chamadas/{segundo['id']}/desfazer").status_code == 409  # já pendente
    assert cliente.post(f"{url}/chamadas/99999/embarque").status_code == 404

    concluida = cliente.post(f"{url}/concluir").json()
    assert concluida["passageiros"]["presente"] == 1
    # Viagem concluída não aceita mais registros.
    assert cliente.post(f"{url}/chamadas/{primeiro['id']}/desfazer").status_code == 409


# ---------------------------------------------------------------- jornada do motorista


def _jornada_com_varias_rotas(cliente):  # noqa: F811
    """Primeira jornada (motorista + turno + sentido) da segunda de teste com 2 ou mais rotas."""
    from collections import defaultdict

    grupos = defaultdict(list)
    for v in cliente.get("/api/viagens", params={"data": SEGUNDA}).json():
        grupos[(v["motorista"]["id"], v["rota"]["turno"], v["sentido"])].append(v)
    (motorista, turno, sentido), viagens = next((k, g) for k, g in grupos.items() if len(g) >= 2 and k[2] == "ida")
    return {"data": SEGUNDA, "fk_motorista": motorista, "turno": turno, "sentido": sentido}, viagens


def test_jornada_junta_as_rotas_do_motorista(cliente, fabrica):  # noqa: F811
    from sqlalchemy import text

    _gerar(cliente, SEGUNDA)
    pedido, viagens = _jornada_com_varias_rotas(cliente)

    jornada = cliente.get("/api/viagens/jornada", params=pedido).json()
    assert jornada["status"] == "agendada"
    assert {v["id"] for v in jornada["viagens"]} == {v["id"] for v in viagens}
    assert len(jornada["fila"]) == jornada["passageiros"]["total"]
    horarios = [c["horario_previsto"] for c in jornada["fila"] if c["horario_previsto"]]
    assert horarios == sorted(horarios)  # uma fila só, na ordem de embarque
    assert all(c["instituicao"]["nome"] for c in jornada["fila"])

    # Aviso prévio: quem avisou que não vai sai da fila e fica só na contagem.
    avisou = jornada["fila"][0]
    with fabrica() as sessao:
        sessao.execute(
            text("UPDATE chamada SET status = 'nao_vai' WHERE fk_viagem = :v AND fk_estudante = :e"),
            {"v": avisou["fk_viagem"], "e": avisou["estudante"]["id"]},
        )
        sessao.commit()
    jornada = cliente.get("/api/viagens/jornada", params=pedido).json()
    assert avisou["estudante"]["id"] not in {c["estudante"]["id"] for c in jornada["fila"]}
    assert jornada["passageiros"]["nao_vai"] == 1


def test_inicia_e_conclui_a_jornada_inteira(cliente, hoje_e_segunda):  # noqa: F811
    _gerar(cliente, SEGUNDA)
    pedido, _ = _jornada_com_varias_rotas(cliente)

    resposta = cliente.post("/api/viagens/jornada/iniciar", json=pedido)
    assert resposta.status_code == 200, resposta.text
    jornada = resposta.json()
    assert jornada["status"] == "em_andamento"
    assert {v["status"] for v in jornada["viagens"]} == {"em_andamento"}
    assert {v["horario_saida"] for v in jornada["viagens"]} == {"2026-11-23T07:00:00"}
    assert cliente.post("/api/viagens/jornada/iniciar", json=pedido).status_code == 409

    # Embarca todo mundo da fila (cada um na viagem da sua rota).
    for chamada in jornada["fila"]:
        url = f"/api/viagens/{chamada['fk_viagem']}/chamadas/{chamada['estudante']['id']}/embarque"
        assert cliente.post(url).status_code == 200

    concluida = cliente.post("/api/viagens/jornada/concluir", json=pedido).json()
    assert concluida["status"] == "concluida"
    assert concluida["horario_chegada"] == "2026-11-23T07:00:00"
    assert concluida["passageiros"]["presente"] == len(jornada["fila"])
    assert cliente.post("/api/viagens/jornada/concluir", json=pedido).status_code == 409


def test_jornada_inexistente(cliente):  # noqa: F811
    _gerar(cliente, SEGUNDA)
    params = {"data": SEGUNDA, "fk_motorista": 10, "turno": "noite", "sentido": "ida"}
    assert cliente.get("/api/viagens/jornada", params=params).status_code == 404


# ---------------------------------------------------------------- desembarque


def test_fases_embarque_a_caminho_e_desembarque(cliente, hoje_e_segunda):  # noqa: F811
    _gerar(cliente, SEGUNDA)
    pedido, _ = _jornada_com_varias_rotas(cliente)
    url_jornada = "/api/viagens/jornada"
    assert cliente.get(url_jornada, params=pedido).json()["fase"] == "agendada"

    jornada = cliente.post(f"{url_jornada}/iniciar", json=pedido).json()
    assert jornada["fase"] == "embarque"
    primeiro, *resto = jornada["fila"]

    # Ainda pendente: não dá para desembarcar quem não embarcou.
    url = f"/api/viagens/{primeiro['fk_viagem']}/chamadas/{primeiro['estudante']['id']}"
    assert cliente.post(f"{url}/desembarque").status_code == 409

    cliente.post(f"{url}/embarque")
    for c in resto:  # os demais não apareceram
        cliente.post(f"/api/viagens/{c['fk_viagem']}/chamadas/{c['estudante']['id']}/falta")
    jornada = cliente.get(url_jornada, params=pedido).json()
    assert jornada["fase"] == "a_caminho"  # todos registrados: falta desembarcar

    desceu = cliente.post(f"{url}/desembarque").json()
    chamada = next(c for c in desceu["chamadas"] if c["estudante"]["id"] == primeiro["estudante"]["id"])
    assert chamada["horario_desembarque"] == "2026-11-23T07:00:00"
    assert cliente.post(f"{url}/desembarque").status_code == 409  # já confirmado

    # Desfazer em duas etapas: primeiro o desembarque, depois o embarque.
    detalhe = cliente.post(f"{url}/desfazer").json()
    chamada = next(c for c in detalhe["chamadas"] if c["estudante"]["id"] == primeiro["estudante"]["id"])
    assert chamada["status"] == "presente" and chamada["horario_desembarque"] is None
    detalhe = cliente.post(f"{url}/desfazer").json()
    chamada = next(c for c in detalhe["chamadas"] if c["estudante"]["id"] == primeiro["estudante"]["id"])
    assert chamada["status"] == "pendente"


def test_desembarca_todos_da_rota_e_conclusao_completa(cliente, hoje_e_segunda):  # noqa: F811
    _gerar(cliente, SEGUNDA)
    pedido, _ = _jornada_com_varias_rotas(cliente)
    jornada = cliente.post("/api/viagens/jornada/iniciar", json=pedido).json()
    for c in jornada["fila"]:
        cliente.post(f"/api/viagens/{c['fk_viagem']}/chamadas/{c['estudante']['id']}/embarque")

    # Chegou na faculdade da primeira rota: todos dela descem de uma vez.
    id_viagem = jornada["fila"][0]["fk_viagem"]
    detalhe = cliente.post(f"/api/viagens/{id_viagem}/desembarque").json()
    assert all(c["horario_desembarque"] for c in detalhe["chamadas"] if c["status"] == "presente")
    assert cliente.post(f"/api/viagens/{id_viagem}/desembarque").status_code == 409  # ninguém mais a bordo

    # Encerrar a jornada: quem ainda estava a bordo desce na chegada (rotina concluir_viagem).
    concluida = cliente.post("/api/viagens/jornada/concluir", json=pedido).json()
    assert concluida["fase"] == "concluida"
    assert all(c["horario_desembarque"] for c in concluida["fila"] if c["status"] == "presente")


def test_banco_antigo_ganha_a_coluna_de_desembarque(tmp_path):
    import sqlite3

    from app.config.banco import preparar_banco

    arquivo = tmp_path / "antigo.db"
    with sqlite3.connect(arquivo) as conexao:
        conexao.execute("CREATE TABLE chamada (fk_viagem INTEGER, fk_estudante INTEGER, horario_embarque TEXT)")
        conexao.execute("INSERT INTO chamada VALUES (1, 1, '2026-10-29 17:41:00')")
    preparar_banco(f"sqlite:///{arquivo}")
    with sqlite3.connect(arquivo) as conexao:
        colunas = [linha[1] for linha in conexao.execute("PRAGMA table_info(chamada)")]
        assert "horario_desembarque" in colunas
        assert conexao.execute("SELECT count(*) FROM chamada").fetchone()[0] == 1  # dados mantidos
    preparar_banco(f"sqlite:///{arquivo}")  # segunda vez não falha
