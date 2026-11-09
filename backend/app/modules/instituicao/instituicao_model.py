"""Tabela `instituicao`: a faculdade de destino."""

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base import Base

if TYPE_CHECKING:
    from app.modules.endereco.endereco_model import Endereco


class Instituicao(Base):
    """Faculdade de destino dos estudantes e das rotas."""

    __tablename__ = "instituicao"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(100))
    fk_endereco: Mapped[int] = mapped_column(ForeignKey("endereco.id"))

    endereco: Mapped["Endereco"] = relationship()
