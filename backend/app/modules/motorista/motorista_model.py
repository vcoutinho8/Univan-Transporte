"""Tabela `motorista`: quem dirige."""

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base import Base, enum_do_banco
from app.shared.enums import StatusCadastro

if TYPE_CHECKING:
    from app.modules.empresa.empresa_model import Empresa
    from app.modules.veiculo.veiculo_model import Veiculo


class Motorista(Base):
    """Motorista. Também é a base para gerar o salário mensal (titulo_pagar)."""

    __tablename__ = "motorista"

    id: Mapped[int] = mapped_column(primary_key=True)
    fk_empresa: Mapped[int] = mapped_column(ForeignKey("empresa.id"))
    fk_veiculo: Mapped[int | None] = mapped_column(ForeignKey("veiculo.id"))
    nome: Mapped[str] = mapped_column(String(100))
    cpf: Mapped[str] = mapped_column(String(11), unique=True)
    celular: Mapped[str | None] = mapped_column(String(15))
    cnh: Mapped[str] = mapped_column(String(11), unique=True)
    cnh_validade: Mapped[date]
    salario: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    dia_pagamento: Mapped[int | None] = mapped_column(Integer, default=5, server_default="5")
    status: Mapped[StatusCadastro] = mapped_column(
        enum_do_banco(StatusCadastro),
        default=StatusCadastro.ATIVO,
        server_default=StatusCadastro.ATIVO.value,
    )

    empresa: Mapped["Empresa"] = relationship()
    veiculo: Mapped["Veiculo | None"] = relationship()
