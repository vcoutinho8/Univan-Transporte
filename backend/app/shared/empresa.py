"""Separação por empresa (tenant): cada gestor só enxerga e altera os dados da própria empresa.

Os modelos marcados com `DaEmpresa` ganham a coluna `fk_empresa`. Quando a sessão sabe a empresa de
quem está logado (`sessao.info["empresa"]`, gravada em `usuario_logado`), toda consulta, alteração
e exclusão pelo ORM filtra por ela, e todo registro novo nasce nela. Sem empresa na sessão (login,
gerente UniVan, rotinas internas) nada é filtrado.
"""

from sqlalchemy import ForeignKey, event, or_
from sqlalchemy.orm import Mapped, ORMExecuteState, Session, mapped_column, with_loader_criteria

CHAVE = "empresa"


class DaEmpresa:
    """Registro de uma empresa só."""

    fk_empresa: Mapped[int | None] = mapped_column(ForeignKey("empresa.id"))


class DaEmpresaOuGeral:
    """Registro de uma empresa, ou de todas quando `fk_empresa` é NULL (ex.: feriado nacional)."""

    fk_empresa: Mapped[int | None] = mapped_column(ForeignKey("empresa.id"))


@event.listens_for(Session, "do_orm_execute")
def _so_da_empresa(estado: ORMExecuteState) -> None:
    empresa = estado.session.info.get(CHAVE)
    if empresa is None or not (estado.is_select or estado.is_update or estado.is_delete):
        return
    estado.statement = estado.statement.options(
        with_loader_criteria(DaEmpresa, lambda c: c.fk_empresa == empresa, include_aliases=True),
        with_loader_criteria(DaEmpresaOuGeral, lambda c: or_(c.fk_empresa == empresa, c.fk_empresa.is_(None)), include_aliases=True),
    )


@event.listens_for(Session, "before_flush")
def _nasce_na_empresa(sessao: Session, _contexto, _instancias) -> None:
    empresa = sessao.info.get(CHAVE)
    if empresa is None:
        return
    for objeto in sessao.new:
        if isinstance(objeto, DaEmpresa | DaEmpresaOuGeral) and objeto.fk_empresa is None:
            objeto.fk_empresa = empresa
