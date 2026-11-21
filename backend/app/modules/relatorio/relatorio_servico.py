"""Montagem dos relatórios: busca os dados e calcula os totais."""

from collections import Counter
from datetime import date
from decimal import Decimal

from app.config.erros import DadosInvalidos
from app.modules.relatorio.relatorio_repositorio import RepositorioRelatorio
from app.modules.relatorio.relatorio_schema import (
    RelatorioEstudantesAtivos,
    TotalPorInstituicao,
    TotalPorTurno,
)
from app.modules.viagem.viagem_servico import agora
from app.shared.enums import Turno


PERIODO_MAXIMO_DIAS = 366


def validar_periodo(inicio: date, fim: date) -> None:
    """Todo relatório tem período: início até fim, no máximo um ano."""
    if fim < inicio:
        raise DadosInvalidos("Período inválido: a data final é anterior à data inicial.")
    if (fim - inicio).days >= PERIODO_MAXIMO_DIAS:
        raise DadosInvalidos("Período longo demais: escolha no máximo um ano.")


class ServicoRelatorio:
    def __init__(self, repositorio: RepositorioRelatorio):
        self.repositorio = repositorio

    def estudantes_ativos(
        self,
        data_inicio: date,
        data_fim: date,
        fk_instituicao: int | None = None,
        turno: Turno | None = None,
        fk_area: int | None = None,
    ) -> RelatorioEstudantesAtivos:
        validar_periodo(data_inicio, data_fim)
        estudantes = self.repositorio.estudantes_ativos(fk_instituicao=fk_instituicao, turno=turno, fk_area=fk_area)
        rotas = self.repositorio.rota_de_cada_estudante()
        frequencia = self.repositorio.frequencia_no_periodo(data_inicio, data_fim)
        for estudante in estudantes:
            estudante.rota = rotas.get(estudante.id)
            chamadas = frequencia.get(estudante.id, {})
            estudante.presencas = chamadas.get("presente", 0)
            estudante.faltas = chamadas.get("ausente", 0)
            estudante.avisos = chamadas.get("nao_vai", 0)

        instituicoes = {e.instituicao.id: e.instituicao for e in estudantes}
        por_instituicao = Counter(e.fk_instituicao for e in estudantes)
        por_turno = Counter(e.turno for e in estudantes)

        return RelatorioEstudantesAtivos(
            gerado_em=agora(),
            data_inicio=data_inicio,
            data_fim=data_fim,
            presencas=sum(e.presencas for e in estudantes),
            faltas=sum(e.faltas for e in estudantes),
            total=len(estudantes),
            valor_mensal_total=sum((e.valor_mensal for e in estudantes), Decimal("0")),
            sem_area=sum(1 for e in estudantes if e.fk_area is None),
            sem_rota=sum(1 for e in estudantes if e.rota is None),
            # Maior instituição primeiro; empate pelo nome.
            por_instituicao=[
                TotalPorInstituicao(instituicao=instituicoes[i], total=n)
                for i, n in sorted(por_instituicao.items(), key=lambda x: (-x[1], instituicoes[x[0]].nome))
            ],
            # Na ordem do dia: manhã, tarde, noite.
            por_turno=[TotalPorTurno(turno=t, total=por_turno[t]) for t in Turno if por_turno[t]],
            estudantes=estudantes,
        )
