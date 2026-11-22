"""Tabela `empresa`: a transportadora."""

from typing import TYPE_CHECKING

from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base import Base, enum_do_banco
from app.shared.enums import StatusEmpresa

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
    # Assinatura do app (o gerente UniVan cuida).
    responsavel: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[StatusEmpresa] = mapped_column(
        enum_do_banco(StatusEmpresa), default=StatusEmpresa.ATIVA, server_default=StatusEmpresa.ATIVA.value
    )
    valor_assinatura: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("199.90"), server_default="199.90")
    motivo_inativacao: Mapped[str | None] = mapped_column(String(200))

    endereco: Mapped["Endereco | None"] = relationship()
