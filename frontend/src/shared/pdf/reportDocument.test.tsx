// @vitest-environment node
import { renderToBuffer } from '@react-pdf/renderer'
import { describe, expect, it } from 'vitest'

import DocumentoRelatorio, { textoPdf } from './ReportDocument.tsx'
import type { DadosPdf } from './types.ts'

describe('textoPdf', () => {
  it('troca símbolos que a fonte do PDF não tem e mantém os acentos', () => {
    expect(textoPdf('Centro → Multivix — noite')).toBe('Centro > Multivix - noite')
    expect(textoPdf('Instituição São João…')).toBe('Instituição São João...')
    expect(textoPdf(null)).toBe('')
    expect(textoPdf(10)).toBe('10')
  })
})

describe('DocumentoRelatorio', () => {
  it('gera um PDF válido com tabela em várias páginas', async () => {
    const dados: DadosPdf = {
      titulo: 'Passageiros ativos',
      periodo: '01/11/2026 a 21/11/2026',
      filtros: [{ rotulo: 'Turno', valor: 'Noite' }],
      indicadores: [{ rotulo: 'Passageiros', valor: '120' }],
      colunas: [
        { titulo: 'Nome', largura: 50 },
        { titulo: 'Rota', largura: 30 },
        { titulo: 'Mensalidade', largura: 20, alinhar: 'right' },
      ],
      linhas: [
        { grupo: 'UVV (120)' },
        ...Array.from({ length: 120 }, (_, i) => [`Passageira ${i} Conceição`, 'Centro → UVV', 'R$ 550,00']),
      ],
      geradoEm: '23/11/2026 às 07:00',
    }
    const arquivo = await renderToBuffer(<DocumentoRelatorio dados={dados} />)
    expect(arquivo.subarray(0, 5).toString()).toBe('%PDF-')
    // 120 linhas não cabem numa folha A4.
    expect((arquivo.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1)
  }, 30000)
})
