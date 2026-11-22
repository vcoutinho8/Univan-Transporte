import Icone from '../../shared/components/Icon.tsx'

interface Propriedades {
  ativo: boolean
  titulo: string
  aoAlternar: () => void
}

/** Estrela de favoritar: vazia ou preenchida. */
export default function BotaoFavorito({ ativo, titulo, aoAlternar }: Propriedades) {
  const rotulo = ativo ? `Tirar ${titulo} dos favoritos` : `Favoritar ${titulo}`
  return (
    <button
      type="button"
      onClick={(evento) => {
        // Dentro de um cartão-link, favoritar não abre o relatório.
        evento.preventDefault()
        evento.stopPropagation()
        aoAlternar()
      }}
      aria-pressed={ativo}
      aria-label={rotulo}
      title={rotulo}
      className={`rounded-lg p-1.5 transition-all hover:scale-110 hover:bg-amber-50 ${
        ativo ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'
      }`}
    >
      <Icone nome="estrela" className={`h-5 w-5 ${ativo ? 'fill-current' : ''}`} />
    </button>
  )
}
