"""Schemas das áreas (bairros/regiões da cidade desenhados no mapa)."""

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.shared.enums import StatusCadastro

_PAR = re.compile(r"\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)")

Vertice = tuple[float, float]


def poligono_para_mapa(coordenadas: str) -> list[Vertice]:
    """Converte '((lon,lat),(lon,lat),...)' do banco em [(lat, lon), ...], a ordem do Leaflet."""
    return [(float(lat), float(lon)) for lon, lat in _PAR.findall(coordenadas)]


def poligono_para_banco(poligono: list[Vertice]) -> str:
    """Converte [(lat, lon), ...] do mapa no texto '((lon,lat),...)' que o trigger do banco lê."""
    return "(" + ",".join(f"({lon:.6f},{lat:.6f})" for lat, lon in poligono) + ")"


def validar_poligono(poligono: list[Vertice]) -> list[Vertice]:
    """Pelo menos 3 vértices diferentes, coordenadas válidas e sem repetir o primeiro no fim."""
    for lat, lon in poligono:
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError("Coordenada fora do mapa. Use [latitude, longitude].")
    pontos = [(round(lat, 6), round(lon, 6)) for lat, lon in poligono]
    if len(pontos) > 1 and pontos[0] == pontos[-1]:
        pontos = pontos[:-1]  # o anel fechado do GeoJSON repete o primeiro ponto
    if len(set(pontos)) < 3:
        raise ValueError("A área precisa de pelo menos 3 pontos diferentes.")
    return pontos


def validar_nome(valor: str) -> str:
    texto = " ".join(valor.split())
    if not texto:
        raise ValueError("Informe o nome da área (bairro).")
    return texto


class AreaCriacao(BaseModel):
    """Área nova: nome do bairro, motorista responsável (opcional) e o contorno no mapa."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [{
                "nome": "Setiba",
                "fk_motorista": 2,
                "poligono": [[-20.625, -40.445], [-20.625, -40.430], [-20.636, -40.430], [-20.636, -40.445]],
            }]})

    nome: str = Field(max_length=100)
    fk_motorista: int | None = Field(default=None, gt=0)
    poligono: list[Vertice] = Field(max_length=500, description="Vértices como [latitude, longitude].")

    @field_validator("nome")
    @classmethod
    def checar_nome(cls, valor: str) -> str:
        return validar_nome(valor)

    @field_validator("poligono")
    @classmethod
    def checar_poligono(cls, valor: list[Vertice]) -> list[Vertice]:
        return validar_poligono(valor)


class AreaAtualizacao(BaseModel):
    """Alteração de área: só os campos enviados mudam. `fk_motorista: null` tira o motorista."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [{"fk_motorista": 3}]})

    nome: str | None = Field(default=None, max_length=100)
    fk_motorista: int | None = Field(default=None, gt=0)
    poligono: list[Vertice] | None = Field(default=None, max_length=500)
    status: StatusCadastro | None = None

    @field_validator("nome")
    @classmethod
    def checar_nome(cls, valor: str | None) -> str | None:
        return None if valor is None else validar_nome(valor)

    @field_validator("poligono")
    @classmethod
    def checar_poligono(cls, valor: list[Vertice] | None) -> list[Vertice] | None:
        return None if valor is None else validar_poligono(valor)


class MotoristaDaArea(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str


class AreaResposta(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    status: StatusCadastro
    fk_motorista: int | None
    motorista: MotoristaDaArea | None
    poligono: list[Vertice] = Field(description="Vértices como [latitude, longitude].")

    @model_validator(mode="before")
    @classmethod
    def converter_coordenadas(cls, origem):
        if hasattr(origem, "coordenadas"):
            return {
                "id": origem.id,
                "nome": origem.nome,
                "status": origem.status,
                "fk_motorista": origem.fk_motorista,
                "motorista": origem.motorista,
                "poligono": poligono_para_mapa(origem.coordenadas),
            }
        return origem
