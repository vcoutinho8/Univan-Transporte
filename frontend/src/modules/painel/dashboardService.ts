import { requisitar } from '../../shared/services/api.ts'
import type { DiaDaSemana, ResumoPainel } from './types.ts'

export const servicoPainel = {
  resumo: (data?: string) => requisitar<ResumoPainel>('/painel/resumo', { parametros: { data } }),

  /** Os 7 dias até `fim` (padrão: hoje): viagens e presenças. */
  semana: (fim?: string) => requisitar<DiaDaSemana[]>('/painel/semana', { parametros: { fim } }),
}
