import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import RotaProtegida from '../auth/RotaProtegida.tsx'
import TrocaDeSenhaObrigatoria from '../auth/TrocaDeSenha.tsx'
import { useSessao } from '../auth/useSessao.ts'
import BarraMotorista from './DriverTabBar.tsx'
import MenuLateral from './Sidebar.tsx'
import BarraSuperior from './Topbar.tsx'

/** Estrutura de todas as telas: menu lateral + barra superior + conteúdo da página (Outlet). */
export default function LayoutPrincipal() {
  const [menuAberto, setMenuAberto] = useState(false)
  // Menu só com ícones (desktop): a escolha fica guardada no navegador.
  const [recolhido, setRecolhido] = useState(() => localStorage.getItem('univan.menuRecolhido') === '1')
  const alternarRecolhido = () =>
    setRecolhido((atual) => {
      localStorage.setItem('univan.menuRecolhido', atual ? '0' : '1')
      return !atual
    })
  // A `key` muda a cada tela: o React remonta o conteúdo e a animação de entrada roda de novo.
  const { pathname } = useLocation()
  // Motorista no celular: abas embaixo, sem a barra do topo (o mapa ganha a tela).
  const motorista = useSessao().usuario?.perfil === 'motorista'

  return (
    <div className="min-h-screen">
      {/* Na impressão (relatórios) saem o menu e a barra: fica só o conteúdo. */}
      <div className="print:hidden">
        <MenuLateral
          aberto={menuAberto}
          aoFechar={() => setMenuAberto(false)}
          recolhido={recolhido}
          aoAlternarRecolhido={alternarRecolhido}
        />
      </div>
      <div className={`transition-[padding] duration-300 print:pl-0 ${recolhido ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="print:hidden">
          {motorista ? <BarraMotorista /> : <BarraSuperior aoAbrirMenu={() => setMenuAberto(true)} />}
        </div>
        <main
          key={pathname}
          className={`mx-auto max-w-[96rem] animate-surgir px-4 py-5 sm:px-6 lg:px-8 lg:py-6 ${motorista ? 'pb-24 lg:pb-6' : ''}`}
        >
          <RotaProtegida>
            <Outlet />
            <TrocaDeSenhaObrigatoria />
          </RotaProtegida>
        </main>
      </div>
    </div>
  )
}
