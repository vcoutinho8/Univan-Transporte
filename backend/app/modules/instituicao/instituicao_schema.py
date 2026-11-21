"""Schemas das instituições."""

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

from app.modules.endereco.endereco_schema import EnderecoResposta


class InstituicaoResposta(BaseModel):
    """Faculdade de destino, com o endereço e o ponto de parada na rua."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    endereco: EnderecoResposta
    parada_latitude: float | None = Field(description="Ponto de parada ajustado no mapa (vazio = usa o endereço).")
    parada_longitude: float | None

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
