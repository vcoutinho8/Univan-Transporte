import type { SituacaoNoSentido } from './types.ts'

export type TomSituacao = 'vai' | 'nao_vai' | 'tardio' | 'embarcou' | 'faltou' | 'sem_viagem'

/** Como mostrar a situação de um sentido: texto curto e tom da etiqueta. */
export function situacaoParaTela(s: SituacaoNoSentido | null): { texto: string; tom: TomSituacao } {
  if (!s) return { texto: 'Sem viagem', tom: 'sem_viagem' }
  if (s.status === 'nao_vai') return s.tardio ? { texto: 'Não vai · última hora', tom: 'tardio' } : { texto: 'Não vai', tom: 'nao_vai' }
  if (s.status === 'presente') return { texto: 'Embarcou', tom: 'embarcou' }
  if (s.status === 'ausente') return { texto: 'Faltou', tom: 'faltou' }
  return { texto: s.viagem_status === 'em_andamento' ? 'Aguardando' : 'Vai', tom: 'vai' }
}

/** Ainda dá para avisar "não vou" neste sentido: esperado (pendente) e a viagem não terminou. */
export const podeAvisar = (s: SituacaoNoSentido | null) =>
  Boolean(s && s.status === 'pendente' && s.viagem_status !== 'concluida')

/** Ainda dá para desfazer o aviso neste sentido. */
export const podeDesfazer = (s: SituacaoNoSentido | null) =>
  Boolean(s && s.status === 'nao_vai' && s.viagem_status !== 'concluida')

/** O aviso feito agora seria de última hora (menos de 1 hora do horário previsto). */
export function seriaTardio(data: string, s: SituacaoNoSentido | null, agora = new Date()): boolean {
  if (!s?.horario_previsto) return false
  const [ano, mes, dia] = data.split('-').map(Number)
  const [h, m] = s.horario_previsto.split(':').map(Number)
  const limite = new Date(ano, mes - 1, dia, h, m).getTime() - 60 * 60 * 1000
  return agora.getTime() > limite
}
