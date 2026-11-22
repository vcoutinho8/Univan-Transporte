"""Testes do ponto de parada das instituições, com banco SQLite de verdade."""

from tests.test_banco_sqlite import cliente, fabrica  # noqa: F401  (fixtures)


def _uvv(cliente):  # noqa: F811
    return next(i for i in cliente.get("/api/instituicoes").json() if i["id"] == 1)


def test_sem_ajuste_a_parada_e_o_endereco(cliente):  # noqa: F811
    uvv = _uvv(cliente)
    assert uvv["parada_latitude"] is None
    assert uvv["ponto_parada"] == [uvv["endereco"]["latitude"], uvv["endereco"]["longitude"]]


def test_ajusta_e_volta_ao_endereco(cliente):  # noqa: F811
    uvv = _uvv(cliente)
    lat, lng = uvv["endereco"]["latitude"] + 0.001, uvv["endereco"]["longitude"] - 0.001  # ~150 m
    resposta = cliente.patch("/api/instituicoes/1/parada", json={"latitude": lat, "longitude": lng})
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["ponto_parada"] == [lat, lng]
    assert _uvv(cliente)["parada_latitude"] == lat  # gravou

    voltou = cliente.patch("/api/instituicoes/1/parada", json={"latitude": None, "longitude": None}).json()
    assert voltou["parada_latitude"] is None
    assert voltou["ponto_parada"] == [uvv["endereco"]["latitude"], uvv["endereco"]["longitude"]]


def test_aceita_ponto_longe_e_recusa_incompleto(cliente):  # noqa: F811
    # Sem limite de distância: campus grande ou portão afastado também vale.
    uvv = _uvv(cliente)
    longe = cliente.patch(
        "/api/instituicoes/1/parada", json={"latitude": uvv["endereco"]["latitude"] + 0.05, "longitude": uvv["endereco"]["longitude"]}
    )
    assert longe.status_code == 200, longe.text
    assert cliente.patch("/api/instituicoes/1/parada", json={"latitude": -20.3}).status_code == 422
    assert cliente.patch("/api/instituicoes/999/parada", json={"latitude": -20.3, "longitude": -40.3}).status_code == 404
