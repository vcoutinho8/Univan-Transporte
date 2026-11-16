"""Acesso a dados das tabelas `rota` e `rota_dia`."""

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.modules.area.area_model import Area
from app.modules.estudante.estudante_model import Estudante
from app.modules.rota.rota_model import Rota
from app.shared.enums import StatusCadastro

_RELACOES = (joinedload(Rota.motorista), joinedload(Rota.instituicao), selectinload(Rota.dias))


def _passageiros_da_rota() -> Select:
    """Regra de quem a rota leva, a mesma da rotina gerar_dia (docs/univan-sqlite-rotinas.sql):
    passageiros ativos que moram numa área ativa do motorista da rota, da mesma instituição e
    do mesmo turno. Devolve pares (id da rota, estudante)."""
    return (
        select(Rota.id, Estudante)
        .join(Area, (Area.fk_motorista == Rota.fk_motorista) & (Area.status == StatusCadastro.ATIVO))
        .join(
            Estudante,
            (Estudante.fk_area == Area.id)
            & (Estudante.fk_instituicao == Rota.fk_instituicao)
            & (Estudante.turno == Rota.turno)
            & (Estudante.status == StatusCadastro.ATIVO),
        )
    )


class RepositorioRota:
    def __init__(self, sessao: Session):
        self.sessao = sessao

    def listar(
        self, status: StatusCadastro | None = None, fk_motorista: int | None = None
    ) -> list[Rota]:
        consulta = select(Rota).options(*_RELACOES).order_by(Rota.nome)
        if status is not None:
            consulta = consulta.where(Rota.status == status)
        if fk_motorista is not None:
            consulta = consulta.where(Rota.fk_motorista == fk_motorista)
        return list(self.sessao.scalars(consulta).unique())

    def buscar_por_id(self, id_rota: int) -> Rota | None:
        return self.sessao.get(Rota, id_rota, options=_RELACOES, populate_existing=True)

    def buscar_por_combinacao(self, fk_motorista: int, fk_instituicao: int, turno) -> Rota | None:
        return self.sessao.scalar(
            select(Rota).where(
                Rota.fk_motorista == fk_motorista, Rota.fk_instituicao == fk_instituicao, Rota.turno == turno
            )
        )

    def contar_passageiros(self) -> dict[int, int]:
        sub = _passageiros_da_rota().subquery()
        linhas = self.sessao.execute(select(sub.c.id, func.count()).group_by(sub.c.id))
        return dict(linhas.all())

    def passageiros(self, id_rota: int) -> list[Estudante]:
        consulta = (
            _passageiros_da_rota()
            .where(Rota.id == id_rota)
            .options(
                joinedload(Estudante.instituicao), joinedload(Estudante.endereco), joinedload(Estudante.area)
            )
            # Ordem de embarque: pelo horário previsto; quem não tem horário vai para o fim.
            .order_by(Estudante.horario_embarque.is_(None), Estudante.horario_embarque, Estudante.nome)
        )
        return [estudante for _, estudante in self.sessao.execute(consulta).unique().all()]

    def salvar(self, rota: Rota) -> Rota:
        self.sessao.add(rota)
        try:
            self.sessao.commit()
        except Exception:
            self.sessao.rollback()
            raise
        return rota
