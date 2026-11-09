"""Erros de negócio e tratadores que devolvem mensagens em português ao usuário."""

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, OperationalError


class ErroNegocio(Exception):
    """Erro previsto pelas regras de negócio. Vira uma resposta HTTP com `mensagem`."""

    codigo_http = status.HTTP_400_BAD_REQUEST

    def __init__(self, mensagem: str, codigo_http: int | None = None):
        super().__init__(mensagem)
        self.mensagem = mensagem
        if codigo_http is not None:
            self.codigo_http = codigo_http


class RecursoNaoEncontrado(ErroNegocio):
    codigo_http = status.HTTP_404_NOT_FOUND


class ConflitoDeDados(ErroNegocio):
    codigo_http = status.HTTP_409_CONFLICT


class DadosInvalidos(ErroNegocio):
    codigo_http = status.HTTP_422_UNPROCESSABLE_CONTENT


# Mensagens para as restrições do banco (nomes exatos de docs/univan-sqlite.sql).
MENSAGENS_RESTRICOES = {
    "veiculo_placa_key": "Já existe um veículo com esta placa.",
    "veiculo_placa_check": "Placa inválida. Use o formato ABC1234 ou ABC1D23.",
    "veiculo_capacidade_check": "A capacidade deve ser maior que zero.",
    "veiculo_fk_empresa_fkey": "Empresa não encontrada.",
    "empresa_cnpj_key": "Já existe uma empresa com este CNPJ.",
    "empresa_cnpj_check": "CNPJ inválido. Informe apenas os 14 números.",
    "endereco_cep_check": "CEP inválido. Informe apenas os 8 números.",
    "estudante_cpf_key": "Já existe um estudante com este CPF.",
    "estudante_cpf_check": "CPF inválido. Informe apenas os 11 números.",
    "estudante_dia_vencimento_check": "O dia de vencimento deve estar entre 1 e 28.",
    "estudante_valor_mensal_check": "O valor mensal não pode ser negativo.",
    "motorista_cpf_key": "Já existe um motorista com este CPF.",
    "motorista_cnh_key": "Já existe um motorista com esta CNH.",
    "motorista_cpf_check": "CPF inválido. Informe apenas os 11 números.",
    "motorista_dia_pagamento_check": "O dia de pagamento deve estar entre 1 e 28.",
    "motorista_salario_check": "O salário não pode ser negativo.",
    "rota_fk_motorista_fk_instituicao_turno_key": (
        "Este motorista já tem uma rota para esta instituição neste turno."
    ),
    "rota_dia_dia_semana_check": "O dia da semana deve estar entre 1 e 7.",
    "dia_sem_aula_data_fk_instituicao_key": "Este dia sem aula já foi cadastrado.",
    "viagem_fk_rota_data_sentido_key": "Já existe viagem desta rota nesta data e sentido.",
    "chamada_pkey": "Este estudante já está na chamada desta viagem.",
    "titulo_receber_fk_estudante_competencia_key": (
        "Já existe mensalidade deste estudante nesta competência."
    ),
    "titulo_receber_competencia_check": "A competência deve ser sempre o dia 01 do mês.",
    "titulo_receber_valor_check": "O valor não pode ser negativo.",
    "titulo_pagar_check": "Título de salário exige um motorista.",
    "titulo_pagar_competencia_check": "A competência deve ser sempre o dia 01 do mês.",
    "titulo_pagar_valor_check": "O valor não pode ser negativo.",
    "ux_salario_mes": "Já existe salário deste motorista nesta competência.",
    "foreign_key": "Registro relacionado não encontrado.",
}

# O SQLite identifica um UNIQUE violado pelas colunas ("veiculo.placa"), não pelo nome.
# Este mapa leva as colunas ao nome da restrição, para reaproveitar MENSAGENS_RESTRICOES.
RESTRICOES_UNIQUE_SQLITE = {
    "veiculo.placa": "veiculo_placa_key",
    "empresa.cnpj": "empresa_cnpj_key",
    "estudante.cpf": "estudante_cpf_key",
    "motorista.cpf": "motorista_cpf_key",
    "motorista.cnh": "motorista_cnh_key",
    "rota.fk_motorista, rota.fk_instituicao, rota.turno": "rota_fk_motorista_fk_instituicao_turno_key",
    "viagem.fk_rota, viagem.data, viagem.sentido": "viagem_fk_rota_data_sentido_key",
    "chamada.fk_viagem, chamada.fk_estudante": "chamada_pkey",
    "titulo_receber.fk_estudante, titulo_receber.competencia": (
        "titulo_receber_fk_estudante_competencia_key"
    ),
}


def nome_restricao(erro: IntegrityError) -> str | None:
    """Descobre, pelo texto do erro do SQLite, qual restrição recusou a gravação."""
    texto = str(erro.orig)
    if texto.startswith("CHECK constraint failed: "):
        return texto.removeprefix("CHECK constraint failed: ").strip()
    if texto.startswith("UNIQUE constraint failed: index '"):
        return texto.removeprefix("UNIQUE constraint failed: index '").rstrip("'")
    if texto.startswith("UNIQUE constraint failed: "):
        return RESTRICOES_UNIQUE_SQLITE.get(texto.removeprefix("UNIQUE constraint failed: ").strip())
    if texto.startswith("FOREIGN KEY constraint failed"):
        return "foreign_key"
    return None

# Tradução dos tipos de erro de validação do Pydantic.
MENSAGENS_VALIDACAO = {
    "missing": "Campo obrigatório.",
    "string_type": "Deve ser um texto.",
    "string_too_short": "Deve ter pelo menos {min_length} caractere(s).",
    "string_too_long": "Deve ter no máximo {max_length} caracteres.",
    "string_pattern_mismatch": "Formato inválido.",
    "int_type": "Deve ser um número inteiro.",
    "int_parsing": "Deve ser um número inteiro.",
    "int_from_float": "Deve ser um número inteiro.",
    "float_parsing": "Deve ser um número.",
    "decimal_parsing": "Deve ser um número.",
    "greater_than": "Deve ser maior que {gt}.",
    "greater_than_equal": "Deve ser maior ou igual a {ge}.",
    "less_than": "Deve ser menor que {lt}.",
    "less_than_equal": "Deve ser menor ou igual a {le}.",
    "enum": "Valor inválido. Opções aceitas: {expected}.",
    "bool_parsing": "Deve ser verdadeiro ou falso.",
    "date_parsing": "Data inválida.",
    "date_from_datetime_parsing": "Data inválida.",
    "time_parsing": "Horário inválido.",
    "json_invalid": "JSON inválido.",
    "model_attributes_type": "Formato do corpo da requisição inválido.",
    "dict_type": "Formato do corpo da requisição inválido.",
    "extra_forbidden": "Campo não permitido.",
}


def traduzir_erro_validacao(erro: dict) -> str:
    """Converte um erro do Pydantic em mensagem legível em português."""
    if erro["type"] == "value_error":
        # Mensagem levantada pelos nossos validadores (já em português).
        return str(erro.get("ctx", {}).get("error", erro["msg"]))
    modelo = MENSAGENS_VALIDACAO.get(erro["type"])
    if modelo is None:
        return "Valor inválido."
    contexto = dict(erro.get("ctx", {}))
    if "expected" in contexto:
        contexto["expected"] = str(contexto["expected"]).replace(" or ", " ou ")
    try:
        return modelo.format(**contexto)
    except (KeyError, IndexError):
        return modelo


def _nome_campo(local: tuple) -> str:
    # Remove a origem ("body", "query", "path") e mantém o caminho do campo.
    partes = [str(p) for p in local if p not in ("body", "query", "path", "header")]
    return ".".join(partes) or "corpo"


def registrar_tratadores_erro(app: FastAPI) -> None:
    """Registra no app os tratadores que padronizam as respostas de erro."""

    @app.exception_handler(ErroNegocio)
    async def tratar_erro_negocio(_: Request, erro: ErroNegocio) -> JSONResponse:
        return JSONResponse(status_code=erro.codigo_http, content={"mensagem": erro.mensagem})

    @app.exception_handler(RequestValidationError)
    async def tratar_validacao(_: Request, erro: RequestValidationError) -> JSONResponse:
        erros = [
            {"campo": _nome_campo(tuple(e["loc"])), "mensagem": traduzir_erro_validacao(e)}
            for e in erro.errors()
        ]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"mensagem": "Dados inválidos.", "erros": erros},
        )

    @app.exception_handler(IntegrityError)
    async def tratar_integridade(_: Request, erro: IntegrityError) -> JSONResponse:
        # Rede de segurança: os services validam antes, mas o banco tem a palavra final.
        restricao = nome_restricao(erro)
        mensagem = MENSAGENS_RESTRICOES.get(
            restricao or "", "Operação recusada pelas regras do banco de dados."
        )
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"mensagem": mensagem})

    @app.exception_handler(OperationalError)
    async def tratar_banco_indisponivel(_: Request, __: OperationalError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"mensagem": "Banco de dados indisponível. Tente novamente mais tarde."},
        )
