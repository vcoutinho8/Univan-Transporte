"""Empresa de quem está usando o sistema.

Os cadastros (veículos, por exemplo) pertencem à empresa logada, por isso o formulário não
pede a empresa. Enquanto a autenticação não existe, a empresa vem da variável de ambiente
EMPRESA_ATUAL_ID (padrão 1). Quando o login for implementado, só esta dependência muda: ela
passará a ler a empresa do usuário autenticado, e os controllers continuam iguais.
"""

from typing import Annotated

from fastapi import Depends

from app.config.configuracoes import obter_configuracoes


def obter_id_empresa_atual() -> int:
    return obter_configuracoes().id_empresa_atual


IdEmpresaAtual = Annotated[int, Depends(obter_id_empresa_atual)]
