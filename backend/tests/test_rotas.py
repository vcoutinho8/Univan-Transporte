"""Testes da API de rotas com banco SQLite de verdade (dados de teste completos)."""

import pytest

from tests.test_banco_sqlite import cliente, fabrica  # noqa: F401  (fixtures)

# Rota 3: Marcos (bairros Praia do Morro e Jardim Boa Vista) → Multivix, noite.
ROTA_3 = 3
NOVA = {
    "nome": "  Centro e Ipiranga   →  Novo Milênio (tarde) ",
    "fk_motorista": 1,
    "fk_instituicao": 4,
    "turno": "tarde",
    "horario_ida": "12:30",
    "horario_volta": "18:00",
    "dias": [5, 1, 3, 3],
}


def test_lista_rotas_com_dias_e_total(cliente):  # noqa: F811
    corpo = cliente.get("/api/rotas", params={"status": "ativo"}).json()
    assert len(corpo) == 31
    rota = next(r for r in corpo if r["id"] == ROTA_3)
    assert rota["motorista"]["nome"] == "Marcos Antônio Silva"
    assert rota["instituicao"]["id"] == 3
    assert rota["dias"] == [1, 2, 3, 4, 5]
    assert rota["total_passageiros"] >= 1
    # Todo passageiro ativo com área está em alguma rota.
    passageiros_com_area = [e for e in cliente.get("/api/estudantes", params={"status": "ativo"}).json() if e["fk_area"]]
    assert sum(r["total_passageiros"] for r in corpo) == len(passageiros_com_area)


def test_filtra_por_motorista(cliente):  # noqa: F811
    corpo = cliente.get("/api/rotas", params={"fk_motorista": 3}).json()
    assert corpo and all(r["fk_motorista"] == 3 for r in corpo)


def test_passageiros_seguem_a_regra_do_gerar_dia(cliente):  # noqa: F811
    resposta = cliente.get(f"/api/rotas/{ROTA_3}/passageiros")
    assert resposta.status_code == 200
    passageiros = resposta.json()
    assert any(p["nome"] == "Camila Rodrigues" for p in passageiros)
    areas_do_marcos = {a["id"] for a in cliente.get("/api/areas").json() if a["fk_motorista"] == 3}
    for p in passageiros:
        assert p["fk_instituicao"] == 3 and p["turno"] == "noite" and p["status"] == "ativo"
        assert p["fk_area"] in areas_do_marcos
    horarios = [p["horario_embarque"] for p in passageiros]
    assert horarios == sorted(horarios)  # ordem de embarque


def test_area_inativa_tira_passageiros_da_rota(cliente):  # noqa: F811
    antes = len(cliente.get(f"/api/rotas/{ROTA_3}/passageiros").json())
    cliente.delete("/api/areas/3")  # Praia do Morro
    depois = cliente.get(f"/api/rotas/{ROTA_3}/passageiros").json()
    assert len(depois) < antes
    assert all(p["area"]["nome"] != "Praia do Morro" for p in depois)


def test_cadastra_edita_e_inativa(cliente):  # noqa: F811
    resposta = cliente.post("/api/rotas", json=NOVA)
    assert resposta.status_code == 201, resposta.text
    rota = resposta.json()
    assert rota["nome"] == "Centro e Ipiranga → Novo Milênio (tarde)"
    assert rota["dias"] == [1, 3, 5]
    assert rota["horario_ida"] == "12:30:00"
    assert rota["total_passageiros"] == 0

    resposta = cliente.patch(f"/api/rotas/{rota['id']}", json={"dias": [2, 4], "horario_volta": "17:30"})
    assert resposta.status_code == 200
    assert resposta.json()["dias"] == [2, 4]
    assert resposta.json()["horario_volta"] == "17:30:00"

    assert cliente.delete(f"/api/rotas/{rota['id']}").json()["status"] == "inativo"
    assert cliente.delete(f"/api/rotas/{rota['id']}").status_code == 409
    assert cliente.patch(f"/api/rotas/{rota['id']}", json={"status": "ativo"}).json()["status"] == "ativo"


def test_recusa_combinacao_repetida(cliente):  # noqa: F811
    resposta = cliente.post("/api/rotas", json={**NOVA, "fk_motorista": 3, "fk_instituicao": 3, "turno": "noite"})
    assert resposta.status_code == 409
    assert resposta.json()["mensagem"].startswith("Este motorista já tem uma rota para esta instituição neste turno")

    # Mudar uma rota para a combinação de outra também é recusado.
    resposta = cliente.patch("/api/rotas/1", json={"fk_motorista": 3, "fk_instituicao": 3})
    assert resposta.status_code == 409


@pytest.mark.parametrize(
    ("alteracao", "status_http", "mensagem"),
    [
        ({"fk_motorista": 999}, 422, "Motorista não encontrado."),
        ({"fk_instituicao": 999}, 422, "Instituição não encontrada."),
        ({"horario_volta": "12:00"}, 422, "O horário de volta deve ser depois do horário de ida."),
    ],
)
def test_regras_de_negocio(cliente, alteracao, status_http, mensagem):  # noqa: F811
    resposta = cliente.post("/api/rotas", json={**NOVA, **alteracao})
    assert resposta.status_code == status_http
    assert resposta.json()["mensagem"] == mensagem


@pytest.mark.parametrize(
    ("alteracao", "campo", "mensagem"),
    [
        ({"dias": []}, "dias", "Escolha pelo menos um dia da semana."),
        ({"dias": [0, 8]}, "dias", "Dia da semana inválido. Use de 1 (segunda) a 7 (domingo)."),
        ({"nome": "  "}, "nome", "Informe o nome da rota."),
        ({"turno": "madrugada"}, "turno", "Valor inválido. Opções aceitas: 'manha', 'tarde' ou 'noite'."),
        ({"horario_ida": "25:00"}, "horario_ida", "Horário inválido."),
    ],
)
def test_validacoes(cliente, alteracao, campo, mensagem):  # noqa: F811
    resposta = cliente.post("/api/rotas", json={**NOVA, **alteracao})
    assert resposta.status_code == 422
    assert {"campo": campo, "mensagem": mensagem} in resposta.json()["erros"]


def test_rota_inexistente(cliente):  # noqa: F811
    for resposta in (
        cliente.get("/api/rotas/999"),
        cliente.get("/api/rotas/999/passageiros"),
        cliente.patch("/api/rotas/999", json={"nome": "X"}),
        cliente.delete("/api/rotas/999"),
    ):
        assert resposta.status_code == 404
        assert resposta.json()["mensagem"] == "Rota não encontrada."


def test_atualizacao_nao_aceita_obrigatorio_nulo(cliente):  # noqa: F811
    resposta = cliente.patch("/api/rotas/1", json={"dias": None})
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"] == "O campo dias não pode ficar vazio."
