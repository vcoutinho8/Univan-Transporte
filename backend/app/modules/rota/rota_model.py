"""Tabelas `rota` e `rota_dia`: o trajeto fixo e os dias da semana em que roda."""

from datetime import time
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, SmallInteger, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base import Base, enum_do_banco
from app.shared.enums import StatusCadastro, Turno

if TYPE_CHECKING:
    from app.modules.instituicao.instituicao_model import Instituicao
    from app.modules.motorista.motorista_model import Motorista


class Rota(Base):
    """Um motorista levando estudantes a uma instituição num turno.

    Os estudantes da rota não são cadastrados à mão: são os estudantes ativos das
    áreas do motorista, da mesma instituição e do mesmo turno (ver `gerar_dia`).
    """

    __tablename__ = "rota"
    __table_args__ = (UniqueConstraint("fk_motorista", "fk_instituicao", "turno"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(100))
    fk_motorista: Mapped[int] = mapped_column(ForeignKey("motorista.id"))
    fk_instituicao: Mapped[int] = mapped_column(ForeignKey("instituicao.id"))
    turno: Mapped[Turno] = mapped_column(enum_do_banco(Turno))
    horario_ida: Mapped[time | None]
    horario_volta: Mapped[time | None]
    status: Mapped[StatusCadastro] = mapped_column(
        enum_do_banco(StatusCadastro),
        default=StatusCadastro.ATIVO,
        server_default=StatusCadastro.ATIVO.value,
    )

    motorista: Mapped["Motorista"] = relationship()
    instituicao: Mapped["Instituicao"] = relationship()
    dias: Mapped[list["RotaDia"]] = relationship(back_populates="rota")


class RotaDia(Base):
    """Dia da semana em que a rota roda (ISO: 1 = segunda ... 7 = domingo)."""

    __tablename__ = "rota_dia"

    fk_rota: Mapped[int] = mapped_column(
        ForeignKey("rota.id", ondelete="CASCADE"), primary_key=True
    )
    dia_semana: Mapped[int] = mapped_column(SmallInteger, primary_key=True)

    rota: Mapped[Rota] = relationship(back_populates="dias")
