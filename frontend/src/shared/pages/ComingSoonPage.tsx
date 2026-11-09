import { Link } from 'react-router-dom'

import Icone from '../components/Icon.tsx'
import type { ItemMenu } from '../layout/menu.ts'

/** Tela provisória para itens do menu que ainda não foram construídos. */
export default function PaginaEmConstrucao({ item }: { item: ItemMenu }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-200/70">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-laranja/10 text-laranja">
        <Icone nome={item.icone} className="h-8 w-8" />
      </span>
      <p className="mt-6 text-xs font-bold tracking-widest text-laranja uppercase">{item.requisito} · Em construção</p>
      <h1 className="mt-2 text-2xl font-extrabold text-marinho">{item.rotulo}</h1>
      <p className="mt-3 text-sm text-slate-500">{item.descricao}</p>
      <Link to="/" className="mt-8 inline-block text-sm font-semibold text-laranja hover:underline">
        Voltar para o painel
      </Link>
    </div>
  )
}
