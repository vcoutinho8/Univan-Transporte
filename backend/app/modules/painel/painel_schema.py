"""Formato da resposta do painel administrativo."""

from datetime import date

from pydantic import BaseModel


class ViagensDoDia(BaseModel):
    """Quantidade de viagens de um dia, separadas por situação."""

    agendada: int = 0
    em_andamento: int = 0
    concluida: int = 0
    cancelada: int = 0


class ResumoPainel(BaseModel):
    """Números exibidos nos cartões da tela inicial (RF5)."""

    data: date
    veiculos_ativos: int
    motoristas_ativos: int
    estudantes_ativos: int
    rotas_ativas: int
    estudantes_sem_area: int
    viagens_hoje: ViagensDoDia
