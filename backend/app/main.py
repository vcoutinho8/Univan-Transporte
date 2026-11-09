"""Ponto de entrada da API do UniVan.

Executar (a partir de backend/):  uvicorn app.main:app --reload
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.modules as _registro_models  # noqa: F401  (registra todos os models)
from app.config.banco import preparar_banco
from app.config.configuracoes import obter_configuracoes
from app.config.erros import registrar_tratadores_erro
from app.modules.empresa import empresa_controller
from app.modules.painel import painel_controller
from app.modules.saude import saude_controller
from app.modules.veiculo import veiculo_controller

PREFIXO_API = "/api"

# Cada módulo com rotas HTTP expõe um `roteador`. Para um módulo novo, basta incluí-lo aqui.
CONTROLLERS = (saude_controller, painel_controller, empresa_controller, veiculo_controller)


@asynccontextmanager
async def ciclo_de_vida(_: FastAPI):
    # Na primeira execução com SQLite, cria o arquivo do banco a partir de docs/univan-sqlite.sql.
    preparar_banco(obter_configuracoes().url_banco_resolvida)
    yield


def criar_aplicacao() -> FastAPI:
    configuracoes = obter_configuracoes()

    app = FastAPI(
        lifespan=ciclo_de_vida,
        title=configuracoes.nome_aplicacao,
        description="API do sistema de gestão de transporte universitário UniVan.",
        version="0.2.0",
        docs_url=f"{PREFIXO_API}/docs",
        openapi_url=f"{PREFIXO_API}/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=configuracoes.lista_origens_cors,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    registrar_tratadores_erro(app)

    for controller in CONTROLLERS:
        app.include_router(controller.roteador, prefix=PREFIXO_API)

    return app


app = criar_aplicacao()
