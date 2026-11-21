import { describe, expect, it } from 'vitest'

import { linkNavegacao, paradasRestantes } from './myRoute.ts'
import type { ChamadaDaJornada, Jornada, Sentido, StatusChamada } from './types.ts'

function chamada(id: number, status: StatusChamada, faculdade = 10, desceu = false): ChamadaDaJornada {
  return {
    estudante: {
      id,
      nome: `Passageiro ${id}`,
      apelido: null,
      celular: '27999990000',
      endereco: { logradouro: 'Rua A', numero: String(id), complemento: null, bairro: 'Centro', latitude: -20 - id / 100, longitude: -40 },
    },
    status,
    horario_previsto: null,
    horario_aviso: null,
    horario_embarque: status === 'presente' ? '2026-11-23T06:40:00' : null,
    horario_desembarque: desceu ? '2026-11-23T07:20:00' : null,
    fk_viagem: faculdade,
    instituicao: { id: faculdade, nome: `Faculdade ${faculdade}` },
  }
}

const jornada = (sentido: Sentido, fila: ChamadaDaJornada[]) => ({ sentido, fila }) as unknown as Jornada
const pontos = new Map([
  [10, [-20.5, -40.3] as [number, number]],
  [11, null],
])

describe('paradas da Minha rota', () => {
  it('na ida busca quem falta e depois vai às faculdades; quem não vai e quem já desceu ficam fora', () => {
    const fila = [chamada(1, 'presente'), chamada(2, 'pendente'), chamada(3, 'nao_vai'), chamada(4, 'pendente', 11), chamada(5, 'presente', 10, true)]
    const paradas = paradasRestantes(jornada('ida', fila), pontos)
    expect(paradas.map((p) => p.chave)).toEqual(['casa-10-2', 'casa-11-4', 'faculdade-deixar-10', 'faculdade-deixar-11'])
    expect(paradas[2].passageiros.map((c) => c.estudante.id)).toEqual([1, 2])
    expect(paradas[3].ponto).toBeNull() // faculdade sem ponto: na lista, fora do mapa
  })

  it('na volta embarca na faculdade e depois deixa cada um em casa', () => {
    const fila = [chamada(1, 'pendente'), chamada(2, 'presente'), chamada(3, 'ausente')]
    const paradas = paradasRestantes(jornada('volta', fila), pontos)
    expect(paradas.map((p) => p.chave)).toEqual(['faculdade-buscar-10', 'casa-10-2', 'casa-10-1'])
    expect(paradas[1].acao).toBe('deixar')
  })

  it('link de navegação do Google Maps', () => {
    expect(linkNavegacao([-20.5, -40.3])).toBe('https://www.google.com/maps/dir/?api=1&destination=-20.5,-40.3&travelmode=driving')
  })
})
