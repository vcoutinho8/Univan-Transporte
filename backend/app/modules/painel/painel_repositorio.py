"""Consultas de contagem usadas pelo painel. Nenhuma gravação."""

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.estudante.estudante_model import Estudante
from app.modules.motorista.motorista_model import Motorista
from app.modules.rota.rota_model import Rota
from app.modules.veiculo.veiculo_model import Veiculo
from app.modules.viagem.viagem_model import Viagem
from app.shared.enums import StatusCadastro, StatusViagem


class RepositorioPainel:
    def __init__(self, sessao: Session):
        self.sessao = sessao

    def _contar_ativos(self, model) -> int:
        consulta = select(func.count()).select_from(model).where(model.status == StatusCadastro.ATIVO)
        return self.sessao.scalar(consulta) or 0

    def contar_veiculos_ativos(self) -> int:
        return self._contar_ativos(Veiculo)

    def contar_motoristas_ativos(self) -> int:
        return self._contar_ativos(Motorista)

    def contar_estudantes_ativos(self) -> int:
        return self._contar_ativos(Estudante)

    def contar_rotas_ativas(self) -> int:
        return self._contar_ativos(Rota)

    def contar_estudantes_sem_area(self) -> int:
        """Estudantes ativos cujo endereço não caiu em nenhuma área (o gestor precisa resolver)."""
        consulta = (
            select(func.count())
            .select_from(Estudante)
            .where(Estudante.status == StatusCadastro.ATIVO, Estudante.fk_area.is_(None))
        )
        return self.sessao.scalar(consulta) or 0

    def contar_viagens_por_status(self, dia: date) -> dict[StatusViagem, int]:
        consulta = (
            select(Viagem.status, func.count())
            .where(Viagem.data == dia)
            .group_by(Viagem.status)
        )
        return {status: quantidade for status, quantidade in self.sessao.execute(consulta)}
