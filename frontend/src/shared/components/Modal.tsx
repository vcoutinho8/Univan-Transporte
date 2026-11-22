import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import Icone, { type NomeIcone } from './Icon.tsx'

interface Propriedades {
  titulo: string
  descricao?: string
  /** Ícone grande no topo (confirmação, sucesso...). */
  icone?: NomeIcone
  tom?: 'laranja' | 'verde' | 'vermelho' | 'marinho'
  aoFechar: () => void
  children?: ReactNode
  /** Botões do rodapé. */
  acoes: ReactNode
}

const TONS = {
  laranja: 'bg-laranja/10 text-laranja',
  verde: 'bg-emerald-100 text-emerald-600',
  vermelho: 'bg-red-100 text-red-600',
  marinho: 'bg-marinho/10 text-marinho',
}

/**
 * Janela de confirmação ou de aviso, centralizada sobre a tela. Fecha com Esc ou clicando fora.
 * Para formulários longos, use a Gaveta.
 */
export default function Modal({ titulo, descricao, icone, tom = 'laranja', aoFechar, children, acoes }: Propriedades) {
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => evento.key === 'Escape' && aoFechar()
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', aoTeclar)
    return () => {
      document.body.style.overflow = overflowAnterior
      window.removeEventListener('keydown', aoTeclar)
    }
  }, [aoFechar])

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <div onClick={aoFechar} className="absolute inset-0 animate-aparecer bg-marinho-escuro/50 backdrop-blur-[2px]" />
      <div className="relative max-h-[92dvh] w-full max-w-md animate-surgir overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl">
        {/* No celular abre como gaveta de baixo: alça e botões grandes, fáceis de tocar */}
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
        <div className="px-6 pt-6 pb-4 text-center">
          {icone && (
            <span className={`mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full ${TONS[tom]}`}>
              <Icone nome={icone} className="h-7 w-7" />
            </span>
          )}
          <h2 className="text-lg font-extrabold text-marinho">{titulo}</h2>
          {descricao && <p className="mt-1 text-sm text-slate-500">{descricao}</p>}
          {children && <div className="mt-4 text-left">{children}</div>}
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:pb-4 [&>*]:w-full [&>*]:justify-center sm:[&>*]:w-auto">
          {acoes}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
