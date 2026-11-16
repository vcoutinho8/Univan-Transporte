"""Acesso a dados da tabela `instituicao`."""

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.modules.instituicao.instituicao_model import Instituicao


class RepositorioInstituicao:
    def __init__(self, sessao: Session):
        self.sessao = sessao

    def listar(self) -> list[Instituicao]:
        consulta = select(Instituicao).options(joinedload(Instituicao.endereco)).order_by(Instituicao.nome)
        return list(self.sessao.scalars(consulta))

    def buscar_por_id(self, id_instituicao: int) -> Instituicao | None:
        return self.sessao.get(Instituicao, id_instituicao)
