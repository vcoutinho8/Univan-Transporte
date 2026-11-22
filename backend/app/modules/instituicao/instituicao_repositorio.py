"""Acesso a dados da tabela `instituicao`."""

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.modules.instituicao.instituicao_model import Instituicao, InstituicaoParada

_RELACOES = (joinedload(Instituicao.endereco), joinedload(Instituicao.paradas))


class RepositorioInstituicao:
    def __init__(self, sessao: Session):
        self.sessao = sessao

    def listar(self) -> list[Instituicao]:
        consulta = select(Instituicao).options(*_RELACOES).order_by(Instituicao.nome)
        return list(self.sessao.scalars(consulta).unique())

    def buscar_por_id(self, id_instituicao: int) -> Instituicao | None:
        return self.sessao.get(Instituicao, id_instituicao, options=_RELACOES, populate_existing=True)

    def buscar_parada(self, id_instituicao: int, id_parada: int) -> InstituicaoParada | None:
        parada = self.sessao.get(InstituicaoParada, id_parada)
        return parada if parada is not None and parada.fk_instituicao == id_instituicao else None

    def remover_parada(self, parada: InstituicaoParada) -> None:
        """Apaga a parada; quem a usava volta para a parada principal."""
        from sqlalchemy import update

        from app.modules.estudante.estudante_model import Estudante

        self.sessao.execute(update(Estudante).where(Estudante.fk_parada == parada.id).values(fk_parada=None))
        self.sessao.delete(parada)
        try:
            self.sessao.commit()
        except Exception:
            self.sessao.rollback()
            raise

    def salvar(self, instituicao: Instituicao) -> Instituicao:
        self.sessao.add(instituicao)
        try:
            self.sessao.commit()
        except Exception:
            self.sessao.rollback()
            raise
        return instituicao
