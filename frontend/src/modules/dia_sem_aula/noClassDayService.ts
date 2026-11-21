import { requisitar } from '../../shared/services/api.ts'
import type { DadosPeriodoSemAula, DiaSemAula, PeriodoSemAula, ResultadoCadastro } from './types.ts'

export const servicoDiaSemAula = {
  listar: (inicio: string, fim: string) => requisitar<DiaSemAula[]>('/dias-sem-aula', { parametros: { inicio, fim } }),

  /** Dias seguidos com o mesmo motivo e instituição, juntos num período. */
  periodos: (inicio: string, fim: string) =>
    requisitar<PeriodoSemAula[]>('/dias-sem-aula/periodos', { parametros: { inicio, fim } }),

  /** Um dia (início = fim) ou um período inteiro, para todas as instituições ou uma. */
  cadastrar: (dados: DadosPeriodoSemAula) =>
    requisitar<ResultadoCadastro>('/dias-sem-aula', { metodo: 'POST', corpo: dados }),

  remover: (ids: number[]) =>
    requisitar<{ removidos: number }>('/dias-sem-aula/remover', { metodo: 'POST', corpo: { ids } }),
}
