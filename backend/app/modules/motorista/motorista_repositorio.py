"""Acesso a dados da tabela `motorista`."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.motorista.motorista_model import Motorista
from app.shared.enums import StatusCadastro


class RepositorioMotorista:
    def __init__(self, sessao: Session):
        self.sessao = sessao

    def listar(self, status: StatusCadastro | None = None) -> list[Motorista]:
        consulta = select(Motorista).order_by(Motorista.nome)
        if status is not None:
            consulta = consulta.where(Motorista.status == status)
        return list(self.sessao.scalars(consulta))

    def buscar_por_id(self, id_motorista: int) -> Motorista | None:
        return self.sessao.get(Motorista, id_motorista)
