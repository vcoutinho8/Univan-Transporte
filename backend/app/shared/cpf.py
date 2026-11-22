"""CPF único no sistema: a mesma pessoa não aparece em dois cadastros (passageiro, motorista, usuário)."""

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config.erros import ConflitoDeDados

CADASTROS = (("estudante", "passageiro"), ("motorista", "motorista"), ("usuario", "usuário"))


def garantir_cpf_livre(sessao: Session, cpf: str | None, tabela: str, id_atual: int | None = None) -> None:
    """Recusa (409) o CPF que já está em qualquer cadastro, menos no próprio registro sendo editado."""
    if not cpf:
        return
    for outra, rotulo in CADASTROS:
        for (id_dono,) in sessao.execute(text(f"SELECT id FROM {outra} WHERE cpf = :cpf"), {"cpf": cpf}):
            if (outra, id_dono) != (tabela, id_atual):
                raise ConflitoDeDados(f"Este CPF já está cadastrado como {rotulo}.")
