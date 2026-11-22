"""Tabela `dia_sem_aula`: feriados, recessos e férias."""

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.empresa import DaEmpresaOuGeral
from app.shared.base import Base

if TYPE_CHECKING:
    from app.modules.instituicao.instituicao_model import Instituicao


class DiaSemAula(DaEmpresaOuGeral, Base):
    """Dia sem aula. Sem instituição = vale para todas (feriado nacional).

    No banco há UNIQUE NULLS NOT DISTINCT (data, fk_instituicao).
    """

    __tablename__ = "dia_sem_aula"

    id: Mapped[int] = mapped_column(primary_key=True)
    data: Mapped[date]
    fk_instituicao: Mapped[int | None] = mapped_column(ForeignKey("instituicao.id"))
    motivo: Mapped[str] = mapped_column(String(100))

    instituicao: Mapped["Instituicao | None"] = relationship()


class FeriadoImportado(Base):
    """Ano cujos feriados nacionais já foram importados (uma vez só: cancelar um feriado é definitivo)."""

    __tablename__ = "feriado_importado"

    ano: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    fonte: Mapped[str] = mapped_column(String(20))
    importado_em: Mapped[datetime]
