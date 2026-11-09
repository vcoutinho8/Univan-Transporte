"""Tabela `chamada`: a lista de estudantes de cada viagem (a "planilha" do motorista)."""

from datetime import datetime, time
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base import Base, enum_do_banco
from app.shared.enums import StatusChamada

if TYPE_CHECKING:
    from app.modules.estudante.estudante_model import Estudante
    from app.modules.viagem.viagem_model import Viagem


class Chamada(Base):
    """Um estudante em uma viagem. PK composta: viagem + estudante."""

    __tablename__ = "chamada"

    fk_viagem: Mapped[int] = mapped_column(
        ForeignKey("viagem.id", ondelete="CASCADE"), primary_key=True
    )
    fk_estudante: Mapped[int] = mapped_column(
        ForeignKey("estudante.id"), primary_key=True, index=True
    )
    status: Mapped[StatusChamada] = mapped_column(
        enum_do_banco(StatusChamada),
        default=StatusChamada.PENDENTE,
        server_default=StatusChamada.PENDENTE.value,
    )
    horario_previsto: Mapped[time | None]
    horario_aviso: Mapped[datetime | None]
    horario_embarque: Mapped[datetime | None]

    viagem: Mapped["Viagem"] = relationship(back_populates="chamadas")
    estudante: Mapped["Estudante"] = relationship()
