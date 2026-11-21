"""Ponto de entrada da API do UniVan.

Executar (a partir de backend/):  uvicorn app.main:app --reload
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.modules as _registro_models  # noqa: F401  (registra todos os models)
from app.config.banco import preparar_banco
from app.config.configuracoes import obter_configuracoes
from app.config.documentacao import DESCRICAO, ERROS_COMUNS, PARAMETROS_SWAGGER, TAGS
from app.config.erros import registrar_tratadores_erro
from app.config.registro_log import configurar_log, registrar_log_requisicoes
from app.modules.area import area_controller
from app.modules.dia_sem_aula import dia_sem_aula_controller
from app.modules.empresa import empresa_controller
from app.modules.estudante import estudante_controller
from app.modules.instituicao import instituicao_controller
from app.modules.motorista import motorista_controller
from app.modules.painel import painel_controller
from app.modules.relatorio import relatorio_controller
from app.modules.rota import rota_controller
from app.modules.saude import saude_controller
from app.modules.veiculo import veiculo_controller
from app.modules.viagem import viagem_controller

PREFIXO_API = "/api"

# Cada módulo com rotas HTTP expõe um `roteador`. Para um módulo novo, basta incluí-lo aqui.
CONTROLLERS = (
    saude_controller,
    painel_controller,
    empresa_controller,
    veiculo_controller,
    estudante_controller,
    instituicao_controller,
    area_controller,
    motorista_controller,
    rota_controller,
    viagem_controller,
    dia_sem_aula_controller,
    relatorio_controller,
)


@asynccontextmanager
async def ciclo_de_vida(_: FastAPI):
    # Na primeira execução com SQLite, cria o arquivo do banco a partir de docs/univan-sqlite.sql.
    preparar_banco(obter_configuracoes().url_banco_resolvida)
    yield


def criar_aplicacao() -> FastAPI:
    configuracoes = obter_configuracoes()
    configurar_log(configuracoes.nivel_log)

    app = FastAPI(
        lifespan=ciclo_de_vida,
        title=configuracoes.nome_aplicacao,
        summary="Gestão de transporte universitário: passageiros, frota, bairros, rotas, viagens e relatórios.",
        description=DESCRICAO,
        version="0.3.0",
        openapi_tags=TAGS,
        # Swagger (testar as rotas) e ReDoc (leitura), ambos atrás do prefixo /api.
        docs_url=f"{PREFIXO_API}/docs",
        redoc_url=f"{PREFIXO_API}/redoc",
        openapi_url=f"{PREFIXO_API}/openapi.json",
        swagger_ui_parameters=PARAMETROS_SWAGGER,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=configuracoes.lista_origens_cors,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    registrar_tratadores_erro(app)
    registrar_log_requisicoes(app)

    for controller in CONTROLLERS:
        app.include_router(controller.roteador, prefix=PREFIXO_API, responses=ERROS_COMUNS)

    return app


app = criar_aplicacao()
