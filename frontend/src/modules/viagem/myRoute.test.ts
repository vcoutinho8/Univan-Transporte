import { describe, expect, it } from 'vitest'

import { linkNavegacao, melhorOrdem, paradasRestantes } from './myRoute.ts'
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
    expect(paradas.map((p) => p.chave)).toEqual(['casa-10-2', 'casa-11-4', 'faculdade-deixar-10-0', 'faculdade-deixar-11-0'])
    expect(paradas[2].passageiros.map((c) => c.estudante.id)).toEqual([1, 2])
    expect(paradas[3].ponto).toBeNull() // faculdade sem ponto: na lista, fora do mapa
  })

  it('na volta embarca na faculdade e depois deixa cada um em casa', () => {
    const fila = [chamada(1, 'pendente'), chamada(2, 'presente'), chamada(3, 'ausente')]
    const paradas = paradasRestantes(jornada('volta', fila), pontos)
    expect(paradas.map((p) => p.chave)).toEqual(['faculdade-buscar-10-0', 'casa-10-2', 'casa-10-1'])
    expect(paradas[1].acao).toBe('deixar')
  })

  it('passageiro com parada escolhida desce nela (ex.: Biopráticas)', () => {
    const bio = { ...chamada(1, 'presente'), estudante: { ...chamada(1, 'presente').estudante, parada: { id: 7, nome: 'Biopráticas', latitude: -20.4, longitude: -40.2 } } }
    const paradas = paradasRestantes(jornada('ida', [bio, chamada(2, 'presente')]), pontos)
    expect(paradas.map((p) => p.titulo)).toEqual(['Faculdade 10 · Biopráticas', 'Faculdade 10'])
    expect(paradas[0].ponto).toEqual([-20.4, -40.2])
  })

  it('melhor ordem desfaz o vai e volta (2-opt) e respeita o fim fixo', () => {
    const linha: [number, number][] = [[-20.3, -40], [-20.1, -40], [-20.4, -40], [-20.2, -40]]
    expect(melhorOrdem(linha, [-20.0, -40], null)).toEqual([1, 3, 0, 2])
    expect(melhorOrdem(linha, null, [-20.0, -40])).toEqual([2, 0, 3, 1])
  })

  it('link de navegação do Google Maps', () => {
    expect(linkNavegacao([-20.5, -40.3])).toBe('https://www.google.com/maps/dir/?api=1&destination=-20.5,-40.3&travelmode=driving')
  })
})
