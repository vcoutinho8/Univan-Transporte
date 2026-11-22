import { describe, expect, it } from 'vitest'

import { linhaCsv } from './ActiveStudentsReport.tsx'
import type { EstudanteDoRelatorio } from './types.ts'

const estudante: EstudanteDoRelatorio = {
  id: 1,
  nome: 'Larissa Coutinho',
  cpf: '12345678909',
  celular: '27998880021',
  email: null,
  instituicao: { id: 1, nome: 'UVV' },
  curso: 'Medicina',
  turno: 'noite',
  area: null,
  rota: null,
  horario_embarque: '17:20:00',
  valor_mensal: '550.00',
  dia_vencimento: 10,
  presencas: 18,
  faltas: 2,
  avisos: 1,
}

describe('linhaCsv', () => {
  it('formata documentos, turno, valor com vírgula e marca quem está sem bairro', () => {
    expect(linhaCsv(estudante)).toEqual([
      'Larissa Coutinho', '123.456.789-09', '(27) 99888-0021', '', 'UVV', 'Medicina', 'Noite',
      'Sem bairro', '17:20', '550,00', 10, 18, 2, 1,
    ])
  })
})
