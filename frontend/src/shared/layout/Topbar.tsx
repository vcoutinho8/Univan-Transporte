import Icone from '../components/Icon.tsx'

interface Propriedades {
  aoAbrirMenu: () => void
}

const DATA_POR_EXTENSO = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(
  new Date(),
)
/** Ex.: "Segunda-feira, 9 de novembro" (só a primeira letra maiúscula). */
const HOJE = DATA_POR_EXTENSO.charAt(0).toUpperCase() + DATA_POR_EXTENSO.slice(1)

/**
 * Barra superior. O bloco de usuário é fixo por enquanto: o login (RF1) ainda não existe,
 * então todo acesso é tratado como administrador.
 */
export default function BarraSuperior({ aoAbrirMenu }: Propriedades) {
  return (
    <header className="sticky top-0 z-20 flex h-20 items-center gap-4 border-b border-slate-200/70 bg-white/90 px-4 backdrop-blur sm:px-8">
      <button onClick={aoAbrirMenu} className="text-marinho lg:hidden" aria-label="Abrir menu">
        <Icone nome="menu" className="h-6 w-6" />
      </button>

      <p className="hidden text-sm font-semibold text-slate-500 sm:block">{HOJE}</p>

      <div className="ml-auto flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-marinho text-white">
          <Icone nome="usuario" className="h-5 w-5" />
        </span>
        <div className="hidden leading-tight sm:block">
          <p className="text-sm font-bold text-marinho">Administrador</p>
          <p className="text-xs text-slate-500">Gestão da empresa</p>
        </div>
      </div>
    </header>
  )
}
