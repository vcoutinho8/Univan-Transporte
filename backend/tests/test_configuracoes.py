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


def test_admin_cria_acesso_pelo_cpf_com_senha_padrao(cliente):  # noqa: F811
    entrar(cliente, "11222333000181", "123456")
    novo = {"nome": "Marina  Souza", "cpf": "529.982.247-25", "perfil": "auxiliar", "email": "M@X.com"}
    resposta = cliente.post("/api/usuarios", json=novo)
    assert resposta.status_code == 201, resposta.text
    criado = resposta.json()
    assert (criado["nome"], criado["login"], criado["cpf"], criado["trocar_senha"]) == ("Marina Souza", "52998224725", "52998224725", True)
    assert cliente.post("/api/usuarios", json=novo).status_code == 409  # CPF repetido
    assert cliente.post("/api/usuarios", json={"nome": "Sem CPF", "perfil": "auxiliar"}).status_code == 422

    # Entra com o CPF e a senha padrão; o app pede a senha nova, que limpa o aviso.
    login = entrar(cliente, "52998224725", "123456")
    assert login["usuario"]["trocar_senha"] is True
    assert cliente.patch("/api/usuarios/eu", json={"senha_atual": "123456", "senha_nova": "123456"}).status_code == 422
    conta = cliente.patch("/api/usuarios/eu", json={"senha_atual": "123456", "senha_nova": "minhaSenha1"}).json()
    assert conta["trocar_senha"] is False
    entrar(cliente, "52998224725", "minhaSenha1")


def test_admin_reseta_senha_e_nao_se_desativa(cliente):  # noqa: F811
    eu = entrar(cliente, "11222333000181", "123456")["usuario"]
    resetado = cliente.post("/api/usuarios/2/resetar-senha").json()
    assert resetado["trocar_senha"] is True
    assert cliente.put(f"/api/usuarios/{eu['id']}", json={"status": "inativo"}).status_code == 409
    assert cliente.put("/api/usuarios/2", json={"perfil": "admin"}).status_code == 422  # perfil não muda na edição
    alterado = cliente.put("/api/usuarios/2", json={"nome": "Paula Lima", "cpf": "111.444.777-35"}).json()
    assert (alterado["nome"], alterado["login"]) == ("Paula Lima", "11144477735")  # o login acompanha o CPF


def test_admin_e_auxiliar_editam_o_proprio_nome_e_cpf(cliente):  # noqa: F811
    entrar(cliente, "40000000124", "123456")
    conta = cliente.patch("/api/usuarios/eu", json={"nome": "Paula Auxiliar Lima", "cpf": "529.982.247-25"}).json()
    assert (conta["nome"], conta["cpf"], conta["login"]) == ("Paula Auxiliar Lima", "52998224725", "52998224725")
    entrar(cliente, "20130140155", "123456")
    assert cliente.patch("/api/usuarios/eu", json={"nome": "Outro"}).status_code == 422


def test_motorista_cuida_da_conta_mas_nao_do_cpf(cliente):  # noqa: F811
    entrar(cliente, "20130140155", "123456")
    conta = cliente.get("/api/usuarios/eu").json()
    assert conta["perfil"] == "motorista" and conta["cpf"]  # CPF do cadastro de motorista

    assert cliente.patch("/api/usuarios/eu", json={"cpf": "52998224725"}).status_code == 422  # motorista não muda CPF
    assert cliente.patch("/api/usuarios/eu", json={"senha_atual": "errada", "senha_nova": "nova123"}).status_code == 422
    resposta = cliente.patch(
        "/api/usuarios/eu", json={"email": "carlos@x.com", "senha_atual": "123456", "senha_nova": "nova123", "endereco": ENDERECO}
    )
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["email"] == "carlos@x.com"
    assert resposta.json()["endereco"]["logradouro"] == "Rua Nova"
    entrar(cliente, "20130140155", "nova123")


def test_so_o_admin_gerencia_usuarios(cliente):  # noqa: F811
    for login in ("40000000124", "20130140155"):
        entrar(cliente, login, "123456")
        assert cliente.get("/api/usuarios").status_code == 403
        assert cliente.put("/api/usuarios/1", json={"nome": "X"}).status_code == 403
        assert cliente.get("/api/usuarios/eu").status_code == 200


def test_admin_cria_e_altera_instituicao(cliente):  # noqa: F811
    entrar(cliente, "11222333000181", "123456")
    resposta = cliente.post("/api/instituicoes", json={"nome": " FAESA ", "endereco": ENDERECO})
    assert resposta.status_code == 201, resposta.text
    criada = resposta.json()
    assert criada["nome"] == "FAESA" and criada["ponto_parada"] == [-20.33, -40.29]
    alterada = cliente.put(f"/api/instituicoes/{criada['id']}", json={"nome": "FAESA Vitória"}).json()
    assert alterada["nome"] == "FAESA Vitória"
    entrar(cliente, "40000000124", "123456")
    assert cliente.post("/api/instituicoes", json={"nome": "X", "endereco": ENDERECO}).status_code == 403


def test_numero_obrigatorio_ou_sem_numero(cliente):  # noqa: F811
    entrar(cliente, "11222333000181", "123456")
    sem_numero = {k: v for k, v in ENDERECO.items() if k != "numero"}
    assert cliente.post("/api/instituicoes", json={"nome": "X", "endereco": sem_numero}).status_code == 422
    assert cliente.post("/api/instituicoes", json={"nome": "X", "endereco": {**ENDERECO, "numero": " "}}).status_code == 422
    criada = cliente.post("/api/instituicoes", json={"nome": "X", "endereco": {**ENDERECO, "numero": "s/n"}}).json()
    assert criada["endereco"]["numero"] == "S/N"


def test_catalogo_de_faculdades_por_uf(cliente):  # noqa: F811
    entrar(cliente, "40000000124", "123456")
    do_es = cliente.get("/api/instituicoes/catalogo", params={"uf": "es", "busca": "vila velha"}).json()
    assert do_es and all(f["uf"] == "ES" for f in do_es)
    uvv = cliente.get("/api/instituicoes/catalogo", params={"uf": "ES", "busca": "UVV"}).json()
    assert uvv[0]["nome"] == "Universidade Vila Velha" and uvv[0]["municipio"] == "Vila Velha"
    assert cliente.get("/api/instituicoes/catalogo", params={"uf": "ES", "busca": "espirito"}).json()  # sem acento
    assert cliente.get("/api/instituicoes/catalogo", params={"uf": "XYZ"}).status_code == 422


def test_cpf_nao_se_repete_entre_cadastros(cliente):  # noqa: F811
    entrar(cliente, "11222333000181", "123456")
    cpf_do_motorista = cliente.get("/api/motoristas/1").json()["cpf"]
    resposta = cliente.post("/api/usuarios", json={"nome": "Y", "perfil": "auxiliar", "cpf": cpf_do_motorista})
    assert resposta.status_code == 409 and resposta.json()["mensagem"] == "Este CPF já está cadastrado como motorista."


def test_exclui_instituicao_so_sem_uso(cliente):  # noqa: F811
    entrar(cliente, "11222333000181", "123456")
    assert cliente.delete("/api/instituicoes/1").status_code == 409  # a UVV tem passageiros e rotas
    nova = cliente.post("/api/instituicoes", json={"nome": "Sem ninguém", "endereco": ENDERECO}).json()
    assert cliente.delete(f"/api/instituicoes/{nova['id']}").json()["nome"] == "Sem ninguém"
    assert all(i["id"] != nova["id"] for i in cliente.get("/api/instituicoes").json())


def test_verifica_cpf_e_celular_ao_digitar(cliente):  # noqa: F811
    entrar(cliente, "40000000124", "123456")
    motorista = cliente.get("/api/motoristas/1").json()
    r = cliente.get("/api/cadastros/verificar", params={"cpf": motorista["cpf"], "celular": motorista["celular"]}).json()
    assert r == {"cpf_valido": True, "cpf_em_uso": "motorista", "celular_em_uso": "motorista"}
    # Editando o próprio motorista, os dados dele não contam como repetidos.
    proprio = cliente.get("/api/cadastros/verificar", params={"cpf": motorista["cpf"], "tabela": "motorista", "id": 1}).json()
    assert proprio["cpf_em_uso"] is None
    assert cliente.get("/api/cadastros/verificar", params={"cpf": "111.111.111-11"}).json()["cpf_valido"] is False


def test_faculdade_repetida_e_recusada(cliente):  # noqa: F811
    entrar(cliente, "11222333000181", "123456")
    repetida = cliente.post("/api/instituicoes", json={"nome": "Outra UVV", "codigo_inep": 664, "endereco": ENDERECO})
    assert repetida.status_code == 409 and "já está cadastrada" in repetida.json()["mensagem"]


def test_esqueci_a_senha_motorista_pede_ao_gestor(cliente):  # noqa: F811
    cliente.headers.pop("Authorization", None)
    resposta = cliente.post("/api/auth/esqueci-senha", json={"usuario": "20130140155"})
    assert resposta.json() == {"canal": "gestor"}
    assert cliente.post("/api/auth/esqueci-senha", json={"usuario": "ninguem"}).status_code == 422  # não é CPF nem CNPJ
    assert cliente.post("/api/auth/esqueci-senha", json={"usuario": "201.301.401-00"}).status_code == 422  # dígito errado
    assert cliente.post("/api/auth/esqueci-senha", json={"usuario": "529.982.247-25"}).status_code == 404  # válido, sem cadastro
    assert cliente.post("/api/auth/esqueci-senha", json={"usuario": "22.333.444/0001-81"}).status_code == 409  # gestor sem e-mail
    entrar(cliente, "11222333000181", "123456")
    pedido = next(u for u in cliente.get("/api/usuarios").json() if u["login"] == "20130140155")
    assert pedido["pediu_senha_em"] is not None
    assert cliente.post(f"/api/usuarios/{pedido['id']}/resetar-senha").json()["pediu_senha_em"] is None


def test_esqueci_a_senha_gestor_recebe_link_de_uso_unico(cliente, caplog):  # noqa: F811
    cliente.headers.pop("Authorization", None)
    assert cliente.post("/api/auth/esqueci-senha", json={"usuario": "11222333000181"}).json() == {"canal": "email"}
    assert "redefinir-senha?token=" in caplog.text  # sem SMTP: o link vai para o log

    token = caplog.text.split("redefinir-senha?token=")[1].split()[0]
    resposta = cliente.post("/api/auth/redefinir-senha", json={"token": token, "senha_nova": "nova-senha-1"})
    assert resposta.status_code == 200, resposta.text
    entrar(cliente, "11222333000181", "nova-senha-1")
    # Uso único: o mesmo link não serve de novo; link adulterado também não.
    assert cliente.post("/api/auth/redefinir-senha", json={"token": token, "senha_nova": "outra-123"}).status_code == 422
    assert cliente.post("/api/auth/redefinir-senha", json={"token": token + "x", "senha_nova": "outra-123"}).status_code == 422


def test_minha_conta_mostra_a_empresa_de_quem_trabalha_nela(cliente):  # noqa: F811
    entrar(cliente, "20130140155", "123456")
    assert cliente.get("/api/usuarios/eu").json()["nome_empresa"] == "Guarapari Vans"
    entrar(cliente, "11222333000181", "123456")
    assert cliente.get("/api/usuarios/eu").json()["nome_empresa"] is None  # o gestor já é a empresa
