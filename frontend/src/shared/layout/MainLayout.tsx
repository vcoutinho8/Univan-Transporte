import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import MenuLateral from './Sidebar.tsx'
import BarraSuperior from './Topbar.tsx'

/** Estrutura de todas as telas: menu lateral + barra superior + conteúdo da página (Outlet). */
export default function LayoutPrincipal() {
  const [menuAberto, setMenuAberto] = useState(false)
  // A `key` muda a cada tela: o React remonta o conteúdo e a animação de entrada roda de novo.
  const { pathname } = useLocation()

  return (
    <div className="min-h-screen">
      {/* Na impressão (relatórios) saem o menu e a barra: fica só o conteúdo. */}
      <div className="print:hidden">
        <MenuLateral aberto={menuAberto} aoFechar={() => setMenuAberto(false)} />
      </div>
      <div className="lg:pl-64 print:pl-0">
        <div className="print:hidden">
          <BarraSuperior aoAbrirMenu={() => setMenuAberto(true)} />
        </div>
        <main key={pathname} className="mx-auto max-w-[96rem] animate-surgir px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
