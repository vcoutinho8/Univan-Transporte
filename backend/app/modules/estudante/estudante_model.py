"""Tabela `estudante`: o cliente."""

from datetime import time
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base import Base, enum_do_banco
from app.shared.enums import StatusCadastro, Turno

if TYPE_CHECKING:
    from app.modules.area.area_model import Area
    from app.modules.endereco.endereco_model import Endereco
    from app.modules.instituicao.instituicao_model import Instituicao


class Estudante(Base):
    """Aluno universitário (maior de idade, paga a própria mensalidade).

    `fk_area` é preenchido pelo trigger `tg_estudante_area` do banco a partir da
    latitude/longitude do endereço; a aplicação não deve calculá-lo.
    """

    __tablename__ = "estudante"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(100))
    apelido: Mapped[str | None] = mapped_column(String(30))
    cpf: Mapped[str] = mapped_column(String(11), unique=True)
    celular: Mapped[str] = mapped_column(String(15))
    email: Mapped[str | None] = mapped_column(String(100))
    fk_instituicao: Mapped[int] = mapped_column(ForeignKey("instituicao.id"))
    curso: Mapped[str | None] = mapped_column(String(50))
    turno: Mapped[Turno] = mapped_column(enum_do_banco(Turno))
    fk_endereco: Mapped[int] = mapped_column(ForeignKey("endereco.id"))
    fk_area: Mapped[int | None] = mapped_column(ForeignKey("area.id"), index=True)
    horario_embarque: Mapped[time | None]
    valor_mensal: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    dia_vencimento: Mapped[int] = mapped_column(Integer)
    status: Mapped[StatusCadastro] = mapped_column(
        enum_do_banco(StatusCadastro),
        default=StatusCadastro.ATIVO,
        server_default=StatusCadastro.ATIVO.value,
    )

    instituicao: Mapped["Instituicao"] = relationship()
    endereco: Mapped["Endereco"] = relationship()
    area: Mapped["Area | None"] = relationship()
