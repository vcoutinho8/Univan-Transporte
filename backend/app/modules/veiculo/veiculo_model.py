"""Tabela `veiculo`: vans e micro-ônibus da frota."""

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base import Base, enum_do_banco
from app.shared.enums import StatusCadastro

if TYPE_CHECKING:
    from app.modules.empresa.empresa_model import Empresa


class Veiculo(Base):
    """Veículo da frota. Veículo vendido ou parado fica inativo, sem perder o histórico."""

    __tablename__ = "veiculo"

    id: Mapped[int] = mapped_column(primary_key=True)
    fk_empresa: Mapped[int] = mapped_column(ForeignKey("empresa.id"))
    placa: Mapped[str] = mapped_column(String(7), unique=True)
    modelo: Mapped[str] = mapped_column(String(50))
    cor: Mapped[str | None] = mapped_column(String(30))
    capacidade: Mapped[int] = mapped_column(Integer)
    status: Mapped[StatusCadastro] = mapped_column(
        enum_do_banco(StatusCadastro),
        default=StatusCadastro.ATIVO,
        server_default=StatusCadastro.ATIVO.value,
    )

    empresa: Mapped["Empresa"] = relationship()
