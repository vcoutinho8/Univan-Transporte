"""Consultas de contagem usadas pelo painel. Nenhuma gravação."""

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.chamada.chamada_model import Chamada
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

    def semana(self, fim: date) -> list[dict]:
        """Os 7 dias que terminam em `fim`: viagens e chamadas por situação (sem as canceladas)."""
        inicio = fim - timedelta(days=6)
        dias = {inicio + timedelta(days=i): {"viagens": 0, "presente": 0, "ausente": 0, "nao_vai": 0, "pendente": 0} for i in range(7)}
        viagens = self.sessao.execute(
            select(Viagem.data, func.count())
            .where(Viagem.data.between(inicio, fim), Viagem.status != StatusViagem.CANCELADA)
            .group_by(Viagem.data)
        )
        for dia, total in viagens:
            dias[dia]["viagens"] = total
        chamadas = self.sessao.execute(
            select(Viagem.data, Chamada.status, func.count())
            .join(Viagem, Viagem.id == Chamada.fk_viagem)
            .where(Viagem.data.between(inicio, fim), Viagem.status != StatusViagem.CANCELADA)
            .group_by(Viagem.data, Chamada.status)
        )
        for dia, status, total in chamadas:
            chave = status.value if hasattr(status, "value") else str(status)
            dias[dia][chave] = total
        return [
            {
                "data": dia,
                "viagens": c["viagens"],
                "presentes": c["presente"],
                "ausentes": c["ausente"],
                "nao_vai": c["nao_vai"],
                "pendentes": c["pendente"],
            }
            for dia, c in sorted(dias.items())
        ]
