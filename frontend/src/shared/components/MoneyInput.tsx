import type { InputHTMLAttributes } from 'react'

import { formatarMoeda, lerMoeda } from '../utils/formatar.ts'

type Propriedades = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  valor: number | null
  aoMudar: (valor: number | null) => void
}

/** Campo em Real com máscara: a pessoa digita só os números e eles entram como centavos (R$ 1.234,56). */
export default function CampoMoeda({ valor, aoMudar, className = 'campo', ...resto }: Propriedades) {
  return (
    <input
      inputMode="numeric"
      placeholder="R$ 0,00"
      {...resto}
      value={valor === null ? '' : formatarMoeda(valor)}
      onChange={(e) => aoMudar(lerMoeda(e.target.value))}
      className={`${className} tabular-nums`}
    />
  )
}
