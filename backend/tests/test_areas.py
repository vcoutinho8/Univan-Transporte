"""Testes do cadastro de áreas (bairros desenhados no mapa) com banco SQLite de verdade.

Ao criar, redesenhar ou inativar uma área, o banco precisa recalcular a área de cada
passageiro (trigger). Por isso estes testes usam o banco real e não repositórios em memória.
"""

import pytest

from tests.test_banco_sqlite import cliente, fabrica  # noqa: F401  (fixtures)

# Quadrado em volta da casa da Paula (passageira 41), em Setiba, que hoje não tem área.
SETIBA = [[-20.625, -40.445], [-20.625, -40.430], [-20.636, -40.430], [-20.636, -40.445]]


def area_da_paula(cliente):  # noqa: F811
    return cliente.get("/api/estudantes/41").json()["area"]


def test_nova_area_pega_os_passageiros_que_estao_dentro(cliente):  # noqa: F811
    assert area_da_paula(cliente) is None

    resposta = cliente.post("/api/areas", json={"nome": "  Setiba  ", "fk_motorista": 2, "poligono": SETIBA})
    assert resposta.status_code == 201, resposta.text
    corpo = resposta.json()
    assert corpo["nome"] == "Setiba"
    assert corpo["motorista"]["id"] == 2
    assert corpo["poligono"] == SETIBA
    assert area_da_paula(cliente) == {"id": corpo["id"], "nome": "Setiba"}


def test_aceita_anel_fechado_do_geojson(cliente):  # noqa: F811
    fechado = [*SETIBA, SETIBA[0]]
    corpo = cliente.post("/api/areas", json={"nome": "Setiba", "poligono": fechado}).json()
    assert corpo["poligono"] == SETIBA
    assert corpo["motorista"] is None


def test_redesenhar_e_inativar_recalcula_passageiros(cliente):  # noqa: F811
    id_area = cliente.post("/api/areas", json={"nome": "Setiba", "poligono": SETIBA}).json()["id"]

    # Contorno movido para longe: a Paula sai da área.
    longe = [[lat - 0.05, lon] for lat, lon in SETIBA]
    assert cliente.patch(f"/api/areas/{id_area}", json={"poligono": longe}).status_code == 200
    assert area_da_paula(cliente) is None

    cliente.patch(f"/api/areas/{id_area}", json={"poligono": SETIBA})
    assert area_da_paula(cliente)["nome"] == "Setiba"

    resposta = cliente.delete(f"/api/areas/{id_area}")
    assert resposta.json()["status"] == "inativo"
    assert area_da_paula(cliente) is None
    assert cliente.delete(f"/api/areas/{id_area}").status_code == 409


def test_renomear_e_trocar_motorista(cliente):  # noqa: F811
    resposta = cliente.patch("/api/areas/1", json={"nome": "Centro Histórico", "fk_motorista": None})
    assert resposta.status_code == 200
    assert resposta.json()["nome"] == "Centro Histórico"
    assert resposta.json()["motorista"] is None
    # Os passageiros continuam na mesma área (o contorno não mudou).
    assert cliente.get("/api/estudantes/1").json()["area"]["nome"] == "Centro Histórico"


def test_recusa_nome_repetido_entre_areas_ativas(cliente):  # noqa: F811
    resposta = cliente.post("/api/areas", json={"nome": "praia do morro", "poligono": SETIBA})
    assert resposta.status_code == 409
    assert resposta.json()["mensagem"] == "Já existe uma área ativa chamada Praia do Morro."

    resposta = cliente.patch("/api/areas/1", json={"nome": "Muquiçaba"})
    assert resposta.status_code == 409


def test_recusa_motorista_inexistente(cliente):  # noqa: F811
    resposta = cliente.post("/api/areas", json={"nome": "Setiba", "fk_motorista": 999, "poligono": SETIBA})
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"] == "Motorista não encontrado."


@pytest.mark.parametrize(
    ("dados", "campo", "mensagem"),
    [
        ({"nome": "   "}, "nome", "Informe o nome da área (bairro)."),
        ({"poligono": SETIBA[:2]}, "poligono", "A área precisa de pelo menos 3 pontos diferentes."),
        ({"poligono": [SETIBA[0]] * 4}, "poligono", "A área precisa de pelo menos 3 pontos diferentes."),
        ({"poligono": [[-200, 10], *SETIBA]}, "poligono", "Coordenada fora do mapa. Use [latitude, longitude]."),
    ],
)
def test_validacoes(cliente, dados, campo, mensagem):  # noqa: F811
    resposta = cliente.post("/api/areas", json={"nome": "Setiba", "poligono": SETIBA, **dados})
    assert resposta.status_code == 422
    assert {"campo": campo, "mensagem": mensagem} in resposta.json()["erros"]


def test_area_inexistente(cliente):  # noqa: F811
    for resposta in (cliente.get("/api/areas/999"), cliente.patch("/api/areas/999", json={"nome": "X"})):
        assert resposta.status_code == 404
        assert resposta.json()["mensagem"] == "Área não encontrada."


def test_atualizacao_nao_aceita_contorno_nulo(cliente):  # noqa: F811
    resposta = cliente.patch("/api/areas/1", json={"poligono": None})
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"] == "O campo poligono não pode ficar vazio."


def test_lista_motoristas(cliente):  # noqa: F811
    corpo = cliente.get("/api/motoristas", params={"status": "ativo"}).json()
    assert len(corpo) == 9
    assert {"id", "nome", "celular", "status"} <= corpo[0].keys()
