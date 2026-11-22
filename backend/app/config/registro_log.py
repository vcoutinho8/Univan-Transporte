"""Logging da API: formato único no console e uma linha por requisição atendida.

O nível vem de LOG_LEVEL no .env (DEBUG, INFO, WARNING, ERROR). Todos os loggers do
projeto ficam abaixo de "univan" (univan.http, univan.erros, univan.banco...).
"""

import logging
import time

from fastapi import FastAPI, Request

FORMATO = "%(asctime)s %(levelname)-7s [%(name)s] %(message)s"
FORMATO_DATA = "%Y-%m-%d %H:%M:%S"

log_http = logging.getLogger("univan.http")


def configurar_log(nivel: str) -> None:
    """Liga o console para os loggers do projeto. Pode ser chamada mais de uma vez."""
    raiz = logging.getLogger("univan")
    raiz.setLevel(nivel.upper())
    if not any(getattr(h, "_univan", False) for h in raiz.handlers):
        saida = logging.StreamHandler()
        saida.setFormatter(logging.Formatter(FORMATO, FORMATO_DATA))
        saida._univan = True  # marca para não duplicar no --reload ou nos testes
        raiz.addHandler(saida)
        raiz.propagate = False  # já sai no console; não repete pelo logger raiz


def registrar_log_requisicoes(app: FastAPI) -> None:
    """Registra método, caminho, status e tempo de cada chamada à API."""

    @app.middleware("http")
    async def registrar_requisicao(requisicao: Request, proximo):
        inicio = time.perf_counter()
        try:
            resposta = await proximo(requisicao)
        except Exception:
            # O tratador de erro inesperado registra o detalhe; aqui só a linha da requisição.
            _registrar(requisicao, 500, inicio)
            raise
        _registrar(requisicao, resposta.status_code, inicio)
        return resposta


def _registrar(requisicao: Request, codigo: int, inicio: float) -> None:
    duracao_ms = (time.perf_counter() - inicio) * 1000
    nivel = logging.ERROR if codigo >= 500 else logging.WARNING if codigo >= 400 else logging.INFO
    caminho = requisicao.url.path
    if requisicao.url.query:
        caminho += f"?{requisicao.url.query}"
    log_http.log(nivel, "%s %s -> %d (%.0f ms)", requisicao.method, caminho, codigo, duracao_ms)
