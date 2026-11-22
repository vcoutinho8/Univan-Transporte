"""Schemas de entrada e saída das viagens."""

from datetime import date, datetime, time

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import Sentido, StatusChamada, StatusViagem, Turno


class GeracaoPedido(BaseModel):
    """Dia para gerar as viagens (rotina `gerar_dia` do banco)."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [{"data": "2026-11-23"}]})

    data: date


MotivoIndisponivel = Literal["feriado", "fim_de_semana", "sem_rotas"]


class GeracaoResposta(BaseModel):
    data: date
    viagens_criadas: int = Field(description="Viagens novas. Gerar de novo o mesmo dia não duplica nada.")
    chamadas_criadas: int = Field(description="Passageiros incluídos nas viagens (status `pendente`).")
    avisos: list[str] = Field(description="Por que alguma rota não gerou viagem (feriado, motorista sem veículo...).")
    indisponivel: MotivoIndisponivel | None = Field(
        default=None,
        description="Preenchido quando o dia não tem viagem nenhuma: feriado geral, fim de semana sem rota "
        "ou nenhuma rota ativa naquele dia da semana.",
    )


class DiaDoCalendario(BaseModel):
    """Resumo de um dia para a faixa da semana na tela de viagens."""

    data: date
    viagens: int = Field(description="Viagens do dia, contadas por motorista + turno + sentido (jornadas).")
    rotas: int = Field(description="Rotas ativas que rodam nesse dia da semana.")
    feriados: list[str] = Field(description="Dias sem aula: 'Finados' (geral) ou 'UVV: Semana acadêmica'.")
    feriado_geral: bool = Field(description="Sem aula em todas as instituições.")
    motivo_geral: str | None = Field(default=None, description="Motivo do dia sem aula geral (Feriado, Greve, Recesso...).")


class SubstituicaoPedido(BaseModel):
    """Troca do motorista e/ou do veículo só nesta viagem (os cadastros não mudam)."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [{"fk_veiculo": 3}]})

    fk_motorista: int | None = Field(default=None, gt=0)
    fk_veiculo: int | None = Field(default=None, gt=0)


class Referencia(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str


class RotaDaViagem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    turno: Turno
    instituicao: Referencia


class VeiculoDaViagem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    placa: str
    modelo: str
    capacidade: int


class ContagemPassageiros(BaseModel):
    """Situação das chamadas da viagem."""

    total: int = 0
    pendente: int = 0
    presente: int = 0
    ausente: int = 0
    nao_vai: int = 0


class ViagemResposta(BaseModel):
    """Viagem com rota, motorista e veículo do dia e o resumo dos passageiros."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    data: date
    sentido: Sentido
    status: StatusViagem
    horario_previsto: time | None = Field(description="Horário de ida ou de volta da rota, conforme o sentido.")
    horario_saida: datetime | None
    horario_chegada: datetime | None
    motivo_encerramento: str | None = Field(default=None, description="Motivo, se foi encerrada antes da hora.")
    rota: RotaDaViagem
    motorista: Referencia
    veiculo: VeiculoDaViagem
    substituicao: bool = Field(description="Motorista ou veículo diferente do cadastro da rota.")
    passageiros: ContagemPassageiros


class EnderecoDaChamada(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    logradouro: str
    numero: str | None
    complemento: str | None
    bairro: str
    latitude: float | None = None
    longitude: float | None = None


class ParadaDaChamada(BaseModel):
    """Parada extra da faculdade escolhida pelo passageiro (vazio = a principal)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    latitude: float
    longitude: float


class EstudanteDaChamada(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    apelido: str | None
    celular: str
    endereco: EnderecoDaChamada
    parada: ParadaDaChamada | None = None


class ChamadaResposta(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    estudante: EstudanteDaChamada
    status: StatusChamada
    horario_previsto: time | None
    horario_aviso: datetime | None
    horario_embarque: datetime | None
    horario_desembarque: datetime | None = Field(
        default=None, description="Desceu no destino (faculdade na ida, casa na volta)."
    )


class ViagemDetalhe(ViagemResposta):
    """Viagem com a lista de passageiros esperados, na ordem do horário previsto."""

    chamadas: list[ChamadaResposta]
