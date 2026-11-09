import { useState } from 'react'
import { Outlet } from 'react-router-dom'

import MenuLateral from './Sidebar.tsx'
import BarraSuperior from './Topbar.tsx'

/** Estrutura de todas as telas: menu lateral + barra superior + conteúdo da página (Outlet). */
export default function LayoutPrincipal() {
  const [menuAberto, setMenuAberto] = useState(false)

  return (
    <div className="min-h-screen">
      <MenuLateral aberto={menuAberto} aoFechar={() => setMenuAberto(false)} />
      <div className="lg:pl-64">
        <BarraSuperior aoAbrirMenu={() => setMenuAberto(true)} />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
