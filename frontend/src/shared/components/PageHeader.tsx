import type { ReactNode } from 'react'

interface Propriedades {
  titulo: string
  descricao?: string
  acoes?: ReactNode
}

/**
 * Título da tela. Compacto de propósito (todas as telas usam): o conteúdo principal, como
 * tabelas e o mapa, precisa aparecer sem o usuário rolar a página.
 */
export default function CabecalhoPagina({ titulo, descricao, acoes }: Propriedades) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-marinho">{titulo}</h1>
        {descricao && <p className="mt-0.5 text-sm text-slate-500">{descricao}</p>}
      </div>
      {acoes}
    </div>
  )
}
