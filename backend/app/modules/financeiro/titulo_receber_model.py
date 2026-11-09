"""Tabela `titulo_receber`: mensalidades dos estudantes.

"Atrasado" não é status gravado: é título `aberto` com vencimento anterior a hoje.
"""

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base import Base, enum_do_banco
from app.shared.enums import StatusTitulo

if TYPE_CHECKING:
    from app.modules.estudante.estudante_model import Estudante


class TituloReceber(Base):
    """Mensalidade. Uma por estudante por competência (sempre dia 01 do mês)."""

    __tablename__ = "titulo_receber"
    __table_args__ = (UniqueConstraint("fk_estudante", "competencia"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    fk_estudante: Mapped[int] = mapped_column(ForeignKey("estudante.id"))
    competencia: Mapped[date]
    valor: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    data_vencimento: Mapped[date]
    data_recebimento: Mapped[date | None]
    valor_recebido: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    status: Mapped[StatusTitulo] = mapped_column(
        enum_do_banco(StatusTitulo),
        default=StatusTitulo.ABERTO,
        server_default=StatusTitulo.ABERTO.value,
    )

    estudante: Mapped["Estudante"] = relationship()
