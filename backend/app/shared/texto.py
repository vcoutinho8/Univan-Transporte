"""Funções de limpeza de texto usadas pelos schemas de entrada."""

import re


def limpar_texto(valor: str | None) -> str | None:
    """Tira espaços das pontas; texto vazio vira None."""
    if valor is None:
        return None
    texto = valor.strip()
    return texto or None


def so_digitos(valor: str) -> str:
    """Remove pontuação de CPF, CEP, telefone ('111.222.333-01' -> '11122233301')."""
    return re.sub(r"\D", "", valor)


def normalizar_login(valor: str) -> str:
    """Login sem maiúsculas; CPF/CNPJ digitado com máscara vira só os números."""
    login = valor.strip().lower()
    return so_digitos(login) if re.fullmatch(r"[\d.\-/\s]+", login) else login
