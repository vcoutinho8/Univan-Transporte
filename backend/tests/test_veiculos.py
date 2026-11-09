"""Testes da API de veículos com repositórios em memória (sem banco)."""

import pytest
from fastapi.testclient import TestClient

from app.modules.veiculo.veiculo_controller import obter_servico_veiculo
from app.main import app
from app.modules.empresa.empresa_model import Empresa
from app.modules.veiculo.veiculo_model import Veiculo
from app.modules.veiculo.veiculo_servico import ServicoVeiculo
from app.shared.enums import StatusCadastro


class RepositorioEmpresaFalso:
    def __init__(self):
        self.empresas = {1: Empresa(id=1, razao_social="Vale Sul Transportes Ltda", nome_fantasia="Vale Sul", cnpj="11222333000101")}

    def buscar_por_id(self, id_empresa):
        return self.empresas.get(id_empresa)


class RepositorioVeiculoFalso:
    def __init__(self, repositorio_empresa):
        self.repositorio_empresa = repositorio_empresa
        self.veiculos: dict[int, Veiculo] = {}

    def listar(self, status=None, fk_empresa=None):
        return [
            v
            for v in self.veiculos.values()
            if (status is None or v.status == status) and (fk_empresa is None or v.fk_empresa == fk_empresa)
        ]

    def buscar_por_id(self, id_veiculo):
        return self.veiculos.get(id_veiculo)

    def buscar_por_placa(self, placa):
        return next((v for v in self.veiculos.values() if v.placa == placa), None)

    def salvar(self, veiculo):
        if veiculo.id is None:
            veiculo.id = len(self.veiculos) + 1
        if veiculo.status is None:
            veiculo.status = StatusCadastro.ATIVO
        veiculo.empresa = self.repositorio_empresa.buscar_por_id(veiculo.fk_empresa)
        self.veiculos[veiculo.id] = veiculo
        return veiculo


@pytest.fixture
def cliente():
    repositorio_empresa = RepositorioEmpresaFalso()
    servico = ServicoVeiculo(RepositorioVeiculoFalso(repositorio_empresa), repositorio_empresa)
    app.dependency_overrides[obter_servico_veiculo] = lambda: servico
    yield TestClient(app)
    app.dependency_overrides.clear()


VEICULO_VALIDO = {"fk_empresa": 1, "placa": "qja-1b23", "modelo": "Sprinter 416", "cor": "Branca", "capacidade": 20}


def test_cadastra_veiculo_normalizando_placa(cliente):
    resposta = cliente.post("/api/veiculos", json=VEICULO_VALIDO)
    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["placa"] == "QJA1B23"
    assert corpo["status"] == "ativo"
    assert corpo["empresa"]["nome_fantasia"] == "Vale Sul"


def test_recusa_placa_duplicada(cliente):
    cliente.post("/api/veiculos", json=VEICULO_VALIDO)
    resposta = cliente.post("/api/veiculos", json=VEICULO_VALIDO)
    assert resposta.status_code == 409
    assert resposta.json()["mensagem"] == "Já existe um veículo com esta placa."


def test_recusa_empresa_inexistente(cliente):
    resposta = cliente.post("/api/veiculos", json={**VEICULO_VALIDO, "fk_empresa": 99})
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"] == "Empresa não encontrada."


@pytest.mark.parametrize(
    ("alteracao", "campo", "mensagem"),
    [
        ({"placa": "AB12345"}, "placa", "Placa inválida. Use o formato ABC1234 ou ABC1D23."),
        ({"capacidade": 0}, "capacidade", "Deve ser maior que 0."),
        ({"modelo": "   "}, "modelo", "Informe o modelo do veículo."),
        ({"status": "vendido"}, "status", "Valor inválido. Opções aceitas: 'ativo' ou 'inativo'."),
    ],
)
def test_mensagens_de_validacao_em_portugues(cliente, alteracao, campo, mensagem):
    resposta = cliente.post("/api/veiculos", json={**VEICULO_VALIDO, **alteracao})
    assert resposta.status_code == 422
    corpo = resposta.json()
    assert corpo["mensagem"] == "Dados inválidos."
    assert {"campo": campo, "mensagem": mensagem} in corpo["erros"]


def test_campo_obrigatorio_ausente(cliente):
    resposta = cliente.post("/api/veiculos", json={"placa": "QJA1B23"})
    erros = {e["campo"]: e["mensagem"] for e in resposta.json()["erros"]}
    assert erros["modelo"] == "Campo obrigatório."
    assert erros["capacidade"] == "Campo obrigatório."


def test_veiculo_inexistente(cliente):
    resposta = cliente.get("/api/veiculos/123")
    assert resposta.status_code == 404
    assert resposta.json()["mensagem"] == "Veículo não encontrado."


def test_atualiza_e_inativa_sem_apagar(cliente):
    id_veiculo = cliente.post("/api/veiculos", json=VEICULO_VALIDO).json()["id"]

    resposta = cliente.patch(f"/api/veiculos/{id_veiculo}", json={"cor": "Prata"})
    assert resposta.status_code == 200
    assert resposta.json()["cor"] == "Prata"

    resposta = cliente.delete(f"/api/veiculos/{id_veiculo}")
    assert resposta.status_code == 200
    assert resposta.json()["status"] == "inativo"

    # Continua existindo, apenas inativo.
    assert cliente.get(f"/api/veiculos/{id_veiculo}").status_code == 200
    assert cliente.get("/api/veiculos", params={"status": "ativo"}).json() == []

    resposta = cliente.delete(f"/api/veiculos/{id_veiculo}")
    assert resposta.status_code == 409
    assert resposta.json()["mensagem"] == "O veículo já está inativo."


def test_atualizacao_nao_aceita_campo_obrigatorio_nulo(cliente):
    id_veiculo = cliente.post("/api/veiculos", json=VEICULO_VALIDO).json()["id"]
    resposta = cliente.patch(f"/api/veiculos/{id_veiculo}", json={"modelo": None})
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"] == "O campo modelo não pode ficar vazio."
