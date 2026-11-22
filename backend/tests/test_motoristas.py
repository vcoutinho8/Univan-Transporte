"""Testes da API de motoristas com repositórios em memória (sem banco)."""

from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.config.empresa_atual import obter_id_empresa_atual
from app.main import app
from tests.autenticacao import logar_como_admin
from app.modules.empresa.empresa_model import Empresa
from app.modules.motorista.motorista_controller import obter_servico_motorista
from app.modules.motorista.motorista_model import Motorista
from app.modules.motorista.motorista_servico import ServicoMotorista
from app.modules.veiculo.veiculo_model import Veiculo
from app.shared.enums import StatusCadastro

HOJE = date.today()
EM_3_ANOS = HOJE + timedelta(days=365 * 3)
ONTEM = HOJE - timedelta(days=1)
EM_11_ANOS = HOJE + timedelta(days=365 * 11)

# CPFs e CNHs com dígitos verificadores corretos (ver test_documentos.py).
CPF_A, CPF_B = "12345678909", "52998224725"
CNH_A, CNH_B = "02650306461", "98765432109"


class RepositorioEmpresaFalso:
    def __init__(self):
        self.empresas = {1: Empresa(id=1, razao_social="Vale Sul Transportes Ltda", nome_fantasia="Vale Sul", cnpj="11222333000101")}

    def buscar_por_id(self, id_empresa):
        return self.empresas.get(id_empresa)


def _veiculo(id_veiculo, placa, status=StatusCadastro.ATIVO, fk_empresa=1):
    return Veiculo(id=id_veiculo, fk_empresa=fk_empresa, placa=placa, modelo="Sprinter 416", cor="Branca", capacidade=20, status=status)


class RepositorioVeiculoFalso:
    def __init__(self):
        self.veiculos = {
            1: _veiculo(1, "QJA1B23"),
            2: _veiculo(2, "RIO2A34"),
            3: _veiculo(3, "ABC1234", status=StatusCadastro.INATIVO),
            4: _veiculo(4, "XYZ9Z99", fk_empresa=2),
        }

    def buscar_por_id(self, id_veiculo):
        return self.veiculos.get(id_veiculo)


class RepositorioMotoristaFalso:
    def __init__(self, repositorio_veiculo):
        self.repositorio_veiculo = repositorio_veiculo
        self.motoristas: dict[int, Motorista] = {}

    def listar(self, status=None):
        return [m for m in self.motoristas.values() if status is None or m.status == status]

    def buscar_por_id(self, id_motorista):
        return self.motoristas.get(id_motorista)

    def buscar_por_cpf(self, cpf):
        return next((m for m in self.motoristas.values() if m.cpf == cpf), None)

    def buscar_por_cnh(self, cnh):
        return next((m for m in self.motoristas.values() if m.cnh == cnh), None)

    def salvar(self, motorista):
        if motorista.id is None:
            motorista.id = len(self.motoristas) + 1
        if motorista.status is None:
            motorista.status = StatusCadastro.ATIVO
        motorista.veiculo = self.repositorio_veiculo.buscar_por_id(motorista.fk_veiculo)
        self.motoristas[motorista.id] = motorista
        return motorista


@pytest.fixture
def ambiente():
    repositorio_empresa = RepositorioEmpresaFalso()
    repositorio_veiculo = RepositorioVeiculoFalso()
    repositorio_motorista = RepositorioMotoristaFalso(repositorio_veiculo)
    servico = ServicoMotorista(repositorio_motorista, repositorio_veiculo, repositorio_empresa)
    app.dependency_overrides[obter_servico_motorista] = lambda: servico
    logar_como_admin()
    app.dependency_overrides[obter_id_empresa_atual] = lambda: 1
    yield SimpleNamespace(cliente=TestClient(app), motoristas=repositorio_motorista)
    app.dependency_overrides.clear()


@pytest.fixture
def cliente(ambiente):
    return ambiente.cliente


def motorista_valido(**mudancas):
    """Corpo de um cadastro correto; `mudancas` troca ou acrescenta campos."""
    return {
        "nome": "Carlos Eduardo Martins",
        "apelido": "Cadu",
        "cpf": "123.456.789-09",
        "celular": "(27) 99111-0001",
        "cnh": "026.503.064-61",
        "cnh_validade": EM_3_ANOS.isoformat(),
        "fk_veiculo": 1,
    } | mudancas


def cadastrar(cliente, **mudancas):
    resposta = cliente.post("/api/motoristas", json=motorista_valido(**mudancas))
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


# ------------------------------------------------------------------ cadastro


def test_cadastra_motorista_normalizando_documentos(cliente):
    resposta = cliente.post("/api/motoristas", json=motorista_valido())
    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["cpf"] == CPF_A
    assert corpo["celular"] == "27991110001"
    assert corpo["cnh"] == CNH_A
    assert corpo["apelido"] == "Cadu"
    assert corpo["cnh_validade"] == EM_3_ANOS.isoformat()
    assert corpo["status"] == "ativo"
    assert corpo["fk_empresa"] == 1
    assert corpo["veiculo"]["placa"] == "QJA1B23"


def test_cadastra_sem_apelido_e_sem_veiculo(cliente):
    corpo = cadastrar(cliente, apelido="   ", fk_veiculo=None)
    assert corpo["apelido"] is None
    assert corpo["fk_veiculo"] is None
    assert corpo["veiculo"] is None


def test_cadastra_na_empresa_da_sessao(cliente):
    assert cadastrar(cliente)["fk_empresa"] == 1


def test_recusa_empresa_da_sessao_inexistente(cliente):
    app.dependency_overrides[obter_id_empresa_atual] = lambda: 99
    resposta = cliente.post("/api/motoristas", json=motorista_valido())
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"] == "Empresa não encontrada."


@pytest.mark.parametrize("metodo", ["post", "patch"])
def test_empresa_nao_vem_no_corpo(cliente, metodo):
    if metodo == "post":
        resposta = cliente.post("/api/motoristas", json=motorista_valido(fk_empresa=2))
    else:
        id_motorista = cadastrar(cliente)["id"]
        resposta = cliente.patch(f"/api/motoristas/{id_motorista}", json={"fk_empresa": 2})
    assert resposta.status_code == 422
    assert {"campo": "fk_empresa", "mensagem": "Campo não permitido."} in resposta.json()["erros"]


def test_recusa_cpf_duplicado(cliente):
    cadastrar(cliente)
    resposta = cliente.post("/api/motoristas", json=motorista_valido(cnh=CNH_B))
    assert resposta.status_code == 409
    assert resposta.json()["mensagem"] == "Já existe um motorista com este CPF."


def test_recusa_cnh_duplicada(cliente):
    cadastrar(cliente)
    resposta = cliente.post("/api/motoristas", json=motorista_valido(cpf=CPF_B))
    assert resposta.status_code == 409
    assert resposta.json()["mensagem"] == "Já existe um motorista com esta CNH."


# ------------------------------------------------------------------ validações de formato (schema)


@pytest.mark.parametrize(
    ("alteracao", "campo", "mensagem"),
    [
        ({"nome": "   "}, "nome", "Informe o nome do motorista."),
        ({"cpf": "123.456.789"}, "cpf", "CPF inválido. Informe os 11 números."),
        ({"celular": "12345"}, "celular", "Celular inválido. Informe DDD + número."),
        ({"cnh": "1234567890"}, "cnh", "CNH inválida. Informe os 11 números do registro."),
        ({"cnh_validade": "31/12/2030"}, "cnh_validade", "Data inválida."),
        ({"fk_veiculo": 0}, "fk_veiculo", "Deve ser maior que 0."),
        ({"status": "vendido"}, "status", "Valor inválido. Opções aceitas: 'ativo' ou 'inativo'."),
        ({"apelido": "x" * 31}, "apelido", "Deve ter no máximo 30 caracteres."),
    ],
)
def test_mensagens_de_validacao_em_portugues(cliente, alteracao, campo, mensagem):
    resposta = cliente.post("/api/motoristas", json=motorista_valido(**alteracao))
    assert resposta.status_code == 422
    corpo = resposta.json()
    assert corpo["mensagem"] == "Dados inválidos."
    assert {"campo": campo, "mensagem": mensagem} in corpo["erros"]


def test_campos_obrigatorios_ausentes(cliente):
    resposta = cliente.post("/api/motoristas", json={})
    erros = {e["campo"]: e["mensagem"] for e in resposta.json()["erros"]}
    for campo in ("nome", "cpf", "celular", "cnh", "cnh_validade"):
        assert erros[campo] == "Campo obrigatório."


# ------------------------------------------------------------------ dígitos verificadores e validade da CNH


def test_recusa_cpf_com_digito_verificador_errado(cliente):
    resposta = cliente.post("/api/motoristas", json=motorista_valido(cpf="12345678901"))
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"] == "CPF inválido. Confira os números digitados."


def test_recusa_cpf_repetido(cliente):
    resposta = cliente.post("/api/motoristas", json=motorista_valido(cpf="111.111.111-11"))
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"] == "CPF inválido. Confira os números digitados."


def test_recusa_cnh_com_digito_verificador_errado(cliente):
    resposta = cliente.post("/api/motoristas", json=motorista_valido(cnh="12345678901"))
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"] == "CNH inválida. Confira o número do registro."


def test_recusa_cnh_vencida_em_motorista_ativo(cliente):
    resposta = cliente.post("/api/motoristas", json=motorista_valido(cnh_validade=ONTEM.isoformat()))
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"] == f"CNH vencida em {ONTEM.strftime('%d/%m/%Y')}. Atualize a validade."


def test_aceita_cnh_vencida_em_motorista_inativo(cliente):
    corpo = cadastrar(cliente, cnh_validade=ONTEM.isoformat(), status="inativo")
    assert corpo["status"] == "inativo"


def test_cnh_vence_hoje_ainda_vale(cliente):
    assert cadastrar(cliente, cnh_validade=HOJE.isoformat())["cnh_validade"] == HOJE.isoformat()


def test_recusa_validade_da_cnh_muito_distante(cliente):
    resposta = cliente.post("/api/motoristas", json=motorista_valido(cnh_validade=EM_11_ANOS.isoformat()))
    assert resposta.status_code == 422
    assert "Validade da CNH inválida" in resposta.json()["mensagem"]


# ------------------------------------------------------------------ vínculo com o veículo


def test_recusa_veiculo_inexistente(cliente):
    resposta = cliente.post("/api/motoristas", json=motorista_valido(fk_veiculo=99))
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"] == "Veículo não encontrado."


def test_recusa_veiculo_inativo(cliente):
    resposta = cliente.post("/api/motoristas", json=motorista_valido(fk_veiculo=3))
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"] == "O veículo ABC1234 está inativo."


def test_recusa_veiculo_de_outra_empresa(cliente):
    resposta = cliente.post("/api/motoristas", json=motorista_valido(fk_veiculo=4))
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"] == "Este veículo pertence a outra empresa."


# ------------------------------------------------------------------ consulta


def test_motorista_inexistente(cliente):
    resposta = cliente.get("/api/motoristas/123")
    assert resposta.status_code == 404
    assert resposta.json()["mensagem"] == "Motorista não encontrado."


def test_lista_e_filtra_por_situacao(cliente):
    cadastrar(cliente)
    cadastrar(cliente, nome="Ana Souza", cpf=CPF_B, cnh=CNH_B, status="inativo")

    assert len(cliente.get("/api/motoristas").json()) == 2
    ativos = cliente.get("/api/motoristas", params={"status": "ativo"}).json()
    assert [m["nome"] for m in ativos] == ["Carlos Eduardo Martins"]
    inativos = cliente.get("/api/motoristas", params={"status": "inativo"}).json()
    assert [m["nome"] for m in inativos] == ["Ana Souza"]


def test_busca_um_motorista(cliente):
    id_motorista = cadastrar(cliente)["id"]
    resposta = cliente.get(f"/api/motoristas/{id_motorista}")
    assert resposta.status_code == 200
    assert resposta.json()["cpf"] == CPF_A


# ------------------------------------------------------------------ alteração


def test_atualiza_so_o_que_foi_enviado(cliente):
    id_motorista = cadastrar(cliente)["id"]

    resposta = cliente.patch(f"/api/motoristas/{id_motorista}", json={"apelido": "Carlão", "celular": "(27) 98888-7777"})
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["apelido"] == "Carlão"
    assert corpo["celular"] == "27988887777"
    assert corpo["nome"] == "Carlos Eduardo Martins"
    assert corpo["cpf"] == CPF_A


def test_troca_e_remove_o_veiculo_padrao(cliente):
    id_motorista = cadastrar(cliente)["id"]

    trocado = cliente.patch(f"/api/motoristas/{id_motorista}", json={"fk_veiculo": 2}).json()
    assert trocado["veiculo"]["placa"] == "RIO2A34"

    removido = cliente.patch(f"/api/motoristas/{id_motorista}", json={"fk_veiculo": None}).json()
    assert removido["fk_veiculo"] is None
    assert removido["veiculo"] is None


def test_atualizacao_confere_cpf_e_cnh_novos(cliente):
    id_motorista = cadastrar(cliente)["id"]

    resposta = cliente.patch(f"/api/motoristas/{id_motorista}", json={"cpf": "12345678901"})
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"] == "CPF inválido. Confira os números digitados."

    resposta = cliente.patch(f"/api/motoristas/{id_motorista}", json={"cnh": "12345678901"})
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"] == "CNH inválida. Confira o número do registro."

    resposta = cliente.patch(f"/api/motoristas/{id_motorista}", json={"cpf": CPF_B, "cnh": CNH_B})
    assert resposta.status_code == 200
    assert resposta.json()["cpf"] == CPF_B


def test_atualizacao_recusa_cpf_e_cnh_de_outro_motorista(cliente):
    cadastrar(cliente)
    id_outro = cadastrar(cliente, nome="Ana Souza", cpf=CPF_B, cnh=CNH_B)["id"]

    resposta = cliente.patch(f"/api/motoristas/{id_outro}", json={"cpf": CPF_A})
    assert resposta.status_code == 409
    assert resposta.json()["mensagem"] == "Já existe um motorista com este CPF."

    resposta = cliente.patch(f"/api/motoristas/{id_outro}", json={"cnh": CNH_A})
    assert resposta.status_code == 409
    assert resposta.json()["mensagem"] == "Já existe um motorista com esta CNH."


def test_atualizacao_confere_o_veiculo_novo(cliente):
    id_motorista = cadastrar(cliente)["id"]
    for veiculo, mensagem in (
        (99, "Veículo não encontrado."),
        (3, "O veículo ABC1234 está inativo."),
        (4, "Este veículo pertence a outra empresa."),
    ):
        resposta = cliente.patch(f"/api/motoristas/{id_motorista}", json={"fk_veiculo": veiculo})
        assert resposta.status_code == 422
        assert resposta.json()["mensagem"] == mensagem


def test_atualizacao_recusa_cnh_nova_vencida(cliente):
    id_motorista = cadastrar(cliente)["id"]
    resposta = cliente.patch(f"/api/motoristas/{id_motorista}", json={"cnh_validade": ONTEM.isoformat()})
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"].startswith("CNH vencida em ")


@pytest.mark.parametrize("campo", ["nome", "cpf", "celular", "cnh", "cnh_validade", "status"])
def test_atualizacao_nao_aceita_campo_obrigatorio_nulo(cliente, campo):
    id_motorista = cadastrar(cliente)["id"]
    resposta = cliente.patch(f"/api/motoristas/{id_motorista}", json={campo: None})
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"] == f"O campo {campo} não pode ficar vazio."


def test_motorista_antigo_continua_editavel_com_documentos_gravados_no_passado(ambiente):
    """Os dados de exemplo têm CPF e CNH que não passam na conta dos dígitos: só valem conferir se mudarem."""
    antigo = Motorista(
        fk_empresa=1, fk_veiculo=1, nome="Motorista Antigo", cpf="12345678901", celular="27991110001",
        cnh="12345678901", cnh_validade=ONTEM, status=StatusCadastro.ATIVO,
    )
    ambiente.motoristas.salvar(antigo)

    # O formulário reenvia tudo: documentos e validade iguais aos gravados.
    resposta = ambiente.cliente.patch(
        f"/api/motoristas/{antigo.id}",
        json={"nome": "Motorista Antigo", "cpf": "12345678901", "cnh": "12345678901", "cnh_validade": ONTEM.isoformat(), "apelido": "Velho"},
    )
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["apelido"] == "Velho"


# ------------------------------------------------------------------ inativação e reativação


def test_inativa_sem_apagar_e_reativa(cliente):
    id_motorista = cadastrar(cliente)["id"]

    resposta = cliente.delete(f"/api/motoristas/{id_motorista}")
    assert resposta.status_code == 200
    assert resposta.json()["status"] == "inativo"

    # Continua existindo, apenas inativo.
    assert cliente.get(f"/api/motoristas/{id_motorista}").status_code == 200
    assert cliente.get("/api/motoristas", params={"status": "ativo"}).json() == []

    resposta = cliente.delete(f"/api/motoristas/{id_motorista}")
    assert resposta.status_code == 409
    assert resposta.json()["mensagem"] == "O motorista já está inativo."

    reativado = cliente.patch(f"/api/motoristas/{id_motorista}", json={"status": "ativo"})
    assert reativado.status_code == 200
    assert reativado.json()["status"] == "ativo"


def test_nao_reativa_motorista_com_cnh_vencida(cliente):
    id_motorista = cadastrar(cliente, cnh_validade=ONTEM.isoformat(), status="inativo")["id"]

    resposta = cliente.patch(f"/api/motoristas/{id_motorista}", json={"status": "ativo"})
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"].startswith("CNH vencida em ")

    # Atualizando a validade junto, a reativação passa.
    resposta = cliente.patch(
        f"/api/motoristas/{id_motorista}", json={"status": "ativo", "cnh_validade": EM_3_ANOS.isoformat()}
    )
    assert resposta.status_code == 200
    assert resposta.json()["status"] == "ativo"


def test_inativar_motorista_inexistente(cliente):
    resposta = cliente.delete("/api/motoristas/123")
    assert resposta.status_code == 404
