import { requisitar } from '../../shared/services/api.ts'
import type {
  ChaveJornada,
  DiaDoCalendario,
  FiltrosViagem,
  Jornada,
  ResultadoGeracao,
  Viagem,
  ViagemDetalhe,
} from './types.ts'

export const servicoViagem = {
  /** Em ordem de saída. */
  listar: (filtros: FiltrosViagem = {}) => requisitar<Viagem[]>('/viagens', { parametros: { ...filtros } }),

  /** Com a lista de passageiros (chamadas) na ordem de embarque. */
  obter: (id: number) => requisitar<ViagemDetalhe>(`/viagens/${id}`),

  /** Resumo de cada dia do período (viagens, rotas do dia, feriados). */
  calendario: (inicio: string, fim: string) =>
    requisitar<DiaDoCalendario[]>('/viagens/calendario', { parametros: { inicio, fim } }),

  /** Cria as viagens e chamadas do dia. Pode repetir: só completa o que faltar. */
  gerar: (data: string) => requisitar<ResultadoGeracao>('/viagens/gerar', { metodo: 'POST', corpo: { data } }),

  /** Todas as rotas do motorista no turno e sentido, com a fila única de passageiros. */
  jornada: (chave: ChaveJornada) => requisitar<Jornada>('/viagens/jornada', { parametros: { ...chave } }),

  /** Inicia todas as rotas agendadas da jornada de uma vez. */
  iniciarJornada: (chave: ChaveJornada) =>
    requisitar<Jornada>('/viagens/jornada/iniciar', { metodo: 'POST', corpo: chave }),

  /** Conclui todas as rotas em andamento da jornada; pendentes viram ausentes. */
  concluirJornada: (chave: ChaveJornada) =>
    requisitar<Jornada>('/viagens/jornada/concluir', { metodo: 'POST', corpo: chave }),

  iniciar: (id: number) => requisitar<Viagem>(`/viagens/${id}/iniciar`, { metodo: 'POST' }),

  /** Quem ficou pendente vira ausente. */
  concluir: (id: number) => requisitar<Viagem>(`/viagens/${id}/concluir`, { metodo: 'POST' }),

  /** Passageiro embarcou: presente, com o horário de agora. */
  embarque: (id: number, estudante: number) =>
    requisitar<ViagemDetalhe>(`/viagens/${id}/chamadas/${estudante}/embarque`, { metodo: 'POST' }),

  /** Passageiro não apareceu no ponto: ausente. */
  falta: (id: number, estudante: number) =>
    requisitar<ViagemDetalhe>(`/viagens/${id}/chamadas/${estudante}/falta`, { metodo: 'POST' }),

  /** Passageiro desceu no destino (faculdade na ida, casa na volta). */
  desembarque: (id: number, estudante: number) =>
    requisitar<ViagemDetalhe>(`/viagens/${id}/chamadas/${estudante}/desembarque`, { metodo: 'POST' }),

  /** Todos os que estão a bordo nesta rota desceram (chegou na faculdade). */
  desembarcarTodos: (id: number) => requisitar<ViagemDetalhe>(`/viagens/${id}/desembarque`, { metodo: 'POST' }),

  /** Desfaz o último registro: desembarque, embarque ou falta. */
  desfazer: (id: number, estudante: number) =>
    requisitar<ViagemDetalhe>(`/viagens/${id}/chamadas/${estudante}/desfazer`, { metodo: 'POST' }),

  cancelar: (id: number) => requisitar<Viagem>(`/viagens/${id}/cancelar`, { metodo: 'POST' }),

  /** Troca motorista e/ou veículo só nesta viagem; os cadastros não mudam. */
  substituir: (id: number, dados: { fk_motorista?: number; fk_veiculo?: number }) =>
    requisitar<Viagem>(`/viagens/${id}`, { metodo: 'PATCH', corpo: dados }),
}
