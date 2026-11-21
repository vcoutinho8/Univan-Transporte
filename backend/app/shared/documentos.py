"""Conferência dos dígitos verificadores de CPF e CNH.

Os schemas só garantem o *formato* (11 números). Aqui fica a conta que diz se o número pode
existir de verdade. Quem decide quando aplicá-la é o serviço (ver `motorista_servico.py`).
Todas as funções recebem o texto já sem pontuação (`app.shared.texto.so_digitos`).
"""


def _repetido(numero: str) -> bool:
    """'11111111111' passa na conta dos dígitos, mas não é um documento real."""
    return numero == numero[0] * len(numero)


def cpf_valido(cpf: str) -> bool:
    """Confere os dois dígitos verificadores do CPF (módulo 11)."""
    if len(cpf) != 11 or not cpf.isdigit() or _repetido(cpf):
        return False
    for tamanho in (9, 10):
        soma = sum(int(cpf[i]) * (tamanho + 1 - i) for i in range(tamanho))
        if (soma * 10) % 11 % 10 != int(cpf[tamanho]):
            return False
    return True


def cnh_valida(cnh: str) -> bool:
    """Confere os dois dígitos verificadores da CNH (número de registro, 11 dígitos).

    Regra do Denatran: o 1º dígito usa pesos 9..1 sobre os 9 primeiros números; se o resto
    da divisão por 11 for 10 ou mais, o dígito vira 0 e o 2º dígito perde 2 pontos. O 2º usa
    pesos 1..9 e, se der negativo, soma 11.
    """
    if len(cnh) != 11 or not cnh.isdigit() or _repetido(cnh):
        return False

    primeiro = sum(int(cnh[i]) * (9 - i) for i in range(9)) % 11
    desconto = 0
    if primeiro >= 10:
        primeiro, desconto = 0, 2

    segundo = sum(int(cnh[i]) * (i + 1) for i in range(9)) % 11 - desconto
    if segundo < 0:
        segundo += 11
    if segundo >= 10:
        segundo = 0

    return cnh[9] == str(primeiro) and cnh[10] == str(segundo)
