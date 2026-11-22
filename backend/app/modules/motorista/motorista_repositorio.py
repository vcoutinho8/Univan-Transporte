"""Acesso a dados da tabela `motorista` (com o veículo padrão junto)."""

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.shared.cpf import garantir_celular_livre, garantir_cpf_livre
from app.modules.motorista.motorista_model import Motorista
from app.shared.enums import StatusCadastro


class RepositorioMotorista:
    def __init__(self, sessao: Session):
        self.sessao = sessao

    def listar(self, status: StatusCadastro | None = None) -> list[Motorista]:
        consulta = (
            select(Motorista)
            .options(joinedload(Motorista.veiculo), joinedload(Motorista.endereco))
            .order_by(Motorista.nome)
        )
        if status is not None:
            consulta = consulta.where(Motorista.status == status)
        return list(self.sessao.scalars(consulta))

    def buscar_por_id(self, id_motorista: int) -> Motorista | None:
        # populate_existing: depois de salvar, o veículo padrão novo precisa vir do banco.
        return self.sessao.get(
            Motorista,
            id_motorista,
            options=[joinedload(Motorista.veiculo), joinedload(Motorista.endereco)],
            populate_existing=True,
        )

    def buscar_por_cpf(self, cpf: str) -> Motorista | None:
        return self.sessao.scalar(select(Motorista).where(Motorista.cpf == cpf))

    def garantir_cpf_livre(self, cpf: str) -> None:
        """O CPF não pode estar em outro cadastro (passageiro, motorista ou usuário)."""
        garantir_cpf_livre(self.sessao, cpf, Motorista.__tablename__)

    def garantir_celular_livre(self, celular: str, id_atual: int | None = None) -> None:
        """O celular não pode ser de outro passageiro ou motorista."""
        garantir_celular_livre(self.sessao, celular, Motorista.__tablename__, id_atual)

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
