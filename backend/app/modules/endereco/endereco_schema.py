"""Schemas de endereço, usados dentro de outros cadastros (o estudante, por exemplo)."""

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.shared.texto import limpar_texto, so_digitos


class EnderecoEntrada(BaseModel):
    """Endereço informado no formulário. Latitude e longitude vêm do pino no mapa."""

    model_config = ConfigDict(extra="forbid")

    cep: str
    logradouro: str = Field(max_length=100)
    numero: str | None = Field(default=None, max_length=10)
    complemento: str | None = Field(default=None, max_length=60)
    bairro: str = Field(max_length=50)
    cidade: str = Field(max_length=50)
    estado: str
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @field_validator("cep")
    @classmethod
    def validar_cep(cls, valor: str) -> str:
        cep = so_digitos(valor)
        if len(cep) != 8:
            raise ValueError("CEP inválido. Informe os 8 números.")
        return cep

    @field_validator("estado")
    @classmethod
    def validar_estado(cls, valor: str) -> str:
        uf = valor.strip().upper()
        if len(uf) != 2 or not uf.isalpha():
            raise ValueError("Informe a sigla do estado (ex.: SC).")
        return uf

    @field_validator("logradouro", "bairro", "cidade")
    @classmethod
    def validar_obrigatorio(cls, valor: str) -> str:
        texto = valor.strip()
        if not texto:
            raise ValueError("Campo obrigatório.")
        return texto

    @field_validator("numero", "complemento")
    @classmethod
    def validar_opcional(cls, valor: str | None) -> str | None:
        return limpar_texto(valor)


class EnderecoResposta(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cep: str
    logradouro: str
    numero: str | None
    complemento: str | None
    bairro: str
    cidade: str
    estado: str
    latitude: float | None
    longitude: float | None
