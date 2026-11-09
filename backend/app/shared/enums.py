"""Enums do banco: os valores aceitos pelos CHECK (coluna IN (...)) de docs/univan-sqlite.sql."""

import enum


class StatusCadastro(str, enum.Enum):
    """Situação do cadastro em veiculo, motorista, area, estudante, rota."""

    ATIVO = "ativo"
    INATIVO = "inativo"


class Turno(str, enum.Enum):
    """Turno de aula em estudante, rota."""

    MANHA = "manha"
    TARDE = "tarde"
    NOITE = "noite"


class Sentido(str, enum.Enum):
    """Sentido da viagem."""

    IDA = "ida"
    VOLTA = "volta"


class StatusViagem(str, enum.Enum):
    """Situação da viagem: agendada → em_andamento → concluida (ou cancelada)."""

    AGENDADA = "agendada"
    EM_ANDAMENTO = "em_andamento"
    CONCLUIDA = "concluida"
    CANCELADA = "cancelada"


class StatusChamada(str, enum.Enum):
    """Situação do estudante em uma viagem."""

    PENDENTE = "pendente"
    NAO_VAI = "nao_vai"
    PRESENTE = "presente"
    AUSENTE = "ausente"


class StatusTitulo(str, enum.Enum):
    """Situação do título em titulo_receber, titulo_pagar."""

    ABERTO = "aberto"
    PAGO = "pago"
    CANCELADO = "cancelado"


class CategoriaTituloPagar(str, enum.Enum):
    """Categoria de uma conta a pagar (titulo_pagar)."""

    SALARIO = "salario"
    COMBUSTIVEL = "combustivel"
    MANUTENCAO = "manutencao"
    SEGURO = "seguro"
    IMPOSTOS = "impostos"
    OUTROS = "outros"
