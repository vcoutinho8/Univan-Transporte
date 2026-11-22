import { describe, expect, it } from 'vitest'

import { formatarMetros, instrucao, linhaRestante, type Manobra } from './navigationService.ts'

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

describe('linhaRestante', () => {
  // "L": norte e depois leste.
  const linha: [number, number][] = [
    [-20.0, -40.0],
    [-19.999, -40.0],
    [-19.999, -39.999],
  ]

  it('começa na rua, no ponto mais perto da van, e tira o trecho já andado', () => {
    const resto = linhaRestante(linha, [-19.9995, -39.99995])
    expect(resto[0][0]).toBeCloseTo(-19.9995, 6)
    expect(resto[0][1]).toBeCloseTo(-40.0, 6)
    expect(resto.slice(1)).toEqual(linha.slice(1))
  })

  it('depois da curva, só sobra o último trecho', () => {
    expect(linhaRestante(linha, [-19.999, -39.9995]).length).toBe(2)
  })
})
