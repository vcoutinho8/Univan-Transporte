import { Route, Routes } from 'react-router-dom'

import PaginaPainel from './modules/painel/DashboardPage.tsx'
import PaginaVeiculos from './modules/veiculo/VehiclesPage.tsx'
import LayoutPrincipal from './shared/layout/MainLayout.tsx'
import { ITENS_MENU } from './shared/layout/menu.ts'
import PaginaEmConstrucao from './shared/pages/ComingSoonPage.tsx'
import PaginaNaoEncontrada from './shared/pages/NotFoundPage.tsx'

/** Rotas da interface. Cada tela pronta aponta para a página do seu módulo. */
export default function App() {
  return (
    <Routes>
      <Route element={<LayoutPrincipal />}>
        <Route index element={<PaginaPainel />} />
        <Route path="veiculos" element={<PaginaVeiculos />} />

        {/* Itens do menu ainda não construídos abrem a tela "Em construção". */}
        {ITENS_MENU.filter((item) => !item.pronto).map((item) => (
          <Route key={item.para} path={item.para} element={<PaginaEmConstrucao item={item} />} />
        ))}

        <Route path="*" element={<PaginaNaoEncontrada />} />
      </Route>
    </Routes>
  )
}
