import { Link } from 'react-router-dom'

import Icone, { type NomeIcone } from './Icon.tsx'

interface Propriedades {
  rotulo: string
  valor: number | string | null | undefined
  icone: NomeIcone
  detalhe?: string
  /** Cor do quadrado do ícone. */
  tom?: 'laranja' | 'marinho' | 'verde' | 'ambar'
  /** Se informado, o cartão vira um link. */
  para?: string
}

const TONS = {
  laranja: 'bg-laranja/10 text-laranja',
  marinho: 'bg-marinho/10 text-marinho',
  verde: 'bg-emerald-100 text-emerald-600',
  ambar: 'bg-amber-100 text-amber-600',
}

/** Cartão de indicador do painel: rótulo, número grande e ícone colorido. */
export default function CartaoIndicador({ rotulo, valor, icone, detalhe, tom = 'laranja', para }: Propriedades) {
  const conteudo = (
    <div className="flex h-full items-start justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 transition-shadow hover:shadow-md">
      <div>
        <p className="text-sm font-semibold text-slate-500">{rotulo}</p>
        <p className="mt-3 text-3xl font-extrabold tracking-tight text-marinho tabular-nums">{valor ?? '–'}</p>
        {detalhe && <p className="mt-3 text-xs text-slate-500">{detalhe}</p>}
      </div>
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${TONS[tom]}`}>
        <Icone nome={icone} className="h-6 w-6" />
      </span>
    </div>
  )
  return para ? <Link to={para}>{conteudo}</Link> : conteudo
}
