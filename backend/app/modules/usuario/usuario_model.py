"""Tabela `usuario`: quem entra no sistema e com qual perfil."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base import Base, enum_do_banco
from app.shared.enums import PerfilUsuario, StatusCadastro

if TYPE_CHECKING:
    from app.modules.motorista.motorista_model import Motorista


class Usuario(Base):
    """Usuário do sistema. Perfil motorista exige `fk_motorista` (as próprias viagens)."""

    __tablename__ = "usuario"

    id: Mapped[int] = mapped_column(primary_key=True)
    fk_empresa: Mapped[int] = mapped_column(ForeignKey("empresa.id"))
    nome: Mapped[str] = mapped_column(String(100))
    # Nome de usuário para entrar (ex.: admin): minúsculas, números, ponto, hífen ou sublinhado.
    login: Mapped[str] = mapped_column(String(30), unique=True)
    senha_hash: Mapped[str] = mapped_column(String(200))
    perfil: Mapped[PerfilUsuario] = mapped_column(enum_do_banco(PerfilUsuario))
    fk_motorista: Mapped[int | None] = mapped_column(ForeignKey("motorista.id"), unique=True)
    status: Mapped[StatusCadastro] = mapped_column(
        enum_do_banco(StatusCadastro), default=StatusCadastro.ATIVO, server_default=StatusCadastro.ATIVO.value
    )
    ultimo_acesso: Mapped[datetime | None]
    email: Mapped[str | None] = mapped_column(String(120))
    # CPF de admin e auxiliar (o do motorista fica no cadastro de motorista).
    cpf: Mapped[str | None] = mapped_column(String(11))
    # Senha padrão (123456) definida pelo admin: no próximo login a pessoa cria a dela.
    trocar_senha: Mapped[bool] = mapped_column(default=False, server_default="0")

    motorista: Mapped["Motorista | None"] = relationship()
