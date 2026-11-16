import { requisitar } from '../../shared/services/api.ts'
import type { StatusCadastro } from '../../shared/types/api.ts'
import type { Motorista } from './types.ts'

export const servicoMotorista = {
  listar: (filtros: { status?: StatusCadastro } = {}) => requisitar<Motorista[]>('/motoristas', { parametros: filtros }),
}
