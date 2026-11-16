"""Logging e erro inesperado: toda requisição vira uma linha de log e uma falha não prevista
devolve 500 com mensagem neutra, sem vazar o detalhe para o usuário."""

import logging

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient

from app.main import criar_aplicacao
from tests.test_banco_sqlite import cliente, fabrica  # noqa: F401  (fixtures: banco temporário)


@pytest.fixture
def log_capturado(caplog):
    # Os loggers "univan" não propagam para a raiz; liga só durante o teste para o caplog ver.
    raiz = logging.getLogger("univan")
    raiz.propagate = True
    with caplog.at_level(logging.INFO, logger="univan"):
        yield caplog
    raiz.propagate = False


def _app_com_rota_quebrada():
    app = criar_aplicacao()
    roteador = APIRouter()

    @roteador.get("/api/quebra")
    def quebra():
        raise RuntimeError("detalhe interno que não pode vazar")

    app.include_router(roteador)
    return app


def test_requisicao_vira_linha_de_log(log_capturado, cliente):  # noqa: F811
    cliente.get("/api/saude")
    linhas = [r for r in log_capturado.records if r.name == "univan.http"]
    assert linhas and "GET /api/saude -> 200" in linhas[-1].getMessage()
    assert linhas[-1].levelno == logging.INFO


def test_erro_do_usuario_fica_como_aviso(log_capturado, cliente):  # noqa: F811
    cliente.get("/api/estudantes/999999")
    http = [r for r in log_capturado.records if r.name == "univan.http"][-1]
    assert "-> 404" in http.getMessage() and http.levelno == logging.WARNING
    assert any(r.name == "univan.erros" and "não encontrado" in r.getMessage() for r in log_capturado.records)


def test_erro_inesperado_devolve_500_sem_vazar_detalhe(log_capturado):
    cliente = TestClient(_app_com_rota_quebrada(), raise_server_exceptions=False)
    resposta = cliente.get("/api/quebra")
    assert resposta.status_code == 500
    assert resposta.json() == {"mensagem": "Erro inesperado no servidor. Tente novamente em instantes."}
    assert "detalhe interno" not in resposta.text
    erro = [r for r in log_capturado.records if r.name == "univan.erros"][-1]
    assert erro.levelno == logging.ERROR and erro.exc_info  # rastro completo só no log
