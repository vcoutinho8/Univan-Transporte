import { describe, expect, it } from 'vitest'

import { montarPdfEstudantes } from './activeStudentsPdf.ts'
import type { EstudanteDoRelatorio } from './types.ts'

function um(id: number, nome: string, extra: Partial<EstudanteDoRelatorio> = {}): EstudanteDoRelatorio {
  return {
    id, nome, cpf: '12345678909', celular: '27998880021', email: null,
    instituicao: { id: 1, nome: 'UVV' }, curso: null, turno: 'noite',
    area: { id: 1, nome: 'Centro' }, rota: { id: 3, nome: 'Centro → UVV' },
    horario_embarque: null, valor_mensal: '500.00', dia_vencimento: 10,
    presencas: 4, faltas: 1, avisos: 0, ...extra,
  }
}

const PERIODO = { inicio: '2026-11-01', fim: '2026-11-21' }

const estudantes = [
  um(1, 'Bia', { turno: 'manha' }),
  um(2, 'Ana', { area: null, rota: null }),
  um(3, 'Caio'),
]

describe('montarPdfEstudantes', () => {
  it('colunas fixas, com bairro e sem rota, somando 100% da largura', () => {
    const pdf = montarPdfEstudantes(estudantes, 'nenhum', [], 'agora', PERIODO)
    expect(pdf.colunas.map((c) => c.titulo)).toEqual(['Nome', 'Celular', 'Instituição', 'Turno', 'Bairro', 'Pres.', 'Faltas', 'Avisos'])
    expect(pdf.colunas.reduce((s, c) => s + c.largura, 0)).toBe(100)
    expect(pdf.linhas[1]).toEqual(['Ana', '(27) 99888-0021', 'UVV', 'Noite', 'Sem bairro', 4, 1, 0])
  })

  it('sem filtros, a lista de filtros fica vazia (o PDF não mostra o bloco)', () => {
    expect(montarPdfEstudantes(estudantes, 'nenhum', [], 'agora', PERIODO).filtros).toEqual([])
  })

  it('agrupa por turno na ordem do dia e informa o agrupamento', () => {
    const pdf = montarPdfEstudantes(estudantes, 'turno', [{ rotulo: 'Turno', valor: 'x' }], 'agora', PERIODO)
    expect(pdf.linhas.filter((l) => 'grupo' in l)).toEqual([
      { grupo: 'Manhã · 1 passageiro(s)' },
      { grupo: 'Noite · 2 passageiro(s)' },
    ])
    expect(pdf.filtros.at(-1)).toEqual({ rotulo: 'Agrupado por', valor: 'Turno' })
  })

  it('período e indicadores', () => {
    const pdf = montarPdfEstudantes(estudantes, 'nenhum', [], 'agora', PERIODO)
    expect(pdf.periodo).toBe('01/11/2026 a 21/11/2026')
    expect(pdf.indicadores.map((t) => t.valor)).toEqual(['3', '12', '3', expect.stringContaining('1.500,00')])
  })
})
