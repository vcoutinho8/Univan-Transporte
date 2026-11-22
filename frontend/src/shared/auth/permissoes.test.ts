import { describe, expect, it } from 'vitest'

import { abreTela, pode, telaInicial } from './permissoes.ts'

describe('permissões por perfil', () => {
  it('só o admin edita cadastros e gera viagens', () => {
    expect(pode('admin', 'cadastro.editar')).toBe(true)
    expect(pode('auxiliar', 'cadastro.editar')).toBe(false)
    expect(pode('auxiliar', 'viagem.gerar')).toBe(false)
    expect(pode('motorista', 'viagem.gerar')).toBe(false)
  })

  it('admin e motorista operam viagens; auxiliar só visualiza', () => {
    expect(pode('motorista', 'viagem.operar')).toBe(true)
    expect(pode('admin', 'viagem.operar')).toBe(true)
    expect(pode('auxiliar', 'viagem.operar')).toBe(false)
    expect(pode(undefined, 'viagem.operar')).toBe(false)
  })

  it('telas por perfil, com subcaminhos', () => {
    expect(abreTela('auxiliar', '/relatorios/passageiros-ativos')).toBe(true)
    expect(abreTela('motorista', '/passageiros')).toBe(false)
    expect(abreTela('motorista', '/viagens')).toBe(true)
    expect(abreTela('admin', '/minha-rota')).toBe(false)
    expect(abreTela('motorista', '/')).toBe(false)
    expect(telaInicial('motorista')).toBe('/minha-rota')
    expect(telaInicial('auxiliar')).toBe('/')
  })
})
