"""Documentação da API (Swagger em /api/docs e ReDoc em /api/redoc).

Tudo que aparece no Swagger além das rotas fica aqui: a descrição geral, os grupos (tags) com
explicação, o formato padrão de erro e as respostas de erro de cada rota. Os controllers só
dizem quais erros podem acontecer, por exemplo: `responses=erros(404, 409)`.
"""

from typing import Any

from pydantic import BaseModel, Field

DESCRICAO = """
API do **UniVan**, sistema de gestão de transporte universitário: passageiros, veículos,
bairros (áreas atendidas por cada motorista), rotas, viagens do dia, relatórios e o painel da
operação.

## Como usar esta página
Abra um grupo, escolha uma rota e clique em **Try it out** para chamar a API de verdade
(com o banco de desenvolvimento). Os campos já vêm com um exemplo preenchido.

## Convenções
- **Nada é apagado.** `DELETE` só **inativa** o registro (`status: "inativo"`); para reativar,
  envie `PATCH` com `{"status": "ativo"}`. O histórico é sempre mantido.
- **`PATCH` altera só o que vier no corpo.** Campo obrigatório não pode ser enviado como `null`.
- **Campos desconhecidos são recusados** (422), para erros de digitação não passarem calados.
- **Documentos sem máscara.** CPF, CEP, celular e placa podem chegar com pontuação
  (`111.222.333-01`, `qja-1b23`); a API guarda e devolve só letras e números.
- **Datas e horários:** `AAAA-MM-DD` e `HH:MM` (ou `HH:MM:SS`). Coordenadas em graus decimais.
- **Empresa da sessão.** Os cadastros entram na empresa de quem usa o sistema; enquanto o login
  não existe, ela vem da variável `EMPRESA_ATUAL_ID`.

## Erros
Todo erro devolve uma `mensagem` em português, pronta para mostrar na tela. Erros de
validação (422) trazem também a lista `erros`, com o campo e o problema de cada um.

| Código | Quando |
|---|---|
| 404 | O registro pedido não existe |
| 409 | Conflito com dados já gravados (placa/CPF repetido, registro já inativo...) |
| 422 | Dados inválidos ou regra de negócio recusou (empresa/instituição inexistente...) |
| 503 | Banco de dados indisponível |
| 500 | Falha inesperada (o detalhe fica só no log do servidor) |
"""

# Ordem e explicação dos grupos no Swagger (o nome é o mesmo usado em `tags=` dos roteadores).
TAGS: list[dict[str, str]] = [
    {"name": "Painel", "description": "Números da tela inicial: totais ativos e viagens do dia."},
    {
        "name": "Passageiros",
        "description": "Estudantes atendidos (tabela `estudante`), com o endereço junto. A **área** "
        "de cada passageiro é definida pelo banco a partir da latitude/longitude da casa.",
    },
    {
        "name": "Veículos",
        "description": "Vans, micro-ônibus e ônibus da frota. Cadastrados na empresa da sessão.",
    },
    {
        "name": "Áreas",
        "description": "Bairros desenhados no mapa e o motorista responsável por cada um. Salvar, "
        "redesenhar ou inativar uma área redistribui todos os passageiros.",
    },
    {
        "name": "Rotas",
        "description": "Trajetos fixos: motorista + faculdade + turno, horários e dias da semana. "
        "Os passageiros de cada rota seguem a mesma regra da geração das viagens do dia.",
    },
    {
        "name": "Viagens",
        "description": "Cada ida ou volta de uma rota num dia. **Gerar** cria as viagens e a lista de "
        "passageiros (chamada) do dia, respeitando os dias da rota e os feriados. Depois: iniciar, "
        "concluir (quem ficou pendente vira ausente), cancelar ou trocar motorista/veículo só naquele dia.",
    },
    {
        "name": "Relatórios",
        "description": "Consultas de acompanhamento, só leitura: passageiros ativos por instituição, "
        "turno, bairro e rota.",
    },
    {"name": "Motoristas", "description": "Consulta dos motoristas (o cadastro ainda não existe)."},
    {"name": "Instituições", "description": "Faculdades de destino, com endereço e coordenadas."},
    {"name": "Empresas", "description": "Transportadoras cadastradas."},
    {"name": "Saúde", "description": "Verificação para monitoramento: a API e o banco estão no ar?"},
]

# Swagger mais confortável: grupos fechados, busca por rota, tempo de cada chamada e
# "Try it out" já aberto.
PARAMETROS_SWAGGER: dict[str, Any] = {
    "docExpansion": "none",
    "filter": True,
    "displayRequestDuration": True,
    "tryItOutEnabled": True,
    "defaultModelsExpandDepth": 0,
    "persistAuthorization": True,
}


class ErroDeCampo(BaseModel):
    campo: str = Field(examples=["placa"], description="Caminho do campo (`endereco.cep` em objetos aninhados).")
    mensagem: str = Field(examples=["Placa inválida. Use o formato ABC1234 ou ABC1D23."])


class RespostaErro(BaseModel):
    """Formato de todos os erros da API (ver app/config/erros.py)."""

    mensagem: str = Field(description="Texto em português, pronto para mostrar ao usuário.")
    erros: list[ErroDeCampo] | None = Field(default=None, description="Só nos erros de validação (422).")


_EXEMPLOS: dict[int, tuple[str, dict[str, Any]]] = {
    404: ("Registro não encontrado.", {"mensagem": "Passageiro não encontrado."}),
    409: ("Conflito com dados já gravados.", {"mensagem": "Já existe um veículo com esta placa."}),
    422: (
        "Dados inválidos ou recusados pela regra de negócio.",
        {
            "mensagem": "Dados inválidos.",
            "erros": [
                {"campo": "cpf", "mensagem": "CPF inválido. Informe os 11 números."},
                {"campo": "endereco.cep", "mensagem": "CEP inválido. Informe os 8 números."},
            ],
        },
    ),
    500: ("Falha inesperada no servidor.", {"mensagem": "Erro inesperado no servidor. Tente novamente em instantes."}),
    503: ("Banco de dados indisponível.", {"mensagem": "Banco de dados indisponível. Tente novamente mais tarde."}),
}


def erros(*codigos: int) -> dict[int | str, dict[str, Any]]:
    """Respostas de erro para o `responses=` de uma rota, no formato padrão RespostaErro."""
    return {
        codigo: {
            "model": RespostaErro,
            "description": _EXEMPLOS[codigo][0],
            "content": {"application/json": {"example": _EXEMPLOS[codigo][1]}},
        }
        for codigo in codigos
    }


# Valem para todas as rotas: entrada inválida (422), falha inesperada (500) e banco fora do ar (503).
ERROS_COMUNS = erros(422, 500, 503)
