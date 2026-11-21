import { describe, expect, it } from 'vitest'

import {
  formatarCelular,
  formatarCep,
  formatarCpf,
  formatarData,
  formatarHorario,
  formatarMoeda,
  iniciais,
  nomeCurto,
} from './formatar.ts'

describe('máscaras de documento e telefone', () => {
  it('formata CPF completo e enquanto digita', () => {
    expect(formatarCpf('12345678909')).toBe('123.456.789-09')
    expect(formatarCpf('1234')).toBe('123.4')
    expect(formatarCpf('123.456.789-0999')).toBe('123.456.789-09') // corta o excesso
  })

  it('formata celular com 11 dígitos e fixo com 10', () => {
    expect(formatarCelular('27998880021')).toBe('(27) 99888-0021')
    expect(formatarCelular('2733611001')).toBe('(27) 3361-1001')
    expect(formatarCelular('27')).toBe('(27')
    expect(formatarCelular('')).toBe('')
  })

  it('formata CEP', () => {
    expect(formatarCep('29200180')).toBe('29200-180')
    expect(formatarCep('292')).toBe('292')
  })
})

describe('valores de tela', () => {
  it('mostra moeda em real e horário sem segundos', () => {
    expect(formatarMoeda(550).replace(/\s/g, ' ')).toBe('R$ 550,00')
    expect(formatarHorario('17:40:00')).toBe('17:40')
    expect(formatarHorario(null)).toBe('—')
  })

  it('mostra data no formato brasileiro', () => {
    expect(formatarData('2028-03-15')).toBe('15/03/2028')
    expect(formatarData('2028-03-15 10:00:00')).toBe('15/03/2028')
    expect(formatarData(null)).toBe('—')
    expect(formatarData('')).toBe('—')
  })

  it('encurta nomes para as etiquetas do mapa', () => {
    expect(nomeCurto('Ana Beatriz Souza')).toBe('Ana S.')
    expect(nomeCurto('Ana Beatriz Souza', 'Bia')).toBe('Bia')
    expect(nomeCurto('Ana')).toBe('Ana')
    expect(iniciais('Ana Beatriz Souza')).toBe('AS')
  })
})
