import Icone from '../components/Icon.tsx'
import Logo from '../components/Logo.tsx'

interface Propriedades {
  aoAbrirMenu: () => void
}

/**
 * Barra superior, só no celular/tablet: botão do menu, logo e usuário.
 * No desktop ela some para o conteúdo começar no topo da tela (o usuário fica no rodapé do
 * menu lateral). O bloco de usuário é fixo por enquanto: o login (RF1) ainda não existe.
 */
export default function BarraSuperior({ aoAbrirMenu }: Propriedades) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/90 px-4 backdrop-blur lg:hidden">
      <button onClick={aoAbrirMenu} className="rounded-lg p-1.5 text-marinho hover:bg-fundo" aria-label="Abrir menu">
        <Icone nome="menu" className="h-6 w-6" />
      </button>
      <Logo className="w-28" />
      <span className="ml-auto grid h-9 w-9 place-items-center rounded-full bg-marinho text-white" title="Administrador">
        <Icone nome="usuario" className="h-5 w-5" />
      </span>
    </header>
  )
}
