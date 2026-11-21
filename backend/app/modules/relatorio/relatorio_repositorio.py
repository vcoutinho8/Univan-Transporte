"""Consultas dos relatórios. Nenhuma gravação."""

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.modules.chamada.chamada_model import Chamada
from app.modules.estudante.estudante_model import Estudante
from app.modules.rota.rota_model import Rota
from app.modules.rota.rota_repositorio import passageiros_da_rota
from app.modules.viagem.viagem_model import Viagem
from app.shared.enums import StatusCadastro, StatusViagem, Turno


class RepositorioRelatorio:
    def __init__(self, sessao: Session):
        self.sessao = sessao

    def estudantes_ativos(
        self, fk_instituicao: int | None = None, turno: Turno | None = None, fk_area: int | None = None
    ) -> list[Estudante]:
        consulta = (
            select(Estudante)
            .options(joinedload(Estudante.instituicao), joinedload(Estudante.area))
            .where(Estudante.status == StatusCadastro.ATIVO)
            .order_by(Estudante.nome)
        )
        if fk_instituicao is not None:
            consulta = consulta.where(Estudante.fk_instituicao == fk_instituicao)
        if turno is not None:
            consulta = consulta.where(Estudante.turno == turno)
        if fk_area is not None:
            consulta = consulta.where(Estudante.fk_area == fk_area)
        return list(self.sessao.scalars(consulta))

    def frequencia_no_periodo(self, inicio: date, fim: date) -> dict[int, dict[str, int]]:
        """{id do estudante: {status da chamada: quantidade}} nas viagens do período (sem as canceladas)."""
        linhas = self.sessao.execute(
            select(Chamada.fk_estudante, Chamada.status, func.count())
            .join(Viagem, Viagem.id == Chamada.fk_viagem)
            .where(Viagem.data.between(inicio, fim), Viagem.status != StatusViagem.CANCELADA)
            .group_by(Chamada.fk_estudante, Chamada.status)
        )
        frequencia: dict[int, dict[str, int]] = {}
        for id_estudante, status, quantidade in linhas:
            frequencia.setdefault(id_estudante, {})[status.value] = quantidade
        return frequencia

    def rota_de_cada_estudante(self) -> dict[int, Rota]:
        """{id do estudante: rota ativa que o leva}. Cada passageiro cai em no máximo uma rota."""
        consulta = passageiros_da_rota().where(Rota.status == StatusCadastro.ATIVO)
        ids = self.sessao.execute(consulta.with_only_columns(Estudante.id, Rota.id)).all()
        rotas = {r.id: r for r in self.sessao.scalars(select(Rota).where(Rota.id.in_({id_rota for _, id_rota in ids})))}
        return {id_estudante: rotas[id_rota] for id_estudante, id_rota in ids}
