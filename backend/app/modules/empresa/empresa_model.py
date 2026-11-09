"""Tabela `empresa`: a transportadora."""

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base import Base

if TYPE_CHECKING:
    from app.modules.endereco.endereco_model import Endereco


class Empresa(Base):
    """Transportadora dona das vans, da equipe e das despesas."""

    __tablename__ = "empresa"

    id: Mapped[int] = mapped_column(primary_key=True)
    razao_social: Mapped[str] = mapped_column(String(100))
    nome_fantasia: Mapped[str | None] = mapped_column(String(100))
    cnpj: Mapped[str] = mapped_column(String(14), unique=True)
    telefone: Mapped[str | None] = mapped_column(String(15))
    fk_endereco: Mapped[int | None] = mapped_column(ForeignKey("endereco.id"))

    endereco: Mapped["Endereco | None"] = relationship()
