import { requisitar } from '../../shared/services/api.ts'
import type { ResumoPainel, Saude } from './types.ts'

export const servicoPainel = {
  resumo: (data?: string) => requisitar<ResumoPainel>('/painel/resumo', { parametros: { data } }),
  saude: () => requisitar<Saude>('/saude'),
}
