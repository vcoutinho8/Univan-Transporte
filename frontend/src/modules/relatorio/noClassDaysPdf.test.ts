import { describe, expect, it } from 'vitest'

import { descreverPeriodo, montarPdfDiasSemAula } from './noClassDaysPdf.ts'
import type { RelatorioDiasSemAula } from './types.ts'

const relatorio: RelatorioDiasSemAula = {
  gerado_em: '2026-11-21T10:00:00',
  data_inicio: '2026-12-01',
  data_fim: '2027-01-31',
  total_dias: 43,
  dias_uteis: 30,
  gerais: 42,
  periodos: [
    { inicio: '2026-12-21', fim: '2027-01-31', dias: 42, dias_uteis: 30, motivo: 'Férias acadêmicas', instituicao: null, ids: [1] },
    { inicio: '2026-12-04', fim: '2026-12-04', dias: 1, dias_uteis: 1, motivo: 'Recesso', instituicao: { id: 6, nome: 'UFES' }, ids: [2] },
  ],
}

describe('montarPdfDiasSemAula', () => {
  it('uma linha por período, com quem fica sem aula', () => {
    const pdf = montarPdfDiasSemAula(relatorio, [], 'agora')
    expect(pdf.periodo).toBe('01/12/2026 a 31/01/2027')
    expect(pdf.linhas).toEqual([
      ['21/12/2026 a 31/01/2027', 'Férias acadêmicas', 'Todas as instituições'],
      ['04/12/2026', 'Recesso', 'UFES'],
    ])
    expect(pdf.colunas.reduce((s, c) => s + c.largura, 0)).toBe(100)
    expect(pdf.indicadores.map((i) => i.valor)).toEqual(['43', '30', '42', '2'])
  })

  it('período de um dia só mostra a data', () => {
    expect(descreverPeriodo({ inicio: '2026-12-25', fim: '2026-12-25' })).toBe('25/12/2026')
  })
})
