import type { ReactNode } from 'react'

interface Propriedades {
  titulo: string
  descricao?: string
  acoes?: ReactNode
}

export default function CabecalhoPagina({ titulo, descricao, acoes }: Propriedades) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-marinho sm:text-3xl">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-slate-500">{descricao}</p>}
      </div>
      {acoes}
    </div>
  )
}
