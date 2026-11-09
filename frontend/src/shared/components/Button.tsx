import type { ButtonHTMLAttributes } from 'react'

const VARIANTES = {
  primario: 'bg-laranja text-white shadow-sm hover:bg-laranja-claro',
  secundario: 'border border-slate-300 bg-white text-marinho hover:bg-fundo',
  perigo: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
  fantasma: 'text-marinho hover:bg-fundo',
}

interface Propriedades extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: keyof typeof VARIANTES
}

export default function Botao({ variante = 'primario', className = '', ...resto }: Propriedades) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTES[variante]} ${className}`}
      {...resto}
    />
  )
}
