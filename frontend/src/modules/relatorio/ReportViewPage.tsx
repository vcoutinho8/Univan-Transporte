import type { ComponentType } from 'react'
import { Link, useParams } from 'react-router-dom'

import Icone from '../../shared/components/Icon.tsx'
import CabecalhoPagina from '../../shared/components/PageHeader.tsx'
import PaginaNaoEncontrada from '../../shared/pages/NotFoundPage.tsx'
import RelatorioEstudantesAtivos from './ActiveStudentsReport.tsx'
import { buscarRelatorio } from './catalog.ts'
import BotaoFavorito from './FavoriteButton.tsx'
import { useFavoritos } from './useFavorites.ts'

/** Componente de cada relatório disponível, pelo `id` do catálogo. */
const COMPONENTES: Record<string, ComponentType> = {
  'passageiros-ativos': RelatorioEstudantesAtivos,
}

/** Tela de geração de um relatório: voltar ao catálogo, título, estrela de favorito e o relatório. */
export default function PaginaRelatorio() {
  const { id } = useParams()
  const { ehFavorito, alternar } = useFavoritos()
  const relatorio = buscarRelatorio(id)
  const Componente = relatorio && COMPONENTES[relatorio.id]

  if (!relatorio || !relatorio.disponivel || !Componente) return <PaginaNaoEncontrada />

  return (
    <>
      <Link to="/relatorios" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-laranja">
        <Icone nome="seta" className="h-4 w-4 rotate-180" />
        Relatórios / {relatorio.categoria}
      </Link>
      <CabecalhoPagina
        titulo={relatorio.titulo}
        descricao={relatorio.descricao}
        acoes={<BotaoFavorito ativo={ehFavorito(relatorio.id)} titulo={relatorio.titulo} aoAlternar={() => alternar(relatorio.id)} />}
      />
      <Componente />
    </>
  )
}
