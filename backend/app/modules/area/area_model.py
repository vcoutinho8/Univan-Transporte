"""Tabela `area`: divisão da cidade em regiões desenhadas no mapa."""

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base import Base, enum_do_banco
from app.shared.enums import StatusCadastro

if TYPE_CHECKING:
    from app.modules.motorista.motorista_model import Motorista


class Area(Base):
    """Bairro/região no mapa. Define quais estudantes cada motorista busca."""

    __tablename__ = "area"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(100))
    coordenadas: Mapped[str] = mapped_column(Text)
    fk_motorista: Mapped[int | None] = mapped_column(ForeignKey("motorista.id"), index=True)
    status: Mapped[StatusCadastro] = mapped_column(
        enum_do_banco(StatusCadastro),
        default=StatusCadastro.ATIVO,
        server_default=StatusCadastro.ATIVO.value,
    )

    motorista: Mapped["Motorista | None"] = relationship()
