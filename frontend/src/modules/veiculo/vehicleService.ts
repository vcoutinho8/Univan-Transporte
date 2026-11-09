import { requisitar } from '../../shared/services/api.ts'
import type { StatusCadastro } from '../../shared/types/api.ts'
import type { DadosVeiculo, Veiculo } from './types.ts'

export const servicoVeiculo = {
  listar: (filtros: { status?: StatusCadastro | ''; fk_empresa?: number } = {}) =>
    requisitar<Veiculo[]>('/veiculos', { parametros: filtros }),

  cadastrar: (dados: DadosVeiculo) => requisitar<Veiculo>('/veiculos', { metodo: 'POST', corpo: dados }),

  atualizar: (id: number, dados: Partial<DadosVeiculo>) =>
    requisitar<Veiculo>(`/veiculos/${id}`, { metodo: 'PATCH', corpo: dados }),

  /** O backend não apaga: apenas marca o veículo como inativo. */
  inativar: (id: number) => requisitar<Veiculo>(`/veiculos/${id}`, { metodo: 'DELETE' }),

  reativar: (id: number) => requisitar<Veiculo>(`/veiculos/${id}`, { metodo: 'PATCH', corpo: { status: 'ativo' } }),
}
