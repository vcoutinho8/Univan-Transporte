import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { usePaginacao } from '../hooks/usePagination.ts'
import RodapePaginacao from './Pagination.tsx'

const lista = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

describe('usePaginacao', () => {
  it('fatia a lista e calcula o total de páginas', () => {
    const { result } = renderHook(() => usePaginacao(lista(41)))
    expect(result.current.totalPaginas).toBe(5)
    expect(result.current.visiveis).toEqual(lista(10))
    act(() => result.current.setPagina(5))
    expect(result.current.visiveis).toEqual([41])
  })

  it('volta para a página 1 quando o filtro muda', () => {
    const { result, rerender } = renderHook(({ filtro }) => usePaginacao(lista(41), filtro), {
      initialProps: { filtro: '' },
    })
    act(() => result.current.setPagina(3))
    rerender({ filtro: 'praia do morro' })
    expect(result.current.pagina).toBe(1)
  })

  it('fica na última página válida se a lista encolher', () => {
    const { result, rerender } = renderHook(({ itens }) => usePaginacao(itens), { initialProps: { itens: lista(41) } })
    act(() => result.current.setPagina(5))
    rerender({ itens: lista(40) })
    expect(result.current.pagina).toBe(4)
  })
})

function TabelaDeTeste({ total }: { total: number }) {
  const paginacao = usePaginacao(lista(total))
  return (
    <>
      <ul>
        {paginacao.visiveis.map((n) => (
          <li key={n}>Passageiro {n}</li>
        ))}
      </ul>
      <RodapePaginacao paginacao={paginacao} rotulo="passageiros" />
    </>
  )
}

describe('RodapePaginacao', () => {
  it('mostra o intervalo e navega entre as páginas', async () => {
    const usuario = userEvent.setup()
    render(<TabelaDeTeste total={41} />)
    expect(screen.getByText(/Mostrando/).textContent).toContain('1–10 de 41 passageiros')

    await usuario.click(screen.getByRole('button', { name: 'Próxima página' }))
    expect(screen.getByText('Passageiro 11')).toBeTruthy()
    expect(screen.getByRole('button', { name: '2' }).getAttribute('aria-current')).toBe('page')

    await usuario.selectOptions(screen.getByLabelText('Itens por página'), '50')
    expect(screen.getAllByRole('listitem')).toHaveLength(41)
    expect(screen.queryByRole('navigation', { name: 'Páginas' })).toBeNull() // uma página só
  })

  it('some quando a lista está vazia', () => {
    render(<TabelaDeTeste total={0} />)
    expect(screen.queryByText(/Mostrando/)).toBeNull()
  })
})
