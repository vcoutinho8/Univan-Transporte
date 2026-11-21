"""Tabela `instituicao`: a faculdade de destino."""

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Numeric, String
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
    # Onde a van para, na rua. Vazio = usa a localização do endereço (que pode cair dentro do campus).
    parada_latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    parada_longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))

    endereco: Mapped["Endereco"] = relationship()
