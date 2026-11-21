import { describe, expect, it } from 'vitest'

import { podeAvisar, podeDesfazer, seriaTardio, situacaoParaTela } from './callRules.ts'
import type { SituacaoNoSentido } from './types.ts'

const base: SituacaoNoSentido = {
  fk_viagem: 1,
  status: 'pendente',
  viagem_status: 'agendada',
  horario_previsto: '17:30:00',
  horario_aviso: null,
  horario_embarque: null,
  tardio: false,
}

describe('situação na tela', () => {
  it('textos por situação', () => {
    expect(situacaoParaTela(base)).toEqual({ texto: 'Vai', tom: 'vai' })
    expect(situacaoParaTela({ ...base, viagem_status: 'em_andamento' }).texto).toBe('Aguardando')
    expect(situacaoParaTela({ ...base, status: 'nao_vai' }).tom).toBe('nao_vai')
    expect(situacaoParaTela({ ...base, status: 'nao_vai', tardio: true })).toEqual({ texto: 'Não vai · última hora', tom: 'tardio' })
    expect(situacaoParaTela({ ...base, status: 'presente' }).texto).toBe('Embarcou')
    expect(situacaoParaTela({ ...base, status: 'ausente' }).texto).toBe('Faltou')
    expect(situacaoParaTela(null).tom).toBe('sem_viagem')
  })

  it('pode avisar e desfazer só enquanto a viagem não terminou', () => {
    expect(podeAvisar(base)).toBe(true)
    expect(podeAvisar({ ...base, viagem_status: 'concluida' })).toBe(false)
    expect(podeAvisar({ ...base, status: 'presente' })).toBe(false)
    expect(podeDesfazer({ ...base, status: 'nao_vai' })).toBe(true)
    expect(podeDesfazer(base)).toBe(false)
  })

  it('aviso de última hora: menos de 1 hora antes do horário', () => {
    expect(seriaTardio('2026-11-23', base, new Date(2026, 10, 23, 16, 0))).toBe(false)
    expect(seriaTardio('2026-11-23', base, new Date(2026, 10, 23, 16, 45))).toBe(true)
    expect(seriaTardio('2026-11-23', { ...base, horario_previsto: null }, new Date(2026, 10, 23, 23, 0))).toBe(false)
  })
})
