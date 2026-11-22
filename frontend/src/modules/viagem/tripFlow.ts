import type { Chamada, Viagem } from './types.ts'

/**
 * Andamento da viagem passageiro a passageiro. As chamadas já vêm da API na ordem de embarque;
 * o próximo a buscar é o primeiro ainda pendente. Quem avisou que não vai fica fora da fila.
 */
export function proximoPassageiro(chamadas: Chamada[]): Chamada | null {
  return chamadas.find((c) => c.status === 'pendente') ?? null
}

/** Quantos dos passageiros da fila (todos menos quem avisou que não vai) já foram atendidos. */
export function progresso(chamadas: Chamada[]): { atendidos: number; total: number } {
  const fila = chamadas.filter((c) => c.status !== 'nao_vai')
  return { atendidos: fila.filter((c) => c.status !== 'pendente').length, total: fila.length }
}

/** "Rua Getúlio Vargas, 310 · Centro". */
export function enderecoCurto(chamada: Chamada): string {
  const { logradouro, numero, bairro } = chamada.estudante.endereco
  return `${logradouro}${numero ? `, ${numero}` : ''} · ${bairro}`
}

/** Duração em minutos entre a saída e a chegada ("35 min", "1 h 05 min"). */
export function duracaoDaViagem(viagem: Pick<Viagem, 'horario_saida' | 'horario_chegada'>): string | null {
  if (!viagem.horario_saida || !viagem.horario_chegada) return null
  const minutos = Math.round((Date.parse(viagem.horario_chegada) - Date.parse(viagem.horario_saida)) / 60000)
  if (minutos < 0) return null
  if (minutos < 60) return `${minutos} min`
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')} min`
}

/** Embarcou e ainda não teve o desembarque confirmado. */
export const estaABordo = (c: Chamada) => c.status === 'presente' && !c.horario_desembarque

/** Uma parada de desembarque: na ida, uma faculdade (com todos que descem nela); na volta, uma casa. */
export interface Parada<T extends Chamada> {
  chave: string
  titulo: string
  /** Na ida, a viagem (rota) da faculdade, para o "todos desceram aqui". */
  fk_viagem: number
  passageiros: T[]
}

/**
 * Paradas de desembarque da jornada, só com quem embarcou.
 * - Ida: uma parada por faculdade, na ordem em que aparecem na fila.
 * - Volta: uma parada por passageiro, agrupadas por bairro (e pelo nome dentro do bairro).
 */
export function paradasDeDesembarque<T extends Chamada & { fk_viagem: number; instituicao: { nome: string } }>(
  fila: T[],
  sentido: 'ida' | 'volta',
): Parada<T>[] {
  const embarcados = fila.filter((c) => c.status === 'presente')
  if (sentido === 'volta') {
    return [...embarcados]
      .sort(
        (a, b) =>
          a.estudante.endereco.bairro.localeCompare(b.estudante.endereco.bairro, 'pt-BR') ||
          a.estudante.nome.localeCompare(b.estudante.nome, 'pt-BR'),
      )
      .map((c) => ({ chave: `${c.fk_viagem}-${c.estudante.id}`, titulo: c.estudante.nome, fk_viagem: c.fk_viagem, passageiros: [c] }))
  }
  const paradas = new Map<number, Parada<T>>()
  for (const c of embarcados) {
    const parada = paradas.get(c.fk_viagem) ?? { chave: String(c.fk_viagem), titulo: c.instituicao.nome, fk_viagem: c.fk_viagem, passageiros: [] }
    parada.passageiros.push(c)
    paradas.set(c.fk_viagem, parada)
  }
  return [...paradas.values()]
}

/** Jornada terminada: ninguém pendente e ninguém a bordo. */
export const jornadaTerminou = (fila: Chamada[]) => !fila.some((c) => c.status === 'pendente' || estaABordo(c))
