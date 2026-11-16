"""Acesso a dados da tabela `area`."""

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session, joinedload

from app.modules.area.area_model import Area
from app.shared.enums import StatusCadastro


class RepositorioArea:
    def __init__(self, sessao: Session):
        self.sessao = sessao

    def listar(self, status: StatusCadastro | None = None) -> list[Area]:
        consulta = select(Area).options(joinedload(Area.motorista)).order_by(Area.nome)
        if status is not None:
            consulta = consulta.where(Area.status == status)
        return list(self.sessao.scalars(consulta))

    def buscar_por_id(self, id_area: int) -> Area | None:
        return self.sessao.get(Area, id_area, options=[joinedload(Area.motorista)], populate_existing=True)

    def buscar_ativa_por_nome(self, nome: str) -> Area | None:
        return self.sessao.scalar(
            select(Area).where(func.lower(Area.nome) == nome.lower(), Area.status == StatusCadastro.ATIVO)
        )

    def salvar(self, area: Area) -> Area:
        """Grava a área e recalcula a área de todos os passageiros.

        Quem liga passageiro a área é o trigger do banco, que só roda quando `fk_endereco` do
        estudante aparece num UPDATE. Mudou um contorno ou a situação de uma área: reenvia
        `fk_endereco` de todos os passageiros para o trigger refazer a conta.
        """
        self.sessao.add(area)
        try:
            self.sessao.flush()
            self.sessao.execute(text("UPDATE estudante SET fk_endereco = fk_endereco"))
            self.sessao.commit()
        except Exception:
            self.sessao.rollback()
            raise
        return area
