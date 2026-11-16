import { describe, expect, it } from 'vitest'

import { QUADRADO_CENTRO, umaArea, umEstudante } from '../../test/fabricas.ts'
import { areaDoPonto, coordenadaDo, ordenarPorEmbarque, pontoNoPoligono } from './mapUtils.ts'

describe('ponto no polígono (mesma conta do trigger do banco)', () => {
  it('reconhece dentro e fora', () => {
    expect(pontoNoPoligono([-20.67, -40.5], QUADRADO_CENTRO)).toBe(true)
    expect(pontoNoPoligono([-20.7, -40.5], QUADRADO_CENTRO)).toBe(false)
  })

  it('escolhe a área de menor id quando duas se sobrepõem, como o banco', () => {
    const areas = [umaArea({ id: 7, nome: 'Grande' }), umaArea({ id: 3, nome: 'Pequena' })]
    expect(areaDoPonto([-20.67, -40.5], areas)?.nome).toBe('Pequena')
    expect(areaDoPonto([-20.9, -40.5], areas)).toBeNull()
  })
})

describe('passageiros no mapa', () => {
  it('só tem coordenada quem tem latitude e longitude', () => {
    expect(coordenadaDo(umEstudante({ ponto: [-20.67, -40.5] }))).toEqual([-20.67, -40.5])
    expect(coordenadaDo(umEstudante({ ponto: null }))).toBeNull()
  })

  it('ordena pelo horário de embarque e manda quem não tem horário para o fim', () => {
    const ordem = ordenarPorEmbarque([
      umEstudante({ id: 1, nome: 'Sem horário', horario_embarque: null }),
      umEstudante({ id: 2, nome: 'Tarde', horario_embarque: '17:40:00' }),
      umEstudante({ id: 3, nome: 'Cedo', horario_embarque: '17:05:00' }),
    ])
    expect(ordem.map((e) => e.nome)).toEqual(['Cedo', 'Tarde', 'Sem horário'])
  })
})
