import { describe, expect, it } from 'vitest'

import type { Coordenada } from '../area/types.ts'
import { metrosEntre } from '../mapa/navigationService.ts'
import { pontoNaLinha } from './simulacao.ts'

// Um "L": ~111 m para o norte e depois ~111 m para o leste.
const linha: Coordenada[] = [
  [-20.0, -40.0],
  [-19.999, -40.0],
  [-19.999, -39.99894],
]

describe('pontoNaLinha', () => {
  it('anda pelo primeiro trecho apontando para o norte', () => {
    const p = pontoNaLinha(linha, 50)
    expect(metrosEntre(linha[0], p.posicao)).toBeCloseTo(50, 0)
    expect(p.rumo).toBeCloseTo(0, 0)
    expect(p.fim).toBe(false)
  })

  it('vira para o leste no segundo trecho', () => {
    const p = pontoNaLinha(linha, 150)
    expect(p.rumo).toBeCloseTo(90, 0)
  })

  it('para no último ponto quando passa do fim', () => {
    const p = pontoNaLinha(linha, 10_000)
    expect(p.posicao).toEqual(linha[2])
    expect(p.fim).toBe(true)
  })
})
