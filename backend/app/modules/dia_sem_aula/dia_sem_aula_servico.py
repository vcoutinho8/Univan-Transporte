"""Regras dos dias sem aula: cadastrar um dia ou um período inteiro (férias), listar e remover."""

from datetime import date, timedelta

from app.config.erros import DadosInvalidos, RecursoNaoEncontrado
from app.modules.dia_sem_aula.dia_sem_aula_model import DiaSemAula
from app.modules.dia_sem_aula.dia_sem_aula_repositorio import RepositorioDiaSemAula
from app.modules.dia_sem_aula.dia_sem_aula_schema import (
    PeriodoSemAula,
    PeriodoSemAulaCriacao,
    PeriodoSemAulaResultado,
    Referencia,
)
from app.modules.instituicao.instituicao_repositorio import RepositorioInstituicao


def agrupar_periodos(dias: list[DiaSemAula]) -> list[PeriodoSemAula]:
    """Junta dias seguidos com o mesmo motivo e a mesma instituição num período só.

    Ex.: 21/12 a 31/01 "Férias acadêmicas" (todas) vira uma linha, não 42. Períodos gerais vêm
    antes dos de uma instituição só quando começam no mesmo dia.
    """
    grupos: dict[tuple, list[list[DiaSemAula]]] = {}
    for dia in sorted(dias, key=lambda d: d.data):
        chave = (dia.fk_instituicao, dia.motivo)
        sequencias = grupos.setdefault(chave, [])
        if sequencias and (dia.data - sequencias[-1][-1].data).days == 1:
            sequencias[-1].append(dia)
        else:
            sequencias.append([dia])
    periodos = []
    for sequencias in grupos.values():
        for seq in sequencias:
            primeiro = seq[0]
            periodos.append(
                PeriodoSemAula(
                    inicio=primeiro.data,
                    fim=seq[-1].data,
                    dias=len(seq),
                    dias_uteis=sum(1 for d in seq if d.data.isoweekday() <= 5),
                    motivo=primeiro.motivo,
                    instituicao=Referencia.model_validate(primeiro.instituicao) if primeiro.instituicao else None,
                    ids=[d.id for d in seq],
                )
            )
    return sorted(periodos, key=lambda p: (p.inicio, p.instituicao is not None, p.instituicao.nome if p.instituicao else ""))


class ServicoDiaSemAula:
    def __init__(self, repositorio: RepositorioDiaSemAula, repositorio_instituicao: RepositorioInstituicao):
        self.repositorio = repositorio
        self.repositorio_instituicao = repositorio_instituicao

    def listar(self, inicio: date, fim: date, fk_instituicao: int | None = None) -> list[DiaSemAula]:
        if fim < inicio:
            raise DadosInvalidos("A data final não pode ser anterior à data inicial.")
        if (fim - inicio).days >= 400:
            raise DadosInvalidos("Escolha um período menor (no máximo 400 dias).")
        return self.repositorio.listar(inicio, fim, fk_instituicao)

    def periodos(self, inicio: date, fim: date, fk_instituicao: int | None = None) -> list[PeriodoSemAula]:
        return agrupar_periodos(self.listar(inicio, fim, fk_instituicao))

    def cadastrar(self, dados: PeriodoSemAulaCriacao) -> PeriodoSemAulaResultado:
        """Um registro por dia do período e por instituição (ou um geral, sem instituição).
        Dias já cadastrados para a mesma instituição não duplicam.

        Viagens já geradas nesses dias não são apagadas nem canceladas: a resposta diz quantas
        existem, para o administrador decidir na tela de viagens.
        """
        for id_instituicao in dados.fk_instituicoes:
            if self.repositorio_instituicao.buscar_por_id(id_instituicao) is None:
                raise DadosInvalidos("Instituição não encontrada.")
        alvos: list[int | None] = list(dados.fk_instituicoes) or [None]
        total = (dados.data_fim - dados.data_inicio).days + 1
        dias = [dados.data_inicio + timedelta(days=n) for n in range(total)]
        novos: list[DiaSemAula] = []
        viagens = 0
        for alvo in alvos:
            existentes = self.repositorio.datas_cadastradas(dados.data_inicio, dados.data_fim, alvo)
            novos += [DiaSemAula(data=dia, fk_instituicao=alvo, motivo=dados.motivo) for dia in dias if dia not in existentes]
            viagens += self.repositorio.contar_viagens(dados.data_inicio, dados.data_fim, alvo)
        if novos:
            self.repositorio.criar_varios(novos)
        return PeriodoSemAulaResultado(
            criados=len(novos),
            ja_existiam=total * len(alvos) - len(novos),
            viagens_geradas=viagens,
        )

    def remover(self, ids: list[int]) -> int:
        removidos = self.repositorio.remover(ids)
        if removidos == 0:
            raise RecursoNaoEncontrado("Nenhum dos dias informados foi encontrado.")
        return removidos
