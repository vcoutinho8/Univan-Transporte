"""Testes da API de passageiros, instituições e áreas com um banco SQLite de verdade.

Usa banco real (e não repositório em memória) porque a área do passageiro é definida pelos
triggers do banco a partir da latitude/longitude do endereço.
"""

import pytest

from tests.test_banco_sqlite import cliente, fabrica  # noqa: F401  (fixtures)

# Pontos dos dados de teste (Guarapari/ES): casa da Ana (área 1, Centro), casa da Camila
# (área 3, Praia do Morro) e Setiba, que não está em nenhuma área.
PONTO_CENTRO = {"latitude": -20.669064, "longitude": -40.495573}
PONTO_PRAIA_DO_MORRO = {"latitude": -20.653304, "longitude": -40.491154}
PONTO_FORA = {"latitude": -20.630483, "longitude": -40.437893}

ENDERECO = {
    "cep": "29200-180",
    "logradouro": "Rua Ismael de Paula Loureiro",
    "numero": "50",
    "bairro": "Centro",
    "cidade": "Guarapari",
    "estado": "es",
    **PONTO_CENTRO,
}

PASSAGEIRO = {
    "nome": "  Larissa Teste  ",
    "apelido": "",
    "cpf": "123.456.789-09",
    "celular": "(27) 99999-0000",
    "email": "larissa@email.com",
    "fk_instituicao": 1,
    "curso": "Enfermagem",
    "turno": "noite",
    "horario_embarque": "17:30",
    "valor_mensal": 410.5,
    "dia_vencimento": 10,
    "endereco": ENDERECO,
}


def test_lista_passageiros_com_area_e_endereco(cliente):  # noqa: F811
    resposta = cliente.get("/api/estudantes", params={"status": "ativo"})
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert len(corpo) == 40
    ana = next(p for p in corpo if p["nome"] == "Ana Beatriz Souza")
    assert ana["area"] == {"id": 1, "nome": "Centro"}
    assert ana["endereco"]["latitude"] == pytest.approx(-20.669064)
    assert ana["instituicao"]["id"] == 1


def test_cadastra_passageiro_e_banco_define_a_area(cliente):  # noqa: F811
    resposta = cliente.post("/api/estudantes", json=PASSAGEIRO)
    assert resposta.status_code == 201, resposta.text
    corpo = resposta.json()
    assert corpo["nome"] == "Larissa Teste"
    assert corpo["apelido"] is None
    assert corpo["cpf"] == "12345678909"
    assert corpo["celular"] == "27999990000"
    assert corpo["horario_embarque"] == "17:30:00"
    assert corpo["valor_mensal"] == 410.5
    assert corpo["status"] == "ativo"
    assert corpo["endereco"]["cep"] == "29200180"
    assert corpo["endereco"]["estado"] == "ES"
    assert corpo["area"] == {"id": 1, "nome": "Centro"}


def test_passageiro_fora_das_areas_fica_sem_area(cliente):  # noqa: F811
    dados = {**PASSAGEIRO, "endereco": {**ENDERECO, **PONTO_FORA}}
    corpo = cliente.post("/api/estudantes", json=dados).json()
    assert corpo["fk_area"] is None
    assert corpo["area"] is None


def test_mudar_endereco_recalcula_a_area(cliente):  # noqa: F811
    id_passageiro = cliente.post("/api/estudantes", json=PASSAGEIRO).json()["id"]

    resposta = cliente.patch(
        f"/api/estudantes/{id_passageiro}",
        json={"endereco": {**ENDERECO, "bairro": "Praia do Morro", **PONTO_PRAIA_DO_MORRO}},
    )
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["area"]["nome"] == "Praia do Morro"
    assert resposta.json()["endereco"]["bairro"] == "Praia do Morro"

    # Alterar outro campo não mexe na área.
    resposta = cliente.patch(f"/api/estudantes/{id_passageiro}", json={"curso": "Medicina"})
    assert resposta.json()["area"]["nome"] == "Praia do Morro"
    assert resposta.json()["curso"] == "Medicina"


def test_recusa_cpf_duplicado(cliente):  # noqa: F811
    resposta = cliente.post("/api/estudantes", json={**PASSAGEIRO, "cpf": "11122233301"})
    assert resposta.status_code == 409
    assert resposta.json()["mensagem"] == "Já existe um passageiro com este CPF."


def test_recusa_instituicao_inexistente(cliente):  # noqa: F811
    resposta = cliente.post("/api/estudantes", json={**PASSAGEIRO, "fk_instituicao": 999})
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"] == "Instituição não encontrada."


@pytest.mark.parametrize(
    ("alteracao", "campo", "mensagem"),
    [
        ({"cpf": "123"}, "cpf", "CPF inválido. Informe os 11 números."),
        ({"celular": "9999"}, "celular", "Celular inválido. Informe DDD + número."),
        ({"email": "sem-arroba"}, "email", "E-mail inválido."),
        ({"nome": "   "}, "nome", "Informe o nome do passageiro."),
        ({"turno": "madrugada"}, "turno", "Valor inválido. Opções aceitas: 'manha', 'tarde' ou 'noite'."),
        ({"dia_vencimento": 31}, "dia_vencimento", "Deve ser menor ou igual a 28."),
        ({"valor_mensal": -1}, "valor_mensal", "Deve ser maior ou igual a 0."),
        ({"endereco": {**ENDERECO, "cep": "123"}}, "endereco.cep", "CEP inválido. Informe os 8 números."),
        ({"endereco": {**ENDERECO, "estado": "S"}}, "endereco.estado", "Informe a sigla do estado (ex.: SC)."),
        ({"endereco": {**ENDERECO, "latitude": 120}}, "endereco.latitude", "Deve ser menor ou igual a 90."),
    ],
)
def test_validacoes_em_portugues(cliente, alteracao, campo, mensagem):  # noqa: F811
    resposta = cliente.post("/api/estudantes", json={**PASSAGEIRO, **alteracao})
    assert resposta.status_code == 422
    assert {"campo": campo, "mensagem": mensagem} in resposta.json()["erros"]


def test_atualizacao_nao_aceita_obrigatorio_nulo(cliente):  # noqa: F811
    resposta = cliente.patch("/api/estudantes/1", json={"celular": None})
    assert resposta.status_code == 422
    assert resposta.json()["mensagem"] == "O campo celular não pode ficar vazio."


def test_passageiro_inexistente(cliente):  # noqa: F811
    for resposta in (
        cliente.get("/api/estudantes/999"),
        cliente.patch("/api/estudantes/999", json={"curso": "X"}),
        cliente.delete("/api/estudantes/999"),
    ):
        assert resposta.status_code == 404
        assert resposta.json()["mensagem"] == "Passageiro não encontrado."


def test_inativa_sem_apagar_e_reativa(cliente):  # noqa: F811
    resposta = cliente.delete("/api/estudantes/1")
    assert resposta.status_code == 200
    assert resposta.json()["status"] == "inativo"

    resposta = cliente.delete("/api/estudantes/1")
    assert resposta.status_code == 409
    assert resposta.json()["mensagem"] == "O passageiro já está inativo."

    resposta = cliente.patch("/api/estudantes/1", json={"status": "ativo"})
    assert resposta.json()["status"] == "ativo"


def test_lista_instituicoes_com_endereco(cliente):  # noqa: F811
    corpo = cliente.get("/api/instituicoes").json()
    assert len(corpo) == 10
    uvv = next(i for i in corpo if i["id"] == 1)
    assert uvv["nome"] == "UVV - Universidade Vila Velha"
    assert uvv["endereco"]["latitude"] == pytest.approx(-20.354347)
