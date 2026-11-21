"""Rotinas do banco (docs/univan-sqlite-rotinas.sql) prontas para o backend executar.

O SQLite não tem funções armazenadas: cada rotina é um bloco de comandos com parâmetros
nomeados. Este módulo lê o arquivo uma vez e separa os comandos de cada rotina, para que o SQL
exista num lugar só (o mesmo que a documentação do banco descreve).
"""

import re
from functools import cache

from app.config.configuracoes import RAIZ_PROJETO

SCRIPT_ROTINAS = RAIZ_PROJETO / "docs" / "univan-sqlite-rotinas.sql"

# Cabeçalho de cada rotina no arquivo: "-- gerar_dia(:data)".
_CABECALHO = re.compile(r"^-- (\w+)\(.*\)\s*$", re.MULTILINE)


@cache
def comandos_da_rotina(nome: str) -> tuple[str, ...]:
    """Comandos SQL da rotina, na ordem em que devem rodar (ex.: 'gerar_dia' → 2 comandos)."""
    texto = SCRIPT_ROTINAS.read_text(encoding="utf-8")
    cabecalhos = list(_CABECALHO.finditer(texto))
    for indice, cabecalho in enumerate(cabecalhos):
        if cabecalho.group(1) != nome:
            continue
        fim = cabecalhos[indice + 1].start() if indice + 1 < len(cabecalhos) else len(texto)
        # Tira os comentários antes de separar por ";" (há ";" dentro de comentários).
        sql = "\n".join(
            linha for linha in texto[cabecalho.end():fim].splitlines() if not linha.lstrip().startswith("--")
        )
        return tuple(comando.strip() for comando in sql.split(";") if comando.strip())
    raise KeyError(f"Rotina {nome!r} não encontrada em {SCRIPT_ROTINAS.name}.")
