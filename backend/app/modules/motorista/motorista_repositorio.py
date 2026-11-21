"""Acesso a dados da tabela `motorista` (com o veículo padrão junto)."""

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.modules.motorista.motorista_model import Motorista
from app.shared.enums import StatusCadastro


class RepositorioMotorista:
    def __init__(self, sessao: Session):
        self.sessao = sessao

    def listar(self, status: StatusCadastro | None = None) -> list[Motorista]:
        consulta = select(Motorista).options(joinedload(Motorista.veiculo)).order_by(Motorista.nome)
        if status is not None:
            consulta = consulta.where(Motorista.status == status)
        return list(self.sessao.scalars(consulta))

    def buscar_por_id(self, id_motorista: int) -> Motorista | None:
        # populate_existing: depois de salvar, o veículo padrão novo precisa vir do banco.
        return self.sessao.get(
            Motorista, id_motorista, options=[joinedload(Motorista.veiculo)], populate_existing=True
        )

    def buscar_por_cpf(self, cpf: str) -> Motorista | None:
        return self.sessao.scalar(select(Motorista).where(Motorista.cpf == cpf))

    def buscar_por_cnh(self, cnh: str) -> Motorista | None:
        return self.sessao.scalar(select(Motorista).where(Motorista.cnh == cnh))

    def salvar(self, motorista: Motorista) -> Motorista:
        self.sessao.add(motorista)
        try:
            self.sessao.commit()
        except Exception:
            self.sessao.rollback()
            raise
        self.sessao.refresh(motorista)
        return motorista
