"""Documentos únicos no sistema: a mesma pessoa (CPF) ou o mesmo celular não aparecem em dois
cadastros (passageiro, motorista, usuário)."""

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config.erros import ConflitoDeDados

ROTULOS = {"estudante": "passageiro", "motorista": "motorista", "usuario": "usuário"}
# Onde cada documento aparece (o usuário não tem celular).
TABELAS = {"cpf": ("estudante", "motorista", "usuario"), "celular": ("estudante", "motorista")}


def dono_do(sessao: Session, coluna: str, valor: str | None, tabela: str | None = None, id_atual: int | None = None) -> str | None:
    """Em qual cadastro o CPF/celular já está ("passageiro", "motorista"...), fora o próprio registro."""
    if not valor:
        return None
    for outra in TABELAS[coluna]:
        for (id_dono,) in sessao.execute(text(f"SELECT id FROM {outra} WHERE {coluna} = :valor"), {"valor": valor}):
            if (outra, id_dono) != (tabela, id_atual):
                return ROTULOS[outra]
    return None


def garantir_cpf_livre(sessao: Session, cpf: str | None, tabela: str, id_atual: int | None = None) -> None:
    """Recusa (409) o CPF que já está em qualquer cadastro, menos no próprio registro sendo editado."""
    if dono := dono_do(sessao, "cpf", cpf, tabela, id_atual):
        raise ConflitoDeDados(f"Este CPF já está cadastrado como {dono}.")


def garantir_celular_livre(sessao: Session, celular: str | None, tabela: str, id_atual: int | None = None) -> None:
    """Recusa (409) o celular de outro passageiro ou motorista."""
    if dono := dono_do(sessao, "celular", celular, tabela, id_atual):
        raise ConflitoDeDados(f"Este celular já está cadastrado para um {dono}.")
