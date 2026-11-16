"""Schemas de saída das instituições."""

from pydantic import BaseModel, ConfigDict

from app.modules.endereco.endereco_schema import EnderecoResposta


class InstituicaoResposta(BaseModel):
    """Faculdade de destino, com o endereço (para o seletor do cadastro e o mapa)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    endereco: EnderecoResposta
