import { describe, expect, it } from 'vitest'

import { buscarRelatorio, CATEGORIAS, RELATORIOS } from './catalog.ts'
import { lerFavoritos, CHAVE_FAVORITOS } from './useFavorites.ts'

describe('catálogo de relatórios', () => {
  it('ids únicos, todos numa categoria conhecida', () => {
    expect(new Set(RELATORIOS.map((r) => r.id)).size).toBe(RELATORIOS.length)
    expect(RELATORIOS.every((r) => CATEGORIAS.includes(r.categoria))).toBe(true)
  })

  it('passageiros ativos está disponível', () => {
    expect(buscarRelatorio('passageiros-ativos')?.disponivel).toBe(true)
    expect(buscarRelatorio('nao-existe')).toBeUndefined()
  })
})

describe('favoritos', () => {
  it('lê só ids válidos e aguenta valor corrompido', () => {
    localStorage.setItem(CHAVE_FAVORITOS, JSON.stringify(['passageiros-ativos', 3, null]))
    expect(lerFavoritos()).toEqual(['passageiros-ativos'])
    localStorage.setItem(CHAVE_FAVORITOS, '{quebrado')
    expect(lerFavoritos()).toEqual([])
    localStorage.removeItem(CHAVE_FAVORITOS)
    expect(lerFavoritos()).toEqual([])
  })
})
