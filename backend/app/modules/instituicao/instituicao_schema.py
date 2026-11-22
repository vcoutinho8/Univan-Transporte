"""Schemas das instituições."""

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

from app.modules.endereco.endereco_schema import EnderecoEntrada, EnderecoResposta


class ParadaExtra(BaseModel):
    """Parada extra da faculdade (além da principal)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    latitude: float
    longitude: float


class InstituicaoResposta(BaseModel):
    """Faculdade de destino, com o endereço e o ponto de parada na rua."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    endereco: EnderecoResposta
    parada_latitude: float | None = Field(description="Ponto de parada ajustado no mapa (vazio = usa o endereço).")
    parada_longitude: float | None
    paradas: list[ParadaExtra] = Field(default_factory=list, description="Paradas extras (a principal é ponto_parada).")

    @computed_field(description="Onde a van para: o ponto ajustado ou, sem ajuste, a localização do endereço.")
    @property
    def ponto_parada(self) -> list[float] | None:
        if self.parada_latitude is not None and self.parada_longitude is not None:
            return [self.parada_latitude, self.parada_longitude]
        if self.endereco.latitude is not None and self.endereco.longitude is not None:
            return [float(self.endereco.latitude), float(self.endereco.longitude)]
        return None


class ParadaPedido(BaseModel):
    """Novo ponto de parada. Os dois vazios = volta a usar a localização do endereço."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [{"latitude": -20.351234, "longitude": -40.299876}]})

    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def checar_par(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Informe latitude e longitude juntas (ou as duas vazias para voltar ao endereço).")
        return self


class ParadaExtraPedido(BaseModel):
    """Nova parada extra (ou alteração): nome e ponto no mapa."""

    model_config = ConfigDict(
        extra="forbid", json_schema_extra={"examples": [{"nome": "Biopráticas", "latitude": -20.3519, "longitude": -40.2969}]}
    )

    nome: str = Field(max_length=60)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

    @field_validator("nome")
    @classmethod
    def validar_nome(cls, valor: str) -> str:
        nome = " ".join(valor.split())
        if not nome:
            raise ValueError("Informe o nome da parada (ex.: Biopráticas).")
        return nome


def _nome_instituicao(valor: str) -> str:
    nome = " ".join(valor.split())
    if not nome:
        raise ValueError("Informe o nome da instituição.")
    return nome


class InstituicaoNova(BaseModel):
    """Nova faculdade de destino: nome e endereço (o pino no mapa vira o ponto de parada)."""

    model_config = ConfigDict(extra="forbid")

    nome: str = Field(max_length=100)
    endereco: EnderecoEntrada

    @field_validator("nome")
    @classmethod
    def validar_nome(cls, valor: str) -> str:
        return _nome_instituicao(valor)


class InstituicaoAlteracao(BaseModel):
    """Só os campos enviados mudam."""

    model_config = ConfigDict(extra="forbid")

    nome: str | None = Field(default=None, max_length=100)
    endereco: EnderecoEntrada | None = None

    @field_validator("nome")
    @classmethod
    def validar_nome(cls, valor: str | None) -> str | None:
        return None if valor is None else _nome_instituicao(valor)
