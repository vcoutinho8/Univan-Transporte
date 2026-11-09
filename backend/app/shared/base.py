"""Base declarativa e tipos auxiliares compartilhados pelos models."""

import enum
from datetime import datetime, time

from sqlalchemy import Enum
from sqlalchemy.dialects import sqlite
from sqlalchemy.orm import DeclarativeBase

# No SQLite, data e hora são texto. Por padrão o SQLAlchemy grava os microssegundos
# ('06:30:00.000000'); aqui o formato fica igual ao dos dados de docs/univan-sqlite.sql
# ('06:30:00' e '2026-11-10 06:30:00'), que é o que as rotinas e as views esperam.
HORARIO = sqlite.TIME(storage_format="%(hour)02d:%(minute)02d:%(second)02d")
DATA_HORA = sqlite.DATETIME(
    storage_format="%(year)04d-%(month)02d-%(day)02d %(hour)02d:%(minute)02d:%(second)02d"
)


class Base(DeclarativeBase):
    """Base de todos os models. As tabelas já existem no banco (docs/univan-sqlite.sql)."""

    type_annotation_map = {time: HORARIO, datetime: DATA_HORA}


def enum_do_banco(classe_enum: type[enum.Enum]) -> Enum:
    """Mapeia um enum Python para uma coluna de texto do banco.

    No SQLite a coluna é TEXT com CHECK (coluna IN (...)), que já existe no script do banco;
    por isso `create_constraint=False`. `values_callable` grava o valor ('ativo') em vez do
    nome do membro ('ATIVO').
    """
    return Enum(
        classe_enum,
        native_enum=False,
        create_constraint=False,
        values_callable=lambda membros: [m.value for m in membros],
    )
