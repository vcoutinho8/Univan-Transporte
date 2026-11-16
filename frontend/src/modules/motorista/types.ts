import type { StatusCadastro } from '../../shared/types/api.ts'

/** Motorista resumido (MotoristaResumo). */
export interface Motorista {
  id: number
  nome: string
  celular: string | null
  status: StatusCadastro
}
