import { describe, expect, it } from 'vitest'

import { DIAS_AVISO_CNH, cnhValida, cpfValido, diasParaVencer, situacaoCnh } from './driverUtils.ts'

// 21/11/2026, no meio da tarde: a hora do dia não pode mudar a conta.
const HOJE = new Date(2026, 10, 21, 15, 30)

describe('validade da CNH', () => {
  it('conta os dias até a validade', () => {
    expect(diasParaVencer('2026-11-21', HOJE)).toBe(0)
    expect(diasParaVencer('2026-11-22', HOJE)).toBe(1)
    expect(diasParaVencer('2026-11-20', HOJE)).toBe(-1)
    expect(diasParaVencer('2027-11-21', HOJE)).toBe(365)
  })

  it('vale até o último dia da validade, inclusive', () => {
    expect(situacaoCnh('2026-11-21', HOJE)).toBe('vencendo')
    expect(situacaoCnh('2026-11-20', HOJE)).toBe('vencida')
  })

  it('avisa nos últimos dias antes de vencer', () => {
    expect(situacaoCnh('2027-01-20', HOJE)).toBe('vencendo') // 60 dias
    expect(diasParaVencer('2027-01-20', HOJE)).toBe(DIAS_AVISO_CNH)
    expect(situacaoCnh('2027-01-21', HOJE)).toBe('valida') // 61 dias
  })

  it('CNH com validade distante está válida', () => {
    expect(situacaoCnh('2030-05-10', HOJE)).toBe('valida')
  })
})

describe('validação de CPF', () => {
  it('aceita CPFs válidos com ou sem máscara', () => {
    expect(cpfValido('123.456.789-09')).toBe(true)
    expect(cpfValido('12345678909')).toBe(true)
    expect(cpfValido('52998224725')).toBe(true)
    expect(cpfValido('11144477735')).toBe(true)
  })

  it('recusa CPFs com dígitos inválidos, repetidos ou tamanho incorreto', () => {
    expect(cpfValido('12345678901')).toBe(false)
    expect(cpfValido('111.111.111-11')).toBe(false)
    expect(cpfValido('00000000000')).toBe(false)
    expect(cpfValido('123456789')).toBe(false)
    expect(cpfValido('')).toBe(false)
  })
})

describe('validação de CNH', () => {
  it('aceita CNHs válidas', () => {
    expect(cnhValida('02650306461')).toBe(true)
    expect(cnhValida('026.503.064-61')).toBe(true)
    expect(cnhValida('12345678900')).toBe(true)
    expect(cnhValida('98765432109')).toBe(true)
    expect(cnhValida('10000000108')).toBe(true) // caso do resto 10 no 1º dígito
  })

  it('recusa CNHs inválidas', () => {
    expect(cnhValida('12345678901')).toBe(false)
    expect(cnhValida('02650306462')).toBe(false)
    expect(cnhValida('11111111111')).toBe(false)
    expect(cnhValida('1234567890')).toBe(false)
    expect(cnhValida('')).toBe(false)
  })
})
