"""Tabela `instituicao`: a faculdade de destino."""

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.empresa import DaEmpresa
from app.shared.base import Base

if TYPE_CHECKING:
    from app.modules.endereco.endereco_model import Endereco


class Instituicao(DaEmpresa, Base):
    """Faculdade de destino dos estudantes e das rotas."""

    __tablename__ = "instituicao"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(100))
    fk_endereco: Mapped[int] = mapped_column(ForeignKey("endereco.id"))
    # Onde a van para, na rua. Vazio = usa a localização do endereço (que pode cair dentro do campus).
    parada_latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    parada_longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    # Código da IES no e-MEC/INEP: a mesma faculdade não entra duas vezes.
    codigo_inep: Mapped[int | None]

    endereco: Mapped["Endereco"] = relationship()
    paradas: Mapped[list["InstituicaoParada"]] = relationship(
        back_populates="instituicao", cascade="all, delete-orphan", order_by="InstituicaoParada.nome"
    )


class InstituicaoParada(Base):
    """Parada extra da faculdade (ex.: UVV: Biopráticas). A principal é a da própria instituição."""

    __tablename__ = "instituicao_parada"
    __table_args__ = (UniqueConstraint("fk_instituicao", "nome", name="instituicao_parada_nome_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    fk_instituicao: Mapped[int] = mapped_column(ForeignKey("instituicao.id", ondelete="CASCADE"))
    nome: Mapped[str] = mapped_column(String(60))
    latitude: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal] = mapped_column(Numeric(9, 6))

    instituicao: Mapped["Instituicao"] = relationship(back_populates="paradas")
