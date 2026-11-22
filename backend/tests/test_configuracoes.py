"""Configurações: o admin gerencia usuários e instituições; cada um cuida da própria conta."""

import pytest

from app.config import seguranca
from tests.test_banco_sqlite import cliente, entrar, fabrica  # noqa: F401  (fixtures)

ENDERECO = {
    "cep": "29100-000",
    "logradouro": "Rua Nova",
    "numero": "10",
    "bairro": "Centro",
    "cidade": "Vila Velha",
    "estado": "ES",
    "latitude": -20.33,
    "longitude": -40.29,
}


@pytest.fixture(autouse=True)
def sem_bloqueios():
    seguranca._tentativas.clear()
    yield
    seguranca._tentativas.clear()


def test_admin_cria_login_de_auxiliar_que_entra(cliente):  # noqa: F811
    entrar(cliente, "admin", "123456")
    novo = {"nome": "Marina  Souza", "login": "Marina", "senha": "segredo1", "perfil": "auxiliar", "email": "M@X.com"}
    resposta = cliente.post("/api/usuarios", json=novo)
    assert resposta.status_code == 201, resposta.text
    assert resposta.json() | {"id": 0, "ultimo_acesso": None} == {
        "id": 0,
        "nome": "Marina Souza",
        "login": "marina",
        "perfil": "auxiliar",
        "fk_empresa": 1,
        "fk_motorista": None,
        "email": "m@x.com",
        "cpf": None,
        "status": "ativo",
        "ultimo_acesso": None,
    }
    assert cliente.post("/api/usuarios", json=novo).status_code == 409  # login repetido
    assert entrar(cliente, "marina", "segredo1")["usuario"]["perfil"] == "auxiliar"


def test_admin_redefine_senha_e_nao_tira_o_proprio_acesso(cliente):  # noqa: F811
    eu = entrar(cliente, "admin", "123456")["usuario"]
    assert cliente.put("/api/usuarios/2", json={"senha": "nova123", "cpf": "529.982.247-25"}).status_code == 200
    assert cliente.put(f"/api/usuarios/{eu['id']}", json={"perfil": "auxiliar"}).status_code == 409
    assert cliente.put(f"/api/usuarios/{eu['id']}", json={"status": "inativo"}).status_code == 409
    assert cliente.put("/api/usuarios/2", json={"perfil": "motorista"}).status_code == 422  # sem motorista
    assert entrar(cliente, "auxiliar", "nova123")["usuario"]["login"] == "auxiliar"


def test_motorista_cuida_da_conta_mas_nao_do_cpf(cliente):  # noqa: F811
    entrar(cliente, "motorista", "123456")
    conta = cliente.get("/api/usuarios/eu").json()
    assert conta["perfil"] == "motorista" and conta["cpf"]  # CPF do cadastro de motorista

    assert cliente.patch("/api/usuarios/eu", json={"cpf": "52998224725"}).status_code == 422  # não muda CPF
    assert cliente.patch("/api/usuarios/eu", json={"senha_atual": "errada", "senha_nova": "nova123"}).status_code == 422
    resposta = cliente.patch(
        "/api/usuarios/eu", json={"email": "carlos@x.com", "senha_atual": "123456", "senha_nova": "nova123", "endereco": ENDERECO}
    )
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["email"] == "carlos@x.com"
    assert resposta.json()["endereco"]["logradouro"] == "Rua Nova"
    entrar(cliente, "motorista", "nova123")


def test_so_o_admin_gerencia_usuarios(cliente):  # noqa: F811
    for login in ("auxiliar", "motorista"):
        entrar(cliente, login, "123456")
        assert cliente.get("/api/usuarios").status_code == 403
        assert cliente.put("/api/usuarios/1", json={"nome": "X"}).status_code == 403
        assert cliente.get("/api/usuarios/eu").status_code == 200


def test_admin_cria_e_altera_instituicao(cliente):  # noqa: F811
    entrar(cliente, "admin", "123456")
    resposta = cliente.post("/api/instituicoes", json={"nome": " FAESA ", "endereco": ENDERECO})
    assert resposta.status_code == 201, resposta.text
    criada = resposta.json()
    assert criada["nome"] == "FAESA" and criada["ponto_parada"] == [-20.33, -40.29]
    alterada = cliente.put(f"/api/instituicoes/{criada['id']}", json={"nome": "FAESA Vitória"}).json()
    assert alterada["nome"] == "FAESA Vitória"
    entrar(cliente, "auxiliar", "123456")
    assert cliente.post("/api/instituicoes", json={"nome": "X", "endereco": ENDERECO}).status_code == 403


def test_numero_obrigatorio_ou_sem_numero(cliente):  # noqa: F811
    entrar(cliente, "admin", "123456")
    sem_numero = {k: v for k, v in ENDERECO.items() if k != "numero"}
    assert cliente.post("/api/instituicoes", json={"nome": "X", "endereco": sem_numero}).status_code == 422
    assert cliente.post("/api/instituicoes", json={"nome": "X", "endereco": {**ENDERECO, "numero": " "}}).status_code == 422
    criada = cliente.post("/api/instituicoes", json={"nome": "X", "endereco": {**ENDERECO, "numero": "s/n"}}).json()
    assert criada["endereco"]["numero"] == "S/N"


def test_catalogo_de_faculdades_por_uf(cliente):  # noqa: F811
    entrar(cliente, "auxiliar", "123456")
    do_es = cliente.get("/api/instituicoes/catalogo", params={"uf": "es", "busca": "vila velha"}).json()
    assert do_es and all(f["uf"] == "ES" for f in do_es)
    uvv = cliente.get("/api/instituicoes/catalogo", params={"uf": "ES", "busca": "UVV"}).json()
    assert uvv[0]["nome"] == "Universidade Vila Velha" and uvv[0]["municipio"] == "Vila Velha"
    assert cliente.get("/api/instituicoes/catalogo", params={"uf": "ES", "busca": "espirito"}).json()  # sem acento
    assert cliente.get("/api/instituicoes/catalogo", params={"uf": "XYZ"}).status_code == 422


def test_cpf_nao_se_repete_entre_cadastros(cliente):  # noqa: F811
    entrar(cliente, "admin", "123456")
    cpf_do_motorista = cliente.get("/api/motoristas/1").json()["cpf"]
    resposta = cliente.post("/api/usuarios", json={"nome": "Y", "login": "yyy", "senha": "123456", "perfil": "auxiliar", "cpf": cpf_do_motorista})
    assert resposta.status_code == 409 and resposta.json()["mensagem"] == "Este CPF já está cadastrado como motorista."
