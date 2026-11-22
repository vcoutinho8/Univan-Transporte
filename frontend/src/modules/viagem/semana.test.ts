import { describe, expect, it } from 'vitest'

import { descreverSemana, diasDaSemana, inicioDaSemana, partesDoDia } from './semana.ts'

describe('semana', () => {
  it('a semana começa na segunda', () => {
    expect(inicioDaSemana('2026-11-23')).toBe('2026-11-23') // segunda
    expect(inicioDaSemana('2026-11-22')).toBe('2026-11-16') // domingo é o último dia
    expect(inicioDaSemana('2026-11-21')).toBe('2026-11-16')
  })

  it('sete dias, de segunda a domingo, atravessando o mês', () => {
    expect(diasDaSemana('2026-12-02')).toEqual([
      '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06',
    ])
  })

  it('partes do dia e descrição da semana', () => {
    expect(partesDoDia('2026-11-21')).toEqual({ semana: 'Sáb', dia: 21, mes: 'nov', fimDeSemana: true })
    expect(partesDoDia('2026-11-23').fimDeSemana).toBe(false)
    expect(descreverSemana('2026-11-25')).toBe('23 a 29 de nov. de 2026')
    expect(descreverSemana('2026-12-02')).toBe('30 de nov. a 6 de dez. de 2026')
  })
})
