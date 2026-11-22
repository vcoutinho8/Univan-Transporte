"""Acesso a dados da tabela `estudante` (com o endereço junto)."""

from sqlalchemy import select, text
from sqlalchemy.orm import Session, joinedload

from app.shared.cpf import garantir_celular_livre, garantir_cpf_livre
from app.modules.estudante.estudante_model import Estudante
from app.shared.enums import StatusCadastro

_RELACOES = (
    joinedload(Estudante.instituicao),
    joinedload(Estudante.endereco),
    joinedload(Estudante.area),
    joinedload(Estudante.parada),
)


class RepositorioEstudante:
    def __init__(self, sessao: Session):
        self.sessao = sessao

    def listar(
        self,
        status: StatusCadastro | None = None,
        fk_area: int | None = None,
        fk_instituicao: int | None = None,
    ) -> list[Estudante]:
        consulta = select(Estudante).options(*_RELACOES).order_by(Estudante.nome)
        if status is not None:
            consulta = consulta.where(Estudante.status == status)
        if fk_area is not None:
            consulta = consulta.where(Estudante.fk_area == fk_area)
        if fk_instituicao is not None:
            consulta = consulta.where(Estudante.fk_instituicao == fk_instituicao)
        return list(self.sessao.scalars(consulta))

    def buscar_por_id(self, id_estudante: int) -> Estudante | None:
        return self.sessao.get(Estudante, id_estudante, options=_RELACOES, populate_existing=True)

    def buscar_por_cpf(self, cpf: str) -> Estudante | None:
        return self.sessao.scalar(select(Estudante).where(Estudante.cpf == cpf))

    def garantir_cpf_livre(self, cpf: str) -> None:
        """O CPF não pode estar em outro cadastro (passageiro, motorista ou usuário)."""
        garantir_cpf_livre(self.sessao, cpf, Estudante.__tablename__)

    def garantir_celular_livre(self, celular: str, id_atual: int | None = None) -> None:
        """O celular não pode ser de outro passageiro ou motorista."""
        garantir_celular_livre(self.sessao, celular, Estudante.__tablename__, id_atual)

    def salvar(self, estudante: Estudante, recalcular_area: bool = False) -> Estudante:
        """Grava o estudante e o endereço.

        A área (`fk_area`) é calculada pelos triggers do banco, que só disparam quando a coluna
        `fk_endereco` aparece num INSERT/UPDATE. Quando só a latitude/longitude do endereço
        mudou, `recalcular_area=True` reenvia `fk_endereco` para o trigger rodar de novo.
        """
        self.sessao.add(estudante)
        try:
            self.sessao.flush()
            if recalcular_area:
                self.sessao.execute(
                    text("UPDATE estudante SET fk_endereco = fk_endereco WHERE id = :id"),
                    {"id": estudante.id},
                )
            self.sessao.commit()
        except Exception:
            self.sessao.rollback()
            raise
        return estudante
