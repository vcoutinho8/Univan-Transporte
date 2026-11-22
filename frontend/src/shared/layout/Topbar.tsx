import { ROTULOS_PERFIL } from '../auth/permissoes.ts'
import { iniciaisDoNome } from '../auth/sessao.ts'
import { useSessao } from '../auth/useSessao.ts'
import Icone from '../components/Icon.tsx'
import Logo from '../components/Logo.tsx'

interface Propriedades {
  aoAbrirMenu: () => void
}

/**
 * Barra superior, só no celular/tablet: botão do menu, logo e usuário.
 * No desktop ela some para o conteúdo começar no topo da tela (o usuário fica no rodapé do
 * menu lateral, com o botão de sair).
 */
export default function BarraSuperior({ aoAbrirMenu }: Propriedades) {
  const { usuario } = useSessao()
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/90 px-4 backdrop-blur lg:hidden">
      <button onClick={aoAbrirMenu} className="rounded-lg p-1.5 text-marinho hover:bg-fundo" aria-label="Abrir menu">
        <Icone nome="menu" className="h-6 w-6" />
      </button>
      <Logo className="w-28" />
      {usuario && (
        <button
          onClick={aoAbrirMenu}
          className="ml-auto grid h-9 w-9 place-items-center rounded-full bg-marinho text-xs font-bold text-white"
          title={`${usuario.nome} (${ROTULOS_PERFIL[usuario.perfil]})`}
        >
          {iniciaisDoNome(usuario.nome)}
        </button>
      )}
    </header>
  )
}
