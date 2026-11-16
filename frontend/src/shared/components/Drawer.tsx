import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import Icone from './Icon.tsx'

interface Propriedades {
  titulo: string
  descricao?: string
  aoFechar: () => void
  children: ReactNode
  /** Largura máxima do painel (classe do Tailwind). */
  largura?: string
}

/**
 * Gaveta lateral: painel que desliza da direita por cima da tela, usado nos formulários de
 * cadastro e edição. Fecha com Esc ou clicando fora. Enquanto aberta, a página não rola.
 */
export default function Gaveta({ titulo, descricao, aoFechar, children, largura = 'max-w-xl' }: Propriedades) {
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
    <div className="fixed inset-0 z-[1000]" role="dialog" aria-modal="true" aria-label={titulo}>
      <div onClick={aoFechar} className="absolute inset-0 animate-aparecer bg-marinho-escuro/40 backdrop-blur-[2px]" />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full ${largura} animate-gaveta flex-col bg-white shadow-2xl`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-extrabold text-marinho">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-sm text-slate-500">{descricao}</p>}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-fundo hover:text-marinho"
          >
            <Icone nome="fechar" />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </aside>
    </div>,
    document.body,
  )
}
