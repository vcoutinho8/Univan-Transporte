import { requisitar } from '../../shared/services/api.ts'
import type { StatusCadastro } from '../../shared/types/api.ts'
import type { DadosMotorista, Motorista } from './types.ts'

export const servicoMotorista = {
  listar: (filtros: { status?: StatusCadastro | '' } = {}) =>
    requisitar<Motorista[]>('/motoristas', { parametros: filtros }),

  cadastrar: (dados: DadosMotorista) => requisitar<Motorista>('/motoristas', { metodo: 'POST', corpo: dados }),

  atualizar: (id: number, dados: Partial<DadosMotorista>) =>
    requisitar<Motorista>(`/motoristas/${id}`, { metodo: 'PATCH', corpo: dados }),

  /** O backend não apaga: apenas marca o motorista como inativo. */
  inativar: (id: number) => requisitar<Motorista>(`/motoristas/${id}`, { metodo: 'DELETE' }),

  reativar: (id: number) =>
    requisitar<Motorista>(`/motoristas/${id}`, { metodo: 'PATCH', corpo: { status: 'ativo' } }),
}
