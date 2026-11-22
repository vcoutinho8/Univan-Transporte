import type { ReactNode } from 'react'

import Icone, { type NomeIcone } from './Icon.tsx'

const TONS = {
  marinho: { fundo: 'from-marinho/10 to-marinho/0', icone: 'bg-marinho text-white shadow-marinho/30', ponto: 'bg-marinho/30' },
  laranja: { fundo: 'from-laranja/15 to-laranja/0', icone: 'bg-laranja text-white shadow-laranja/30', ponto: 'bg-laranja/40' },
  ceu: { fundo: 'from-sky-400/15 to-sky-400/0', icone: 'bg-sky-500 text-white shadow-sky-500/30', ponto: 'bg-sky-400/40' },
  ambar: { fundo: 'from-amber-400/20 to-amber-400/0', icone: 'bg-amber-400 text-white shadow-amber-400/30', ponto: 'bg-amber-400/50' },
  verde: { fundo: 'from-emerald-400/15 to-emerald-400/0', icone: 'bg-emerald-500 text-white shadow-emerald-500/30', ponto: 'bg-emerald-400/50' },
} as const

export type TomEstadoVazio = keyof typeof TONS

interface Propriedades {
  icone: NomeIcone
  titulo: string
  descricao?: ReactNode
  /** Botão ou link de ação (ex.: "Gerar viagens", "Limpar filtros"). */
  acao?: ReactNode
  tom?: TomEstadoVazio
  /** Versão menor, para dentro de cartões e gavetas. */
  compacto?: boolean
  children?: ReactNode
}

/**
 * Estado vazio ilustrado: ícone grande sobre um halo com bolinhas flutuando, título, explicação
 * e uma ação. Usado sempre que uma tela ou lista não tem o que mostrar.
 */
export default function EstadoVazio({ icone, titulo, descricao, acao, tom = 'laranja', compacto = false, children }: Propriedades) {
  const cores = TONS[tom]
  return (
    <div className={`flex animate-surgir flex-col items-center text-center ${compacto ? 'px-4 py-6' : 'px-6 py-12'}`}>
      <div className={`relative grid place-items-center ${compacto ? 'h-20 w-20' : 'h-28 w-28'}`} aria-hidden="true">
        <span className={`absolute inset-0 rounded-full bg-gradient-to-b ${cores.fundo}`} />
        <span className={`absolute top-1 left-2 h-2 w-2 animate-flutuar rounded-full ${cores.ponto}`} />
        <span className={`absolute right-1 bottom-4 h-3 w-3 animate-flutuar rounded-full ${cores.ponto} [animation-delay:1.2s]`} />
        <span className={`absolute top-5 right-0 h-1.5 w-1.5 animate-flutuar rounded-full ${cores.ponto} [animation-delay:0.6s]`} />
        <span
          className={`relative grid place-items-center rounded-2xl shadow-lg ${cores.icone} ${compacto ? 'h-11 w-11' : 'h-14 w-14'} rotate-3 transition-transform hover:rotate-0`}
        >
          <Icone nome={icone} className={compacto ? 'h-5 w-5' : 'h-7 w-7'} />
        </span>
      </div>
      <p className={`font-extrabold text-marinho ${compacto ? 'mt-3 text-sm' : 'mt-4 text-lg'}`}>{titulo}</p>
      {descricao && <p className={`mt-1 max-w-md text-slate-500 ${compacto ? 'text-xs' : 'text-sm'}`}>{descricao}</p>}
      {children}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  )
}
