"""Schemas de saída dos relatórios."""

from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import Turno


class Referencia(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str


class EstudanteDoRelatorio(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    cpf: str
    celular: str
    email: str | None
    instituicao: Referencia
    curso: str | None
    turno: Turno
    area: Referencia | None
    rota: Referencia | None = Field(description="Rota ativa que leva o passageiro (mesma regra do gerar_dia).")
    horario_embarque: time | None
    valor_mensal: Decimal
    dia_vencimento: int
    presencas: int = Field(default=0, description="Embarques no período.")
    faltas: int = Field(default=0, description="Faltas sem aviso no período.")
    avisos: int = Field(default=0, description="Avisos de 'não vou' no período.")


class TotalPorInstituicao(BaseModel):
    instituicao: Referencia
    total: int


class TotalPorTurno(BaseModel):
    turno: Turno
    total: int


class RelatorioEstudantesAtivos(BaseModel):
    """Passageiros com cadastro ativo, com totais por instituição e turno."""

    gerado_em: datetime
    data_inicio: date
    data_fim: date
    total: int
    valor_mensal_total: Decimal = Field(description="Soma das mensalidades dos passageiros listados.")
    sem_area: int = Field(description="Endereço fora de todas as áreas: não entram em nenhuma rota.")
    sem_rota: int = Field(description="Sem rota ativa (inclui os sem área).")
    presencas: int = Field(description="Embarques de todos os listados no período.")
    faltas: int = Field(description="Faltas sem aviso de todos os listados no período.")
    por_instituicao: list[TotalPorInstituicao]
    por_turno: list[TotalPorTurno]
    estudantes: list[EstudanteDoRelatorio]
