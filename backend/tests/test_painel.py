"""Testes do resumo do painel com repositório em memória (sem banco)."""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.painel.painel_controller import obter_servico_painel
from app.modules.painel.painel_servico import ServicoPainel
from app.shared.enums import StatusViagem


class RepositorioPainelFalso:
    def __init__(self):
        self.dia_consultado = None

    def contar_veiculos_ativos(self):
        return 4

    def contar_motoristas_ativos(self):
        return 3

    def contar_estudantes_ativos(self):
        return 42

    def contar_rotas_ativas(self):
        return 5

    def contar_estudantes_sem_area(self):
        return 2

    def contar_viagens_por_status(self, dia):
        self.dia_consultado = dia
        return {StatusViagem.AGENDADA: 6, StatusViagem.CONCLUIDA: 2}


@pytest.fixture
def repositorio():
    repositorio = RepositorioPainelFalso()
    app.dependency_overrides[obter_servico_painel] = lambda: ServicoPainel(repositorio)
    yield repositorio
    app.dependency_overrides.clear()


def test_resumo_do_painel(repositorio):
    resposta = TestClient(app).get("/api/painel/resumo", params={"data": "2026-11-09"})
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["data"] == "2026-11-09"
    assert corpo["estudantes_ativos"] == 42
    assert corpo["estudantes_sem_area"] == 2
    assert corpo["viagens_hoje"] == {"agendada": 6, "em_andamento": 0, "concluida": 2, "cancelada": 0}
    assert repositorio.dia_consultado == date(2026, 11, 9)


def test_resumo_usa_hoje_quando_nao_informado(repositorio):
    resposta = TestClient(app).get("/api/painel/resumo")
    assert resposta.status_code == 200
    assert resposta.json()["data"] == date.today().isoformat()
