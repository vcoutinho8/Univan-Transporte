"""Tabela `titulo_pagar`: salários dos motoristas e despesas da operação."""

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base import Base, enum_do_banco
from app.shared.enums import CategoriaTituloPagar, StatusTitulo

if TYPE_CHECKING:
    from app.modules.empresa.empresa_model import Empresa
    from app.modules.motorista.motorista_model import Motorista
    from app.modules.veiculo.veiculo_model import Veiculo


class TituloPagar(Base):
    """Conta a pagar. Salário exige motorista; só um salário por motorista por mês."""

    __tablename__ = "titulo_pagar"

    id: Mapped[int] = mapped_column(primary_key=True)
    fk_empresa: Mapped[int] = mapped_column(ForeignKey("empresa.id"))
    categoria: Mapped[CategoriaTituloPagar] = mapped_column(
        enum_do_banco(CategoriaTituloPagar)
    )
    fk_motorista: Mapped[int | None] = mapped_column(ForeignKey("motorista.id"))
    fk_veiculo: Mapped[int | None] = mapped_column(ForeignKey("veiculo.id"))
    favorecido: Mapped[str | None] = mapped_column(String(100))
    descricao: Mapped[str] = mapped_column(String(150))
    competencia: Mapped[date | None]
    valor: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    data_vencimento: Mapped[date]
    data_pagamento: Mapped[date | None]
    valor_pago: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    status: Mapped[StatusTitulo] = mapped_column(
        enum_do_banco(StatusTitulo),
        default=StatusTitulo.ABERTO,
        server_default=StatusTitulo.ABERTO.value,
    )

    empresa: Mapped["Empresa"] = relationship()
    motorista: Mapped["Motorista | None"] = relationship()
    veiculo: Mapped["Veiculo | None"] = relationship()
