"""Login e permissões por perfil (admin, auxiliar, motorista), com banco SQLite de verdade."""

from datetime import datetime

import pytest

from app.config import seguranca
from app.modules.viagem import viagem_servico
from tests.test_banco_sqlite import cliente, entrar, fabrica  # noqa: F401  (fixtures)

SEGUNDA = "2026-11-23"


@pytest.fixture(autouse=True)
def segunda_e_sem_bloqueios(monkeypatch):
    monkeypatch.setattr(viagem_servico, "agora", lambda: datetime(2026, 11, 23, 7, 0, 0))
    seguranca._tentativas.clear()
    yield
    seguranca._tentativas.clear()


def _sair(cliente):  # noqa: F811
    cliente.headers.pop("Authorization", None)


# ---------------------------------------------------------------- login


def test_login_com_usuario_e_senha(cliente):  # noqa: F811
    _sair(cliente)
    resposta = cliente.post("/api/auth/login", json={"usuario": "  ADMIN ", "senha": "123456"})
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["usuario"]["login"] == "admin" and corpo["usuario"]["perfil"] == "admin"
    assert corpo["token"].count(".") == 1 and corpo["expira_em_minutos"] > 0
    cliente.headers["Authorization"] = f"Bearer {corpo['token']}"
    assert cliente.get("/api/auth/eu").json()["nome"] == "Administrador"


def test_login_errado_nao_revela_o_que_errou(cliente):  # noqa: F811
    _sair(cliente)
    senha_errada = cliente.post("/api/auth/login", json={"usuario": "admin", "senha": "errada"})
    usuario_errado = cliente.post("/api/auth/login", json={"usuario": "ninguem", "senha": "123456"})
    assert senha_errada.status_code == usuario_errado.status_code == 401
    assert senha_errada.json()["mensagem"] == usuario_errado.json()["mensagem"] == "Usuário ou senha incorretos."


def test_validacoes_do_formulario(cliente):  # noqa: F811
    _sair(cliente)
    vazio = cliente.post("/api/auth/login", json={"usuario": "", "senha": ""}).json()
    assert {e["campo"] for e in vazio["erros"]} == {"usuario", "senha"}
    invalido = cliente.post("/api/auth/login", json={"usuario": "ad min!", "senha": "123456"}).json()
    assert invalido["erros"][0]["mensagem"].startswith("Usuário inválido")


def test_bloqueia_depois_de_cinco_tentativas(cliente):  # noqa: F811
    _sair(cliente)
    for _ in range(5):
        assert cliente.post("/api/auth/login", json={"usuario": "auxiliar", "senha": "x"}).status_code == 401
    bloqueado = cliente.post("/api/auth/login", json={"usuario": "auxiliar", "senha": "123456"})
    assert bloqueado.status_code == 429
    assert "Muitas tentativas" in bloqueado.json()["mensagem"]
    # Outro usuário continua entrando normalmente.
    assert cliente.post("/api/auth/login", json={"usuario": "admin", "senha": "123456"}).status_code == 200


def test_usuario_inativo_nao_entra(cliente, fabrica):  # noqa: F811
    from sqlalchemy import text

    with fabrica() as sessao:
        sessao.execute(text("UPDATE usuario SET status = 'inativo' WHERE login = 'auxiliar'"))
        sessao.commit()
    _sair(cliente)
    resposta = cliente.post("/api/auth/login", json={"usuario": "auxiliar", "senha": "123456"})
    assert resposta.status_code == 403 and "inativo" in resposta.json()["mensagem"]


def test_sem_login_ou_token_adulterado(cliente):  # noqa: F811
    _sair(cliente)
    assert cliente.get("/api/estudantes").status_code == 401
    assert cliente.get("/api/saude").status_code == 200  # público
    token = cliente.post("/api/auth/login", json={"usuario": "auxiliar", "senha": "123456"}).json()["token"]
    dados, assinatura = token.split(".")
    adulterado = seguranca._b64(seguranca._desb64(dados).replace(b'"auxiliar"', b'"admin"')) + "." + assinatura
    resposta = cliente.get("/api/estudantes", headers={"Authorization": f"Bearer {adulterado}"})
    assert resposta.status_code == 401 and "inválida" in resposta.json()["mensagem"]


def test_token_expirado():
    token = seguranca.criar_token(1, "admin", agora=0)
    with pytest.raises(seguranca.NaoAutenticado, match="expirou"):
        seguranca.ler_token(token)


def test_senha_com_hash_e_sal():
    guardado = seguranca.gerar_hash("123456")
    assert guardado.startswith("scrypt$") and "123456" not in guardado
    assert guardado != seguranca.gerar_hash("123456")  # sal diferente a cada vez
    assert seguranca.conferir_senha("123456", guardado) and not seguranca.conferir_senha("1234567", guardado)


# ---------------------------------------------------------------- auxiliar


def test_auxiliar_cadastra_mas_nao_edita_nem_inativa(cliente):  # noqa: F811
    entrar(cliente, "auxiliar", "123456")
    assert cliente.get("/api/estudantes").status_code == 200
    assert cliente.get("/api/painel/resumo").status_code == 200
    assert cliente.get("/api/relatorios/estudantes-ativos", params={"data_inicio": "2026-11-01", "data_fim": "2026-11-30"}).status_code == 200
    negado = cliente.patch("/api/estudantes/1", json={"apelido": "x"})
    assert negado.status_code == 403
    assert negado.json()["mensagem"] == "Seu perfil (auxiliar) não tem acesso a esta ação."
    assert cliente.delete("/api/estudantes/1").status_code == 403
    assert cliente.delete("/api/motoristas/1").status_code == 403
    assert cliente.patch("/api/veiculos/1", json={"cor": "Azul"}).status_code == 403
    # Cadastrar pode (o corpo inválido chega à validação: 422, não 403).
    assert cliente.post("/api/veiculos", json={}).status_code == 422


def test_auxiliar_so_visualiza_viagens(cliente):  # noqa: F811
    entrar(cliente, "auxiliar", "123456")
    assert cliente.get("/api/viagens", params={"data": SEGUNDA}).status_code == 200
    assert cliente.post("/api/viagens/gerar", json={"data": SEGUNDA}).status_code == 403
    assert cliente.post("/api/viagens/1/iniciar").status_code == 403
    # Mapa e rotas, calendário e chamadas: acesso total.
    assert cliente.get("/api/rotas").status_code == 200
    assert cliente.get("/api/dias-sem-aula/periodos", params={"inicio": "2026-11-01", "fim": "2026-11-30"}).status_code == 200


# ---------------------------------------------------------------- motorista


def test_motorista_so_ve_e_opera_as_proprias_viagens(cliente):  # noqa: F811
    cliente.post("/api/viagens/gerar", json={"data": SEGUNDA})  # como admin
    entrar(cliente, "motorista", "123456")  # Carlos (motorista 1)
    assert cliente.get("/api/estudantes").status_code == 403
    assert cliente.get("/api/painel/resumo").status_code == 403

    minhas = cliente.get("/api/viagens", params={"data": SEGUNDA}).json()
    assert minhas and {v["motorista"]["id"] for v in minhas} == {1}

    # Mesmo pedindo as de outro motorista, só vêm as dele.
    assert {v["motorista"]["id"] for v in cliente.get("/api/viagens", params={"data": SEGUNDA, "fk_motorista": 2}).json()} == {1}

    entrar(cliente, "admin", "123456")
    do_joao = cliente.get("/api/viagens", params={"data": SEGUNDA, "fk_motorista": 2}).json()[0]
    entrar(cliente, "motorista", "123456")
    assert cliente.get(f"/api/viagens/{do_joao['id']}").status_code == 403
    assert cliente.post(f"/api/viagens/{do_joao['id']}/iniciar").status_code == 403
    chave_joao = {"data": SEGUNDA, "fk_motorista": 2, "turno": do_joao["rota"]["turno"], "sentido": do_joao["sentido"]}
    assert cliente.get("/api/viagens/jornada", params=chave_joao).status_code == 403

    # A própria jornada ele inicia.
    minha = minhas[0]
    chave = {"data": SEGUNDA, "fk_motorista": 1, "turno": minha["rota"]["turno"], "sentido": minha["sentido"]}
    assert cliente.post("/api/viagens/jornada/iniciar", json=chave).status_code == 200
    assert cliente.post("/api/viagens/gerar", json={"data": SEGUNDA}).status_code == 403


def test_motorista_ve_so_as_proprias_chamadas(cliente):  # noqa: F811
    cliente.post("/api/viagens/gerar", json={"data": SEGUNDA})
    todas = cliente.get("/api/chamadas", params={"data": SEGUNDA}).json()["passageiros"]
    de_outro = next(p for p in todas if p["motorista"]["id"] != 1)

    entrar(cliente, "motorista", "123456")
    minhas = cliente.get("/api/chamadas", params={"data": SEGUNDA}).json()
    assert minhas["passageiros"] and {p["motorista"]["id"] for p in minhas["passageiros"]} == {1}
    assert minhas["resumo"]["passageiros"] == len(minhas["passageiros"])
    negado = cliente.post("/api/chamadas/aviso", json={"data": SEGUNDA, "fk_estudante": de_outro["estudante"]["id"], "sentidos": ["ida"]})
    assert negado.status_code == 403


def test_banco_antigo_ganha_a_tabela_de_usuarios(tmp_path):
    import sqlite3

    from app.config.banco import preparar_banco

    arquivo = tmp_path / "antigo.db"
    with sqlite3.connect(arquivo) as conexao:
        conexao.execute("CREATE TABLE empresa (id INTEGER PRIMARY KEY)")
        conexao.execute("CREATE TABLE motorista (id INTEGER PRIMARY KEY, apelido TEXT)")
    preparar_banco(f"sqlite:///{arquivo}")
    with sqlite3.connect(arquivo) as conexao:
        assert [l[0] for l in conexao.execute("SELECT login FROM usuario ORDER BY id")] == ["admin", "auxiliar", "motorista", "joao", "univan"]
