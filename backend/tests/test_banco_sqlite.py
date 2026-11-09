"""Testes de ponta a ponta com um banco SQLite de verdade, criado de docs/univan-sqlite.sql.

Cada teste recebe um arquivo novo numa pasta temporária, então nada do banco de
desenvolvimento (backend/univan.db) é tocado.
"""

from datetime import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.config.banco import criar_banco_sqlite, criar_motor, obter_sessao, preparar_banco
from app.config.erros import MENSAGENS_RESTRICOES, nome_restricao
from app.main import app
from app.modules.estudante.estudante_model import Estudante
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
    yield TestClient(app)
    app.dependency_overrides.clear()


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
        json={"fk_empresa": 1, "placa": "zzz-9z99", "modelo": "Master", "capacidade": 15},
    )
    assert criado.status_code == 201, criado.text
    id_veiculo = criado.json()["id"]
    assert criado.json()["placa"] == "ZZZ9Z99"

    editado = cliente.patch(f"/api/veiculos/{id_veiculo}", json={"capacidade": 16})
    assert editado.json()["capacidade"] == 16

    inativado = cliente.delete(f"/api/veiculos/{id_veiculo}")
    assert inativado.json()["status"] == "inativo"
    assert cliente.get(f"/api/veiculos/{id_veiculo}").status_code == 200  # não foi apagado


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

