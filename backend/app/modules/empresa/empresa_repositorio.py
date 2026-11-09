"""Acesso a dados da tabela `empresa`."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.empresa.empresa_model import Empresa


class RepositorioEmpresa:
    def __init__(self, sessao: Session):
        self.sessao = sessao

    def listar(self) -> list[Empresa]:
        return list(self.sessao.scalars(select(Empresa).order_by(Empresa.razao_social)))

    def buscar_por_id(self, id_empresa: int) -> Empresa | None:
        return self.sessao.get(Empresa, id_empresa)
