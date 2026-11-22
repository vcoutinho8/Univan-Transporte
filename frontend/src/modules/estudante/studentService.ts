import { requisitar } from '../../shared/services/api.ts'
import type { StatusCadastro } from '../../shared/types/api.ts'
import type { DadosEstudante, Estudante } from './types.ts'

export const servicoEstudante = {
  listar: (filtros: { status?: StatusCadastro | ''; fk_area?: number; fk_instituicao?: number } = {}) =>
    requisitar<Estudante[]>('/estudantes', { parametros: filtros }),

  cadastrar: (dados: DadosEstudante) => requisitar<Estudante>('/estudantes', { metodo: 'POST', corpo: dados }),

  atualizar: (id: number, dados: Partial<DadosEstudante>) =>
    requisitar<Estudante>(`/estudantes/${id}`, { metodo: 'PATCH', corpo: dados }),

  /** O backend não apaga: apenas marca o passageiro como inativo. */
  inativar: (id: number) => requisitar<Estudante>(`/estudantes/${id}`, { metodo: 'DELETE' }),

  reativar: (id: number) =>
    requisitar<Estudante>(`/estudantes/${id}`, { metodo: 'PATCH', corpo: { status: 'ativo' } }),
}
