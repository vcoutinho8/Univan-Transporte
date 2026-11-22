import { requisitar } from '../../shared/services/api.ts'
import type { StatusCadastro } from '../../shared/types/api.ts'
import type { Estudante } from '../estudante/types.ts'
import type { Turno } from '../estudante/types.ts'
import type { DadosRota, OrdemDasParadas, Rota } from './types.ts'

export const servicoRota = {
  listar: (filtros: { status?: StatusCadastro; fk_motorista?: number } = {}) =>
    requisitar<Rota[]>('/rotas', { parametros: filtros }),

  /** Passageiros na ordem de embarque, pela mesma regra que gera as viagens do dia. */
  passageiros: (id: number) => requisitar<Estudante[]>(`/rotas/${id}/passageiros`),

  cadastrar: (dados: DadosRota) => requisitar<Rota>('/rotas', { metodo: 'POST', corpo: dados }),

  atualizar: (id: number, dados: Partial<DadosRota> & { status?: StatusCadastro }) =>
    requisitar<Rota>(`/rotas/${id}`, { metodo: 'PATCH', corpo: dados }),

  /** Não apaga: a rota para de gerar viagens, o histórico fica. */
  inativar: (id: number) => requisitar<Rota>(`/rotas/${id}`, { metodo: 'DELETE' }),

  /** Ordem atual e a melhor ordem calculada (casa do motorista → passageiros → faculdades). */
  ordem: (fk_motorista: number, turno: Turno) =>
    requisitar<OrdemDasParadas>('/rotas/ordem', { parametros: { fk_motorista, turno } }),

  /** Horários e totais de uma ordem escolhida à mão (vem em `sugerida`; não grava). */
  simularOrdem: (fk_motorista: number, turno: Turno, ordem: number[]) =>
    requisitar<OrdemDasParadas>('/rotas/ordem/simular', { metodo: 'POST', corpo: { fk_motorista, turno, ordem } }),

  /** Grava a ordem: cada passageiro recebe o horário de embarque calculado. */
  aplicarOrdem: (fk_motorista: number, turno: Turno, ordem: number[]) =>
    requisitar<OrdemDasParadas>('/rotas/ordem', { metodo: 'PUT', corpo: { fk_motorista, turno, ordem } }),

  reativar: (id: number) => requisitar<Rota>(`/rotas/${id}`, { metodo: 'PATCH', corpo: { status: 'ativo' } }),
}
