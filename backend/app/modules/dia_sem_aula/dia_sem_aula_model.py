"""Tabela `dia_sem_aula`: feriados, recessos e férias."""

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base import Base

if TYPE_CHECKING:
    from app.modules.instituicao.instituicao_model import Instituicao


class DiaSemAula(Base):
    """Dia sem aula. Sem instituição = vale para todas (feriado nacional).

    No banco há UNIQUE NULLS NOT DISTINCT (data, fk_instituicao).
    """

    __tablename__ = "dia_sem_aula"

    id: Mapped[int] = mapped_column(primary_key=True)
    data: Mapped[date]
    fk_instituicao: Mapped[int | None] = mapped_column(ForeignKey("instituicao.id"))
    motivo: Mapped[str] = mapped_column(String(100))

    instituicao: Mapped["Instituicao | None"] = relationship()
