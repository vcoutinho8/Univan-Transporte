import { Link } from 'react-router-dom'

import { useContagem } from '../hooks/useCounter.ts'
import Icone, { type NomeIcone } from './Icon.tsx'

interface Propriedades {
  rotulo: string
  valor: number | null | undefined
  icone: NomeIcone
  detalhe?: string
  /** Cor do quadrado do ícone. */
  tom?: 'laranja' | 'marinho' | 'verde' | 'ambar'
  /** Se informado, o cartão vira um link. */
  para?: string
  /** Atraso da animação de entrada (ms), para os cartões surgirem um depois do outro. */
  atraso?: number
}

const TONS = {
  laranja: 'bg-laranja/10 text-laranja group-hover:bg-laranja group-hover:text-white',
  marinho: 'bg-marinho/10 text-marinho group-hover:bg-marinho group-hover:text-white',
  verde: 'bg-emerald-100 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white',
  ambar: 'bg-amber-100 text-amber-600 group-hover:bg-amber-500 group-hover:text-white',
}

/** Cartão de indicador do painel: rótulo, número grande (que sobe ao carregar) e ícone colorido. */
export default function CartaoIndicador({ rotulo, valor, icone, detalhe, tom = 'laranja', para, atraso = 0 }: Propriedades) {
  const contagem = useContagem(valor)

  const conteudo = (
    <div
      style={{ animationDelay: `${atraso}ms` }}
      className="group flex h-full animate-surgir items-start justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-marinho/5"
    >
      <div>
        <p className="text-sm font-semibold text-slate-500">{rotulo}</p>
        {contagem === null ? (
          <div className="esqueleto mt-3 h-9 w-16" />
        ) : (
          <p className="mt-3 text-3xl font-extrabold tracking-tight text-marinho tabular-nums">{contagem}</p>
        )}
        {detalhe && (
          <p className="mt-3 flex items-center gap-1 text-xs text-slate-500">
            {detalhe}
            {para && (
              <Icone nome="seta" className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
            )}
          </p>
        )}
      </div>
      <span
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 ${TONS[tom]}`}
      >
        <Icone nome={icone} className="h-6 w-6" />
      </span>
    </div>
  )
  return para ? <Link to={para}>{conteudo}</Link> : conteudo
}
