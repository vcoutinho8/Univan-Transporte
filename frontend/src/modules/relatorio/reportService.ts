import { requisitar } from '../../shared/services/api.ts'
import type { FiltrosRelatorioEstudantes, RelatorioEstudantesAtivos } from './types.ts'

export const servicoRelatorio = {
  estudantesAtivos: (filtros: FiltrosRelatorioEstudantes) =>
    requisitar<RelatorioEstudantesAtivos>('/relatorios/estudantes-ativos', { parametros: { ...filtros } }),
}
