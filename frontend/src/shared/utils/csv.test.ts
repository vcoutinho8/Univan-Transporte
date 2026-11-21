import { describe, expect, it } from 'vitest'

import { montarCsv } from './csv.ts'

describe('montarCsv', () => {
  it('usa ";" e quebra de linha do Windows, como o Excel em português espera', () => {
    expect(montarCsv(['Nome', 'Valor'], [['Ana', '550,00'], ['Bia', 10]])).toBe('Nome;Valor\r\nAna;550,00\r\nBia;10')
  })

  it('protege texto com ponto e vírgula, aspas ou quebra de linha', () => {
    expect(montarCsv(['A'], [['x;y'], ['diz "oi"'], ['l1\nl2']])).toBe('A\r\n"x;y"\r\n"diz ""oi"""\r\n"l1\nl2"')
  })

  it('célula vazia para nulo', () => {
    expect(montarCsv(['A', 'B'], [[null, undefined]])).toBe('A;B\r\n;')
  })
})
