"""Tabela `endereco`: endereços de empresas, instituições e estudantes."""

from decimal import Decimal

from sqlalchemy import CHAR, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base import Base


class Endereco(Base):
    """Endereços ficam numa tabela só e são reaproveitados.

    A latitude/longitude é usada pelo banco para descobrir a área do estudante.
    """

    __tablename__ = "endereco"

    id: Mapped[int] = mapped_column(primary_key=True)
    cep: Mapped[str] = mapped_column(String(8))
    logradouro: Mapped[str] = mapped_column(String(100))
    numero: Mapped[str | None] = mapped_column(String(10))
    complemento: Mapped[str | None] = mapped_column(String(60))
    bairro: Mapped[str] = mapped_column(String(50))
    cidade: Mapped[str] = mapped_column(String(50))
    estado: Mapped[str] = mapped_column(CHAR(2))
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
