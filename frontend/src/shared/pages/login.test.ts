import { describe, expect, it } from 'vitest'

import { mascararLogin, normalizarLogin, validarLogin } from './LoginPage.tsx'

describe('login por CPF ou CNPJ', () => {
  it('mascara os números e deixa as letras', () => {
    expect(mascararLogin('20130140155')).toBe('201.301.401-55')
    expect(mascararLogin('112223330001')).toBe('11.222.333/0001')
    expect(mascararLogin('11222333000181')).toBe('11.222.333/0001-81')
    expect(mascararLogin('univan')).toBe('univan')
  })
  it('manda só os números e confere o tamanho', () => {
    expect(normalizarLogin(' 11.222.333/0001-81 ')).toBe('11222333000181')
    expect(validarLogin('201.301.401-5', 'x').usuario).toMatch(/11 números/)
    expect(validarLogin('201.301.401-55', 'x').usuario).toBeUndefined()
  })
})
