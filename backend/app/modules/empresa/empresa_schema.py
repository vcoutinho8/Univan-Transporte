"""Schemas de saída de empresas."""

from pydantic import BaseModel, ConfigDict


class EmpresaResumo(BaseModel):
    """Dados resumidos de uma empresa (usados em listas e seletores)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    razao_social: str
    nome_fantasia: str | None
    cnpj: str
    telefone: str | None
