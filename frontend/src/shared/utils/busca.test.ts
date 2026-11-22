import { describe, expect, it } from 'vitest'

import { combinaBusca } from './busca.ts'

describe('combinaBusca', () => {
  const campos = ['João Pedro', '12345678901', 'ABC1D23', '27999990000']

  it('acha com e sem máscara', () => {
    expect(combinaBusca(campos, '123.456.789-01')).toBe(true)
    expect(combinaBusca(campos, '123456')).toBe(true)
    expect(combinaBusca(campos, 'abc-1d23')).toBe(true)
    expect(combinaBusca(campos, '(27) 99999-0000')).toBe(true)
  })

  it('ignora acento e maiúscula, e não mistura campos', () => {
    expect(combinaBusca(campos, 'joao')).toBe(true)
    expect(combinaBusca(campos, 'JOÃO PEDRO')).toBe(true)
    expect(combinaBusca(campos, '0127')).toBe(false) // fim de um campo + começo de outro
    expect(combinaBusca(campos, 'maria')).toBe(false)
  })
})
