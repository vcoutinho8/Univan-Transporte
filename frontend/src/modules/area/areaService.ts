import { requisitar } from '../../shared/services/api.ts'
import type { StatusCadastro } from '../../shared/types/api.ts'
import type { Area, DadosArea } from './types.ts'

export const servicoArea = {
  listar: (filtros: { status?: StatusCadastro } = {}) => requisitar<Area[]>('/areas', { parametros: filtros }),

  /** Ao salvar, o banco recalcula a área de todos os passageiros. */
  cadastrar: (dados: DadosArea) => requisitar<Area>('/areas', { metodo: 'POST', corpo: dados }),

  atualizar: (id: number, dados: Partial<DadosArea> & { status?: StatusCadastro }) =>
    requisitar<Area>(`/areas/${id}`, { metodo: 'PATCH', corpo: dados }),

  /** Não apaga: a área sai do mapa e os passageiros dela ficam sem área. */
  inativar: (id: number) => requisitar<Area>(`/areas/${id}`, { metodo: 'DELETE' }),

  reativar: (id: number) => requisitar<Area>(`/areas/${id}`, { metodo: 'PATCH', corpo: { status: 'ativo' } }),
}
