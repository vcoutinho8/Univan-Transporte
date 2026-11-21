import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import Icone from '../../shared/components/Icon.tsx'
import CabecalhoPagina from '../../shared/components/PageHeader.tsx'
import { CATEGORIAS, RELATORIOS, type DefinicaoRelatorio } from './catalog.ts'
import BotaoFavorito from './FavoriteButton.tsx'
import { useFavoritos } from './useFavorites.ts'

function LinhaRelatorio({
  relatorio,
  favorito,
  aoFavoritar,
  mostrarModulo = false,
}: {
  relatorio: DefinicaoRelatorio
  favorito: boolean
  aoFavoritar: () => void
  /** Em Favoritos, mostra de qual módulo o relatório é. */
  mostrarModulo?: boolean
}) {
  const conteudo = (
    <>
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors ${
          relatorio.disponivel ? 'bg-laranja/10 text-laranja group-hover:bg-laranja group-hover:text-white' : 'bg-slate-100 text-slate-400'
        }`}
      >
        <Icone nome={relatorio.icone} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-2 font-bold ${relatorio.disponivel ? 'text-marinho' : 'text-slate-400'}`}>
          {relatorio.titulo}
          {mostrarModulo && (
            <span className="rounded-full bg-fundo px-2 py-0.5 text-[11px] font-semibold text-slate-500">{relatorio.categoria}</span>
          )}
        </span>
        <span className="block truncate text-sm text-slate-500">{relatorio.descricao}</span>
      </span>
      {relatorio.disponivel ? (
        <>
          <BotaoFavorito ativo={favorito} titulo={relatorio.titulo} aoAlternar={aoFavoritar} />
          <Icone nome="chevron" className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-laranja" />
        </>
      ) : (
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-400 uppercase">Em breve</span>
      )}
    </>
  )
  const base = 'group flex items-center gap-4 px-5 py-3.5'
  return relatorio.disponivel ? (
    <Link to={`/relatorios/${relatorio.id}`} className={`${base} transition-colors hover:bg-fundo/60`}>
      {conteudo}
    </Link>
  ) : (
    <div className={base} aria-disabled="true">
      {conteudo}
    </div>
  )
}

/**
 * Catálogo de relatórios (RF5): uma lista no centro da tela, agrupada por módulo
 * (Passageiros → Passageiros ativos, ...). Clicar num relatório abre a tela de geração.
 */
export default function PaginaRelatorios() {
  const { favoritos, ehFavorito, alternar } = useFavoritos()
  const [busca, setBusca] = useState('')

  const encontrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return termo ? RELATORIOS.filter((r) => `${r.titulo} ${r.descricao} ${r.categoria}`.toLowerCase().includes(termo)) : RELATORIOS
  }, [busca])

  // Favoritado sai do módulo e aparece só em Favoritos (sem repetir); desfavoritou, volta ao módulo.
  const listaFavoritos = favoritos
    .map((id) => encontrados.find((r) => r.id === id && r.disponivel))
    .filter((r): r is DefinicaoRelatorio => Boolean(r))
  const idsFavoritos = new Set(listaFavoritos.map((r) => r.id))
  const grupos = [
    { titulo: 'Favoritos', relatorios: listaFavoritos },
    ...CATEGORIAS.map((categoria) => ({
      titulo: categoria,
      relatorios: encontrados.filter((r) => r.categoria === categoria && !idsFavoritos.has(r.id)),
    })),
  ].filter((g) => g.relatorios.length > 0)

  return (
    <div className="mx-auto max-w-3xl">
      <CabecalhoPagina titulo="Relatórios" descricao="Escolha um relatório para definir o período, os filtros e gerar o PDF." />

      <label className="relative mb-5 block">
        <span className="sr-only">Buscar relatório</span>
        <Icone nome="busca" className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar relatório pelo nome ou assunto"
          className="campo mt-0 rounded-full bg-white py-3 pl-10"
        />
      </label>

      <div className="space-y-5">
        {grupos.map((grupo, i) => (
          <section
            key={grupo.titulo}
            className="animate-surgir overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70"
            style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}
          >
            <h2 className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-xs font-bold tracking-wide text-slate-500 uppercase">
              {grupo.titulo === 'Favoritos' && <Icone nome="estrela" className="h-3.5 w-3.5 fill-current text-amber-500" />}
              {grupo.titulo}
              <span className="ml-auto font-semibold tabular-nums">{grupo.relatorios.length}</span>
            </h2>
            <div className="divide-y divide-slate-100">
              {grupo.relatorios.map((r) => (
                <LinhaRelatorio
                  key={r.id}
                  relatorio={r}
                  favorito={ehFavorito(r.id)}
                  aoFavoritar={() => alternar(r.id)}
                  mostrarModulo={grupo.titulo === 'Favoritos'}
                />
              ))}
            </div>
          </section>
        ))}
        {grupos.length === 0 && (
          <p className="rounded-2xl bg-white py-10 text-center text-sm text-slate-500 ring-1 ring-slate-200/70">
            Nenhum relatório encontrado para "{busca}".
          </p>
        )}
      </div>
    </div>
  )
}
