import { requisitar } from '../../shared/services/api.ts'
import type { Instituicao } from './types.ts'

export const servicoInstituicao = {
  listar: () => requisitar<Instituicao[]>('/instituicoes'),
}
