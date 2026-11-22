"""Testes da conferência dos dígitos verificadores de CPF e CNH."""

import pytest

from app.shared.documentos import cnh_valida, cpf_valido

CPFS_VALIDOS = ["12345678909", "52998224725", "11144477735", "39053344705"]
CNHS_VALIDAS = [
    "02650306461",
    "12345678900",
    "98765432109",
    "24681357982",
    "10000000108",  # o 1º dígito dá resto 10: cai na regra do desconto
]


@pytest.mark.parametrize("cpf", CPFS_VALIDOS)
def test_cpf_valido(cpf):
    assert cpf_valido(cpf)


@pytest.mark.parametrize(
    "cpf",
    [
        "12345678901",  # dígitos errados
        "12345678908",  # só o 2º dígito errado
        "11111111111",  # repetido: passa na conta, mas não existe
        "00000000000",
        "1234567890",  # curto
        "123456789090",  # longo
        "1234567890a",  # letra
        "",
    ],
)
def test_cpf_invalido(cpf):
    assert not cpf_valido(cpf)


@pytest.mark.parametrize("cnh", CNHS_VALIDAS)
def test_cnh_valida(cnh):
    assert cnh_valida(cnh)


@pytest.mark.parametrize(
    "cnh",
    [
        "12345678901",  # dígitos errados
        "02650306462",  # só o 2º dígito errado
        "02650306471",  # só o 1º dígito errado
        "11111111111",  # repetida
        "00000000000",
        "1234567890",  # curta
        "123456789000",  # longa
        "1234567890a",  # letra
        "",
    ],
)
def test_cnh_invalida(cnh):
    assert not cnh_valida(cnh)
