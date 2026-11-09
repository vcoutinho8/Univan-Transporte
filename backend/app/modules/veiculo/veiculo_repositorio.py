"""Acesso a dados da tabela `veiculo`."""

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.modules.veiculo.veiculo_model import Veiculo
from app.shared.enums import StatusCadastro


class RepositorioVeiculo:
    def __init__(self, sessao: Session):
        self.sessao = sessao

    def listar(
        self, status: StatusCadastro | None = None, fk_empresa: int | None = None
    ) -> list[Veiculo]:
        consulta = select(Veiculo).options(joinedload(Veiculo.empresa)).order_by(Veiculo.placa)
        if status is not None:
            consulta = consulta.where(Veiculo.status == status)
        if fk_empresa is not None:
            consulta = consulta.where(Veiculo.fk_empresa == fk_empresa)
        return list(self.sessao.scalars(consulta))

    def buscar_por_id(self, id_veiculo: int) -> Veiculo | None:
        return self.sessao.get(Veiculo, id_veiculo, options=[joinedload(Veiculo.empresa)])

    def buscar_por_placa(self, placa: str) -> Veiculo | None:
        return self.sessao.scalar(select(Veiculo).where(Veiculo.placa == placa))

    def salvar(self, veiculo: Veiculo) -> Veiculo:
        self.sessao.add(veiculo)
        try:
            self.sessao.commit()
        except Exception:
            self.sessao.rollback()
            raise
        self.sessao.refresh(veiculo)
        return veiculo
