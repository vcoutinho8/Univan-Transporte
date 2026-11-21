import { requisitar } from '../../shared/services/api.ts'
import type { FiltrosRelatorioEstudantes, RelatorioDiasSemAula, RelatorioEstudantesAtivos } from './types.ts'

export const servicoRelatorio = {
  estudantesAtivos: (filtros: FiltrosRelatorioEstudantes) =>
    requisitar<RelatorioEstudantesAtivos>('/relatorios/estudantes-ativos', { parametros: { ...filtros } }),

  diasSemAula: (filtros: { data_inicio: string; data_fim: string; fk_instituicao?: number | '' }) =>
    requisitar<RelatorioDiasSemAula>('/relatorios/dias-sem-aula', { parametros: { ...filtros } }),
}
