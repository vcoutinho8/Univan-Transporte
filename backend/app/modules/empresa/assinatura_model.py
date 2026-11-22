"""Tabela `assinatura_pagamento`: a mensalidade do app de cada empresa (gestor)."""

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base import Base, enum_do_banco
from app.shared.enums import StatusTitulo

if TYPE_CHECKING:
    from app.modules.empresa.empresa_model import Empresa


class AssinaturaPagamento(Base):
    """Mensalidade do app. Em aberto depois do vencimento: a empresa entra em negociação."""

    __tablename__ = "assinatura_pagamento"

    id: Mapped[int] = mapped_column(primary_key=True)
    fk_empresa: Mapped[int] = mapped_column(ForeignKey("empresa.id"))
    competencia: Mapped[date]
    valor: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    data_vencimento: Mapped[date]
    data_pagamento: Mapped[date | None]
    status: Mapped[StatusTitulo] = mapped_column(
        enum_do_banco(StatusTitulo), default=StatusTitulo.ABERTO, server_default=StatusTitulo.ABERTO.value
    )

    empresa: Mapped["Empresa"] = relationship()
