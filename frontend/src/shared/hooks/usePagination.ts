import { useEffect, useState } from 'react'

export const OPCOES_POR_PAGINA = [10, 20, 50]

/**
 * Paginação de uma lista já carregada (as listas do MVP vêm inteiras da API).
 * Quando `chaveFiltros` muda (busca, filtros), volta para a página 1.
 */
export function usePaginacao<T>(itens: T[], chaveFiltros = '', porPaginaInicial = OPCOES_POR_PAGINA[0]) {
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(porPaginaInicial)

  useEffect(() => setPagina(1), [chaveFiltros, porPagina])

  const totalPaginas = Math.max(1, Math.ceil(itens.length / porPagina))
  // Se a lista encolheu (ex.: inativou o último da página), fica na última página válida.
  const atual = Math.min(pagina, totalPaginas)
  const inicio = (atual - 1) * porPagina

  return {
    pagina: atual,
    setPagina,
    porPagina,
    setPorPagina,
    totalPaginas,
    total: itens.length,
    inicio,
    visiveis: itens.slice(inicio, inicio + porPagina),
  }
}

export type Paginacao = ReturnType<typeof usePaginacao>
