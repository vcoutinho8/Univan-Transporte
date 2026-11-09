import Icone from './Icon.tsx'

interface Propriedades {
  mensagem: string
  tipo?: 'erro' | 'sucesso' | 'aviso'
  aoFechar?: () => void
}

const ESTILOS = {
  erro: { cores: 'border-red-200 bg-red-50 text-red-800', icone: 'alerta' },
  aviso: { cores: 'border-amber-200 bg-amber-50 text-amber-800', icone: 'alerta' },
  sucesso: { cores: 'border-emerald-200 bg-emerald-50 text-emerald-800', icone: 'ok' },
} as const

export default function Alerta({ mensagem, tipo = 'erro', aoFechar }: Propriedades) {
  const estilo = ESTILOS[tipo]
  return (
    <div role="alert" className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${estilo.cores}`}>
      <Icone nome={estilo.icone} className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1 whitespace-pre-line">{mensagem}</p>
      {aoFechar && (
        <button type="button" onClick={aoFechar} aria-label="Fechar aviso" className="opacity-60 hover:opacity-100">
          <Icone nome="fechar" className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
