import { requisitar } from '../../shared/services/api.ts'
import type { Empresa } from './types.ts'

export const servicoEmpresa = {
  listar: () => requisitar<Empresa[]>('/empresas'),
}
