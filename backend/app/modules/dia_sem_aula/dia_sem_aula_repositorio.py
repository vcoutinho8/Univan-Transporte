"""Acesso a dados da tabela `dia_sem_aula`."""

from datetime import date

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, joinedload

from app.modules.dia_sem_aula.dia_sem_aula_model import DiaSemAula
from app.modules.rota.rota_model import Rota
from app.modules.viagem.viagem_model import Viagem


class RepositorioDiaSemAula:
    def __init__(self, sessao: Session):
        self.sessao = sessao

    def listar(self, inicio: date, fim: date, fk_instituicao: int | None = None) -> list[DiaSemAula]:
        """Dias do período. Com instituição: os dela e os gerais (que valem para todas)."""
        consulta = (
            select(DiaSemAula)
            .options(joinedload(DiaSemAula.instituicao))
            .where(DiaSemAula.data.between(inicio, fim))
            .order_by(DiaSemAula.data, DiaSemAula.fk_instituicao.is_not(None), DiaSemAula.id)
        )
        if fk_instituicao is not None:
            consulta = consulta.where(
                (DiaSemAula.fk_instituicao == fk_instituicao) | DiaSemAula.fk_instituicao.is_(None)
            )
        return list(self.sessao.scalars(consulta))

    def datas_cadastradas(self, inicio: date, fim: date, fk_instituicao: int | None) -> set[date]:
        """Datas do período que já têm registro exatamente para esta instituição (ou geral)."""
        filtro = (
            DiaSemAula.fk_instituicao.is_(None) if fk_instituicao is None else DiaSemAula.fk_instituicao == fk_instituicao
        )
        return set(self.sessao.scalars(select(DiaSemAula.data).where(DiaSemAula.data.between(inicio, fim), filtro)))

    def contar_viagens(self, inicio: date, fim: date, fk_instituicao: int | None) -> int:
        consulta = select(func.count()).select_from(Viagem).join(Rota, Rota.id == Viagem.fk_rota).where(
            Viagem.data.between(inicio, fim)
        )
        if fk_instituicao is not None:
            consulta = consulta.where(Rota.fk_instituicao == fk_instituicao)
        return self.sessao.scalar(consulta) or 0

    def criar_varios(self, dias: list[DiaSemAula]) -> None:
        self.sessao.add_all(dias)
        try:
            self.sessao.commit()
        except Exception:
            self.sessao.rollback()
            raise

    def remover(self, ids: list[int]) -> int:
        try:
            removidos = self.sessao.execute(delete(DiaSemAula).where(DiaSemAula.id.in_(ids))).rowcount
            self.sessao.commit()
        except Exception:
            self.sessao.rollback()
            raise
        return removidos
