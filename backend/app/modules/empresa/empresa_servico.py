"""Regras de negócio de empresas."""

from app.modules.empresa.empresa_model import Empresa
from app.modules.empresa.empresa_repositorio import RepositorioEmpresa


class ServicoEmpresa:
    def __init__(self, repositorio: RepositorioEmpresa):
        self.repositorio = repositorio

    def listar(self) -> list[Empresa]:
        return self.repositorio.listar()
