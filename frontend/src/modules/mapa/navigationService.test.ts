import { describe, expect, it } from 'vitest'

import { formatarMetros, instrucao, type Manobra } from './navigationService.ts'

const m = (tipo: string, modificador: string | null = null, rua = '', saida: number | null = null): Manobra => ({ tipo, modificador, rua, saida, local: null })

describe('instruções de navegação em português', () => {
  it('curvas, retorno e seguir em frente', () => {
    expect(instrucao(m('turn', 'right', 'Rua Getúlio Vargas'))).toBe('Vire à direita na Rua Getúlio Vargas')
    expect(instrucao(m('turn', 'slight left'))).toBe('Vire levemente à esquerda')
    expect(instrucao(m('turn', 'uturn', 'Av. Beira Mar'))).toBe('Faça o retorno na Av. Beira Mar')
    expect(instrucao(m('new name', 'straight', 'Rodovia do Sol'))).toBe('Siga em frente pela Rodovia do Sol')
  })

  it('rotatória, fim da rua e chegada', () => {
    expect(instrucao(m('roundabout', 'right', 'Rua Alfa', 2))).toBe('Na rotatória, pegue a 2ª saída na Rua Alfa')
    expect(instrucao(m('end of road', 'left'))).toBe('No fim da rua, vire à esquerda')
    expect(instrucao(m('arrive'))).toBe('Você chegou à parada')
  })

  it('distâncias arredondadas como nos apps', () => {
    expect(formatarMetros(37)).toBe('40 m')
    expect(formatarMetros(230)).toBe('250 m')
    expect(formatarMetros(1840)).toBe('1,8 km')
  })
})
