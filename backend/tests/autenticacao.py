"""Usuário simulado para os testes de unidade (com repositórios falsos, sem banco).

Esses testes conferem regras de cadastro, não o login: rodam como um administrador já logado.
O login e as permissões de verdade são testados em test_acesso.py, com banco.
"""

from app.config.seguranca import UsuarioLogado, usuario_logado
from app.main import app

ADMIN_SIMULADO = UsuarioLogado(id=1, perfil="admin", fk_empresa=1, fk_motorista=None)


def logar_como_admin() -> None:
    app.dependency_overrides[usuario_logado] = lambda: ADMIN_SIMULADO
