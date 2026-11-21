"""Testes de ponta a ponta com um banco SQLite de verdade, criado de docs/univan-sqlite.sql.

Cada teste recebe um arquivo novo numa pasta temporária, então nada do banco de
desenvolvimento (backend/univan.db) é tocado.
"""

from datetime import date, time, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.config.banco import criar_banco_sqlite, criar_motor, obter_sessao, preparar_banco
from app.config.erros import MENSAGENS_RESTRICOES, nome_restricao
from app.main import app
from app.modules.estudante.estudante_model import Estudante
from app.modules.motorista.motorista_model import Motorista
from app.modules.veiculo.veiculo_model import Veiculo


@pytest.fixture
def fabrica(tmp_path):
    arquivo = tmp_path / "univan.db"
    criar_banco_sqlite(arquivo)
    motor = criar_motor(f"sqlite:///{arquivo}")
    yield sessionmaker(bind=motor, autoflush=False, expire_on_commit=False)
    motor.dispose()


@pytest.fixture
def cliente(fabrica):
    def sessao_de_teste():
        sessao = fabrica()
        try:
            yield sessao
        finally:
            sessao.close()

    app.dependency_overrides[obter_sessao] = sessao_de_teste
    cliente = TestClient(app)
    # Os testes rodam logados como administrador (acesso a tudo); os de permissão trocam o usuário.
    entrar(cliente, "admin", "123456")
    yield cliente
    app.dependency_overrides.clear()


def entrar(cliente: TestClient, usuario: str, senha: str) -> dict:
    """Faz login e deixa o token no cliente para as próximas requisições."""
    resposta = cliente.post("/api/auth/login", json={"usuario": usuario, "senha": senha})
    assert resposta.status_code == 200, resposta.text
    cliente.headers["Authorization"] = f"Bearer {resposta.json()['token']}"
    return resposta.json()


def test_preparar_banco_cria_o_arquivo(tmp_path):
    arquivo = tmp_path / "novo" / "univan.db"
    preparar_banco(f"sqlite:///{arquivo}")
    assert arquivo.exists()
    preparar_banco(f"sqlite:///{arquivo}")  # segunda vez: não recria nem falha


def test_saude(cliente):
    assert cliente.get("/api/saude").json() == {"api": "ok", "banco": "conectado"}


def test_lista_veiculos_do_banco(cliente):
    resposta = cliente.get("/api/veiculos")
    assert resposta.status_code == 200
    assert len(resposta.json()) == 10


def test_painel(cliente):
    resposta = cliente.get("/api/painel/resumo")
    assert resposta.status_code == 200


def test_cadastra_edita_e_inativa_veiculo(cliente):
    criado = cliente.post(
        "/api/veiculos",
        json={"placa": "zzz-9z99", "modelo": "Master", "capacidade": 15},
    )
    assert criado.status_code == 201, criado.text
    id_veiculo = criado.json()["id"]
    assert criado.json()["placa"] == "ZZZ9Z99"

    editado = cliente.patch(f"/api/veiculos/{id_veiculo}", json={"capacidade": 16})
    assert editado.json()["capacidade"] == 16

    inativado = cliente.delete(f"/api/veiculos/{id_veiculo}")
    assert inativado.json()["status"] == "inativo"
    assert cliente.get(f"/api/veiculos/{id_veiculo}").status_code == 200  # não foi apagado


def test_lista_motoristas_do_banco(cliente):
    resposta = cliente.get("/api/motoristas")
    assert resposta.status_code == 200
    motoristas = {m["id"]: m for m in resposta.json()}
    assert len(motoristas) == 10
    assert motoristas[1]["apelido"] == "Cadu"
    assert motoristas[1]["veiculo"]["id"] == 1
    assert motoristas[10]["status"] == "inativo"
    assert motoristas[10]["veiculo"] is None


def test_cadastra_edita_e_inativa_motorista(cliente):
    veiculo = cliente.post("/api/veiculos", json={"placa": "mot-1a23", "modelo": "Master", "capacidade": 15})
    assert veiculo.status_code == 201, veiculo.text

    criado = cliente.post(
        "/api/motoristas",
        json={
            "nome": "Teste da Silva",
            "apelido": "Tê",
            "cpf": "529.982.247-25",
            "celular": "(27) 99999-0000",
            "cnh": "98765432109",
            "cnh_validade": (date.today() + timedelta(days=365 * 3)).isoformat(),
            "fk_veiculo": veiculo.json()["id"],
        },
    )
    assert criado.status_code == 201, criado.text
    id_motorista = criado.json()["id"]
    assert criado.json()["cpf"] == "52998224725"
    assert criado.json()["veiculo"]["placa"] == "MOT1A23"

    # Tirar o veículo padrão precisa aparecer na resposta (o relacionamento é recarregado).
    editado = cliente.patch(f"/api/motoristas/{id_motorista}", json={"apelido": "Teco", "fk_veiculo": None})
    assert editado.status_code == 200, editado.text
    assert editado.json()["apelido"] == "Teco"
    assert editado.json()["veiculo"] is None

    inativado = cliente.delete(f"/api/motoristas/{id_motorista}")
    assert inativado.json()["status"] == "inativo"
    assert cliente.get(f"/api/motoristas/{id_motorista}").status_code == 200  # não foi apagado


def test_edita_motorista_de_exemplo_sem_reconferir_documentos_antigos(cliente):
    """Confere que é possível editar outros dados de um motorista sem alterar seus documentos."""
    resposta = cliente.patch(
        "/api/motoristas/1", json={"cpf": "20130140155", "cnh": "10120130194", "apelido": "Carlinhos"}
    )
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["apelido"] == "Carlinhos"


def test_banco_recusa_cpf_e_cnh_repetidos_de_motorista(fabrica):
    """Grava direto pelo model (sem o serviço) para o próprio banco recusar."""
    for dados, restricao in (({"cpf": "20130140155"}, "motorista_cpf_key"), ({"cnh": "10120130194"}, "motorista_cnh_key")):
        campos = {
            "fk_empresa": 1, "nome": "Repetido", "cpf": "52998224725", "cnh": "98765432109",
            "cnh_validade": date(2030, 1, 1),
        } | dados
        with fabrica() as sessao:
            sessao.add(Motorista(**campos))
            with pytest.raises(IntegrityError) as erro:
                sessao.commit()
        assert nome_restricao(erro.value) == restricao
        assert restricao in MENSAGENS_RESTRICOES


def test_le_datas_e_horarios(fabrica):
    with fabrica() as sessao:
        estudante = sessao.get(Estudante, 1)
        assert isinstance(estudante.horario_embarque, time)


def test_grava_horario_no_formato_do_script(fabrica):
    with fabrica() as sessao:
        estudante = sessao.get(Estudante, 1)
        estudante.horario_embarque = time(6, 45)
        sessao.commit()
        bruto = sessao.connection().exec_driver_sql(
            "SELECT horario_embarque FROM estudante WHERE id = 1"
        ).scalar()
        assert bruto == "06:45:00"


def test_trigger_define_a_area_do_estudante(fabrica):
    with fabrica() as sessao:
        estudante = sessao.get(Estudante, 1)
        area_original = estudante.fk_area
        estudante.fk_area = None
        sessao.commit()
        # O trigger roda quando o endereço muda.
        sessao.connection().exec_driver_sql("UPDATE estudante SET fk_endereco = fk_endereco WHERE id = 1")
        sessao.commit()
        sessao.refresh(estudante)
        assert estudante.fk_area == area_original is not None


@pytest.mark.parametrize(
    ("dados", "restricao"),
    [
        ({"placa": "QJA1B23"}, "veiculo_placa_key"),
        ({"placa": "AB12345"}, "veiculo_placa_check"),
        ({"capacidade": 0}, "veiculo_capacidade_check"),
        ({"fk_empresa": 999}, "foreign_key"),
    ],
)
def test_restricoes_do_banco_viram_mensagem(fabrica, dados, restricao):
    """Grava direto pelo model (sem o serviço) para o próprio banco recusar."""
    campos = {"fk_empresa": 1, "placa": "ZZZ9Z99", "modelo": "x", "capacidade": 10} | dados
    with fabrica() as sessao:
        sessao.add(Veiculo(**campos))
        with pytest.raises(IntegrityError) as erro:
            sessao.commit()
    assert nome_restricao(erro.value) == restricao
    assert restricao in MENSAGENS_RESTRICOES

