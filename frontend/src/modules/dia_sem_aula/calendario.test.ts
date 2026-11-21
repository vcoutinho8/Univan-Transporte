import { describe, expect, it } from 'vitest'

import {
  diasAte,
  diasDoCalendario,
  diasNoPeriodo,
  inicioDoMes,
  intervalo,
  nomeDoMes,
  posicaoNaFaixa,
  proximaSelecao,
  somarMeses,
} from './calendario.ts'

describe('calendário do mês', () => {
  it('42 dias de segunda a domingo, começando na semana do dia 1º', () => {
    const dias = diasDoCalendario('2026-11-15')
    expect(dias).toHaveLength(42)
    expect(dias[0]).toBe('2026-10-26') // 01/11/2026 é domingo: a grade começa na segunda anterior
    expect(dias[6]).toBe('2026-11-01')
    expect(dias.at(-1)).toBe('2026-12-06')
  })

  it('mês, troca de mês e nome', () => {
    expect(inicioDoMes('2026-11-21')).toBe('2026-11-01')
    expect(somarMeses('2026-12-01', 1)).toBe('2027-01-01')
    expect(somarMeses('2026-01-01', -1)).toBe('2025-12-01')
    expect(nomeDoMes('2026-03-01')).toBe('Março de 2026')
  })

  it('seleção em dois cliques, em qualquer ordem', () => {
    const inicio = proximaSelecao(null, '2026-12-21')
    expect(inicio).toEqual({ inicio: '2026-12-21', fim: null })
    expect(proximaSelecao(inicio, '2027-01-31')).toEqual({ inicio: '2026-12-21', fim: '2027-01-31' })
    expect(proximaSelecao(inicio, '2026-12-10')).toEqual({ inicio: '2026-12-10', fim: '2026-12-21' })
    expect(proximaSelecao({ inicio: '2026-12-21', fim: '2026-12-22' }, '2026-12-01')).toEqual({ inicio: '2026-12-01', fim: null })
    expect(diasNoPeriodo('2026-12-21', '2027-01-31')).toBe(42)
  })
})

describe('arrastar para selecionar', () => {
  it('período em qualquer ordem', () => {
    expect(intervalo('2026-12-12', '2026-12-08')).toEqual({ inicio: '2026-12-08', fim: '2026-12-12' })
    expect(intervalo('2026-12-08', '2026-12-08')).toEqual({ inicio: '2026-12-08', fim: '2026-12-08' })
  })

  it('faixa contínua: pontas e quebras de linha', () => {
    const faixa = { inicio: '2026-12-10', fim: '2026-12-15' } // qui a ter
    expect(posicaoNaFaixa('2026-12-09', faixa)).toBeNull()
    expect(posicaoNaFaixa('2026-12-10', faixa)).toEqual({ abreLinha: true, fechaLinha: false, ponta: true })
    expect(posicaoNaFaixa('2026-12-13', faixa)).toEqual({ abreLinha: false, fechaLinha: true, ponta: false }) // domingo
    expect(posicaoNaFaixa('2026-12-14', faixa)).toEqual({ abreLinha: true, fechaLinha: false, ponta: false }) // segunda
    expect(posicaoNaFaixa('2026-12-15', faixa)?.fechaLinha).toBe(true)
  })

  it('dias até a data', () => {
    expect(diasAte('2026-12-25', '2026-11-21')).toBe(34)
    expect(diasAte('2026-11-21', '2026-11-21')).toBe(0)
  })
})
