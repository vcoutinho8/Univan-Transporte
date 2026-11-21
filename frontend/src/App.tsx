import { Navigate, Route, Routes } from 'react-router-dom'

import PaginaEstudantes from './modules/estudante/StudentsPage.tsx'
import PaginaMapa from './modules/mapa/MapPage.tsx'
import PaginaPainel from './modules/painel/DashboardPage.tsx'
import PaginaRelatorio from './modules/relatorio/ReportViewPage.tsx'
import PaginaRelatorios from './modules/relatorio/ReportsPage.tsx'
import PaginaVeiculos from './modules/veiculo/VehiclesPage.tsx'
import PaginaViagens from './modules/viagem/TripsPage.tsx'
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
        <Route path="passageiros" element={<PaginaEstudantes />} />
        <Route path="veiculos" element={<PaginaVeiculos />} />
        <Route path="mapa" element={<PaginaMapa />} />
        <Route path="viagens" element={<PaginaViagens />} />
        <Route path="relatorios" element={<PaginaRelatorios />} />
        <Route path="relatorios/:id" element={<PaginaRelatorio />} />
        {/* Bairros e rotas viraram abas da tela de mapa; os endereços antigos continuam valendo. */}
        <Route path="bairros" element={<Navigate to="/mapa?aba=bairros" replace />} />
        <Route path="rotas" element={<Navigate to="/mapa?aba=rotas" replace />} />

        {/* Itens do menu ainda não construídos abrem a tela "Em construção". */}
        {ITENS_MENU.filter((item) => !item.pronto).map((item) => (
          <Route key={item.para} path={item.para} element={<PaginaEmConstrucao item={item} />} />
        ))}

        <Route path="*" element={<PaginaNaoEncontrada />} />
      </Route>
    </Routes>
  )
}
