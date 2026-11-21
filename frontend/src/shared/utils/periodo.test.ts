import { describe, expect, it } from 'vitest'

import { PERIODOS_RAPIDOS, periodoPadrao, validarPeriodo } from './periodo.ts'

const HOJE = new Date(2026, 10, 21) // 21/11/2026
const atalho = (rotulo: string) => PERIODOS_RAPIDOS.find((p) => p.rotulo === rotulo)!.calcular(HOJE)

describe('período dos relatórios', () => {
  it('padrão: do dia 1º do mês até hoje', () => {
    expect(periodoPadrao(HOJE)).toEqual({ inicio: '2026-11-01', fim: '2026-11-21' })
  })

  it('atalhos', () => {
    expect(atalho('Hoje')).toEqual({ inicio: '2026-11-21', fim: '2026-11-21' })
    expect(atalho('Últimos 7 dias')).toEqual({ inicio: '2026-11-15', fim: '2026-11-21' })
    expect(atalho('Mês passado')).toEqual({ inicio: '2026-10-01', fim: '2026-10-31' })
  })

  it('valida datas faltando, invertidas e longas demais', () => {
    expect(validarPeriodo({ inicio: '2026-11-01', fim: '2026-11-21' })).toBeNull()
    expect(validarPeriodo({ inicio: '', fim: '2026-11-21' })).toMatch(/Informe/)
    expect(validarPeriodo({ inicio: '2026-11-21', fim: '2026-11-01' })).toMatch(/anterior/)
    expect(validarPeriodo({ inicio: '2025-01-01', fim: '2026-11-01' })).toMatch(/um ano/)
  })
})
