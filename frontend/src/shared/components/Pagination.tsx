import { OPCOES_POR_PAGINA, type Paginacao } from '../hooks/usePagination.ts'
import Icone from './Icon.tsx'

/** Números das páginas com reticências: 1 … 4 5 6 … 12. */
function paginasVisiveis(atual: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const meio = [atual - 1, atual, atual + 1].filter((p) => p > 1 && p < total)
  return [1, ...(meio[0] > 2 ? ['…' as const] : []), ...meio, ...(meio[meio.length - 1] < total - 1 ? ['…' as const] : []), total]
}

/** Rodapé de tabela: "Mostrando 1–10 de 41", itens por página e navegação entre páginas. */
export default function RodapePaginacao({ paginacao, rotulo }: { paginacao: Paginacao; rotulo: string }) {
  const { pagina, setPagina, porPagina, setPorPagina, totalPaginas, total, inicio, visiveis } = paginacao
  if (total === 0) return null

  const botao = 'grid h-8 min-w-8 place-items-center rounded-lg px-2 text-sm font-bold transition-colors'
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
      <div className="flex items-center gap-3">
        <span>
          Mostrando <strong className="text-marinho">{inicio + 1}–{inicio + visiveis.length}</strong> de{' '}
          <strong className="text-marinho">{total}</strong> {rotulo}
        </span>
        <select
          aria-label="Itens por página"
          value={porPagina}
          onChange={(e) => setPorPagina(Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-marinho focus:border-laranja focus:outline-none"
        >
          {OPCOES_POR_PAGINA.map((n) => (
            <option key={n} value={n}>
              {n} por página
            </option>
          ))}
        </select>
      </div>

      {totalPaginas > 1 && (
        <nav className="flex items-center gap-1" aria-label="Páginas">
          <button
            onClick={() => setPagina(pagina - 1)}
            disabled={pagina === 1}
            aria-label="Página anterior"
            className={`${botao} text-marinho hover:bg-fundo disabled:opacity-30`}
          >
            <Icone nome="seta" className="h-4 w-4 rotate-180" />
          </button>
          {paginasVisiveis(pagina, totalPaginas).map((p, i) =>
            p === '…' ? (
              <span key={`r${i}`} className="px-1">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => setPagina(p)}
                aria-current={p === pagina ? 'page' : undefined}
                className={`${botao} ${p === pagina ? 'bg-laranja text-white shadow-sm shadow-laranja/30' : 'text-marinho hover:bg-fundo'}`}
              >
                {p}
              </button>
            ),
          )}
          <button
            onClick={() => setPagina(pagina + 1)}
            disabled={pagina === totalPaginas}
            aria-label="Próxima página"
            className={`${botao} text-marinho hover:bg-fundo disabled:opacity-30`}
          >
            <Icone nome="seta" className="h-4 w-4" />
          </button>
        </nav>
      )}
    </div>
  )
}
