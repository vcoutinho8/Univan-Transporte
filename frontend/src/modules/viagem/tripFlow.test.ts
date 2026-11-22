import { describe, expect, it } from 'vitest'

import {
  duracaoDaViagem,
  enderecoCurto,
  estaABordo,
  jornadaTerminou,
  paradasDeDesembarque,
  progresso,
  proximoPassageiro,
} from './tripFlow.ts'
import type { Chamada, StatusChamada } from './types.ts'

function umaChamada(id: number, status: StatusChamada): Chamada {
  return {
    estudante: {
      id,
      nome: `Passageiro ${id}`,
      apelido: null,
      celular: '27998880021',
      endereco: { logradouro: 'Rua Getúlio Vargas', numero: '310', complemento: null, bairro: 'Centro' },
    },
    status,
    horario_previsto: '06:30:00',
    horario_aviso: null,
    horario_embarque: null,
    horario_desembarque: null,
  }
}

describe('andamento da viagem', () => {
  const chamadas = [umaChamada(1, 'presente'), umaChamada(2, 'nao_vai'), umaChamada(3, 'pendente'), umaChamada(4, 'pendente')]

  it('o próximo é o primeiro pendente, pulando quem avisou que não vai', () => {
    expect(proximoPassageiro(chamadas)?.estudante.id).toBe(3)
    expect(proximoPassageiro([umaChamada(1, 'presente'), umaChamada(2, 'ausente')])).toBeNull()
  })

  it('progresso conta só a fila (sem quem não vai)', () => {
    expect(progresso(chamadas)).toEqual({ atendidos: 1, total: 3 })
  })

  it('endereço curto, com e sem número', () => {
    expect(enderecoCurto(chamadas[0])).toBe('Rua Getúlio Vargas, 310 · Centro')
    const semNumero = umaChamada(5, 'pendente')
    semNumero.estudante.endereco.numero = null
    expect(enderecoCurto(semNumero)).toBe('Rua Getúlio Vargas · Centro')
  })

  it('duração da viagem', () => {
    expect(duracaoDaViagem({ horario_saida: '2026-11-23T06:30:00', horario_chegada: '2026-11-23T07:05:00' })).toBe('35 min')
    expect(duracaoDaViagem({ horario_saida: '2026-11-23T06:00:00', horario_chegada: '2026-11-23T07:05:00' })).toBe('1 h 05 min')
    expect(duracaoDaViagem({ horario_saida: '2026-11-23T06:00:00', horario_chegada: null })).toBeNull()
  })
})

describe('desembarque', () => {
  type ComDestino = ReturnType<typeof umaChamada> & { fk_viagem: number; instituicao: { nome: string } }
  const naFila = (id: number, status: StatusChamada, viagem: number, faculdade: string, bairro = 'Centro', desceu = false): ComDestino => {
    const c = umaChamada(id, status)
    c.estudante.endereco.bairro = bairro
    c.horario_desembarque = desceu ? '2026-11-23T07:30:00' : null
    return { ...c, fk_viagem: viagem, instituicao: { nome: faculdade } }
  }
  const fila = [
    naFila(1, 'presente', 10, 'UVV', 'Praia do Morro'),
    naFila(2, 'ausente', 10, 'UVV'),
    naFila(3, 'presente', 20, 'Multivix', 'Centro', true),
    naFila(4, 'presente', 10, 'UVV', 'Centro'),
  ]

  it('a bordo = embarcou e não desceu', () => {
    expect(fila.filter(estaABordo).map((c) => c.estudante.id)).toEqual([1, 4])
  })

  it('ida: uma parada por faculdade, só com quem embarcou', () => {
    const paradas = paradasDeDesembarque(fila, 'ida')
    expect(paradas.map((p) => [p.titulo, p.passageiros.map((c) => c.estudante.id)])).toEqual([
      ['UVV', [1, 4]],
      ['Multivix', [3]],
    ])
  })

  it('volta: uma parada por passageiro, por bairro', () => {
    expect(paradasDeDesembarque(fila, 'volta').map((p) => p.titulo)).toEqual(['Passageiro 3', 'Passageiro 4', 'Passageiro 1'])
  })

  it('termina quando ninguém está pendente nem a bordo', () => {
    expect(jornadaTerminou(fila)).toBe(false)
    expect(jornadaTerminou([naFila(1, 'presente', 10, 'UVV', 'Centro', true), naFila(2, 'ausente', 10, 'UVV')])).toBe(true)
  })
})
