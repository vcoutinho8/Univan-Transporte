import { describe, expect, it } from 'vitest'

import { descreverGeracao } from './TripsPage.tsx'

describe('descreverGeracao', () => {
  it('descreve viagens e passageiros no singular e no plural', () => {
    expect(descreverGeracao(12, 40)).toBe('12 viagens de motorista e 40 passageiros na chamada.')
    expect(descreverGeracao(1, 1)).toBe('1 viagem de motorista e 1 passageiro na chamada.')
  })

  it('só passageiros novos, ou nada novo', () => {
    expect(descreverGeracao(0, 3)).toBe('3 passageiros na chamada.')
    expect(descreverGeracao(0, 0)).toBe('Nenhuma viagem nova.')
  })
})
