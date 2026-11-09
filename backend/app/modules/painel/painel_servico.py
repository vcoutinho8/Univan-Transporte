"""Monta o resumo do painel a partir das contagens do repositório."""

from datetime import date

from app.modules.painel.painel_repositorio import RepositorioPainel
from app.modules.painel.painel_schema import ResumoPainel, ViagensDoDia


class ServicoPainel:
    def __init__(self, repositorio: RepositorioPainel):
        self.repositorio = repositorio

    def resumo(self, dia: date | None = None) -> ResumoPainel:
        dia = dia or date.today()
        viagens = {status.value: total for status, total in self.repositorio.contar_viagens_por_status(dia).items()}
        return ResumoPainel(
            data=dia,
            veiculos_ativos=self.repositorio.contar_veiculos_ativos(),
            motoristas_ativos=self.repositorio.contar_motoristas_ativos(),
            estudantes_ativos=self.repositorio.contar_estudantes_ativos(),
            rotas_ativas=self.repositorio.contar_rotas_ativas(),
            estudantes_sem_area=self.repositorio.contar_estudantes_sem_area(),
            viagens_hoje=ViagensDoDia(**viagens),
        )
