"""A documentação da API (Swagger/ReDoc) precisa acompanhar as rotas: estes testes falham se
uma rota nova entrar sem grupo, sem resumo ou sem os erros documentados."""

import pytest
from fastapi.testclient import TestClient

from app.config.documentacao import TAGS
from app.main import app
from app.modules.area.area_schema import AreaAtualizacao, AreaCriacao
from app.modules.estudante.estudante_schema import EstudanteAtualizacao, EstudanteCriacao
from app.modules.motorista.motorista_schema import MotoristaAtualizacao, MotoristaCriacao
from app.modules.rota.rota_schema import RotaAtualizacao, RotaCriacao
from app.modules.veiculo.veiculo_schema import VeiculoAtualizacao, VeiculoCriacao

cliente = TestClient(app)
ESQUEMA = cliente.get("/api/openapi.json").json()
OPERACOES = [
    (caminho, metodo, operacao)
    for caminho, metodos in ESQUEMA["paths"].items()
    for metodo, operacao in metodos.items()
]
REF_ERRO = "#/components/schemas/RespostaErro"


def _esquema_resposta(operacao, codigo):
    return operacao["responses"][codigo]["content"]["application/json"]["schema"]


def test_swagger_e_redoc_no_ar():
    assert cliente.get("/api/docs").status_code == 200
    assert cliente.get("/api/redoc").status_code == 200
    assert ESQUEMA["info"]["version"] == "0.3.0"
    assert "Nada é apagado" in ESQUEMA["info"]["description"]


def test_todo_grupo_usado_esta_descrito():
    descritos = {t["name"] for t in TAGS}
    assert all(t["description"] for t in TAGS)
    for caminho, metodo, operacao in OPERACOES:
        assert operacao.get("tags"), f"{metodo} {caminho} sem grupo"
        assert set(operacao["tags"]) <= descritos, f"{metodo} {caminho}: grupo sem descrição em TAGS"
        assert operacao.get("summary"), f"{metodo} {caminho} sem resumo"


def test_erros_documentados_no_formato_padrao():
    for caminho, metodo, operacao in OPERACOES:
        codigos = set(operacao["responses"])
        assert {"422", "503"} <= codigos, f"{metodo} {caminho}"
        assert _esquema_resposta(operacao, "422") == {"$ref": REF_ERRO}
        if "{" in caminho:
            assert "404" in codigos, f"{metodo} {caminho} sem 404"
        if metodo in ("post", "patch", "delete"):
            assert "409" in codigos, f"{metodo} {caminho} sem 409"
        for codigo in codigos - {"200", "201"}:
            assert _esquema_resposta(operacao, codigo) == {"$ref": REF_ERRO}


def test_corpos_de_cadastro_e_alteracao_tem_exemplo():
    esquemas = ESQUEMA["components"]["schemas"]
    for nome in (
        "VeiculoCriacao", "VeiculoAtualizacao", "EstudanteCriacao", "EstudanteAtualizacao",
        "AreaCriacao", "AreaAtualizacao", "RotaCriacao", "RotaAtualizacao",
        "MotoristaCriacao", "MotoristaAtualizacao",
    ):
        assert esquemas[nome].get("examples"), nome


@pytest.mark.parametrize(
    "modelo",
    [
        VeiculoCriacao, VeiculoAtualizacao, EstudanteCriacao, EstudanteAtualizacao,
        AreaCriacao, AreaAtualizacao, RotaCriacao, RotaAtualizacao,
        MotoristaCriacao, MotoristaAtualizacao,
    ],
    ids=lambda m: m.__name__,
)
def test_exemplos_passam_na_validacao_da_propria_api(modelo):
    """O exemplo que aparece no Swagger ("Try it out") não pode ser recusado pela API."""
    for exemplo in ESQUEMA["components"]["schemas"][modelo.__name__]["examples"]:
        modelo.model_validate(exemplo)
