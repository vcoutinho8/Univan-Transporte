"""Tabela `viagem`: cada ida ou volta de uma rota num dia."""

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base import Base, enum_do_banco
from app.shared.enums import Sentido, StatusViagem

if TYPE_CHECKING:
    from app.modules.chamada.chamada_model import Chamada
    from app.modules.motorista.motorista_model import Motorista
    from app.modules.rota.rota_model import Rota
    from app.modules.veiculo.veiculo_model import Veiculo


class Viagem(Base):
    """Gerada pela função `gerar_dia` do banco.

    Motorista e veículo ficam também aqui para registrar substituições do dia
    sem alterar os cadastros.
    """

    __tablename__ = "viagem"
    __table_args__ = (UniqueConstraint("fk_rota", "data", "sentido"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    fk_rota: Mapped[int] = mapped_column(ForeignKey("rota.id"))
    fk_veiculo: Mapped[int] = mapped_column(ForeignKey("veiculo.id"))
    fk_motorista: Mapped[int] = mapped_column(ForeignKey("motorista.id"))
    data: Mapped[date] = mapped_column(index=True)
    sentido: Mapped[Sentido] = mapped_column(enum_do_banco(Sentido))
    horario_saida: Mapped[datetime | None]
    horario_chegada: Mapped[datetime | None]
    status: Mapped[StatusViagem] = mapped_column(
        enum_do_banco(StatusViagem),
        default=StatusViagem.AGENDADA,
        server_default=StatusViagem.AGENDADA.value,
    )

    rota: Mapped["Rota"] = relationship()
    veiculo: Mapped["Veiculo"] = relationship()
    motorista: Mapped["Motorista"] = relationship()
    chamadas: Mapped[list["Chamada"]] = relationship(back_populates="viagem")
