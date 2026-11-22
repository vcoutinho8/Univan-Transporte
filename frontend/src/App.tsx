import { Navigate, Route, Routes } from 'react-router-dom'

import PaginaChamadas from './modules/chamada/CallsPage.tsx'
import PaginaConfiguracoes from './modules/configuracao/SettingsPage.tsx'
import PaginaFinancas from './modules/financeiro/FinancePage.tsx'
import PainelUnivan, { GestoresUnivan, InadimplenciaUnivan, PagamentosUnivan } from './modules/univan/UnivanPage.tsx'
import PaginaCalendario from './modules/dia_sem_aula/NoClassDaysPage.tsx'
import PaginaEstudantes from './modules/estudante/StudentsPage.tsx'
import PaginaMapa from './modules/mapa/MapPage.tsx'
import PaginaMotoristas from './modules/motorista/DriversPage.tsx'
import PaginaPainel from './modules/painel/DashboardPage.tsx'
import PaginaRelatorio from './modules/relatorio/ReportViewPage.tsx'
import PaginaRelatorios from './modules/relatorio/ReportsPage.tsx'
import PaginaVeiculos from './modules/veiculo/VehiclesPage.tsx'
import PaginaViagens from './modules/viagem/TripsPage.tsx'
import PaginaMinhaRota from './modules/viagem/MyRoutePage.tsx'
import LayoutPrincipal from './shared/layout/MainLayout.tsx'
import { ITENS_MENU } from './shared/layout/menu.ts'
import PaginaEmConstrucao from './shared/pages/ComingSoonPage.tsx'
import PaginaLogin from './shared/pages/LoginPage.tsx'
import PaginaRedefinirSenha from './shared/pages/ResetPasswordPage.tsx'
import PaginaNaoEncontrada from './shared/pages/NotFoundPage.tsx'

/**
 * Rotas da interface. O login fica fora do layout; o resto exige sessão (o LayoutPrincipal
 * confere e também barra as telas que o perfil não abre).
 */
export default function App() {
  return (
    <Routes>
      <Route path="login" element={<PaginaLogin />} />
      <Route path="redefinir-senha" element={<PaginaRedefinirSenha />} />
      <Route element={<LayoutPrincipal />}>
        <Route index element={<PaginaPainel />} />
        <Route path="passageiros" element={<PaginaEstudantes />} />
        <Route path="motoristas" element={<PaginaMotoristas />} />
        <Route path="veiculos" element={<PaginaVeiculos />} />
        <Route path="mapa" element={<PaginaMapa />} />
        <Route path="viagens" element={<PaginaViagens />} />
        <Route path="minha-rota" element={<PaginaMinhaRota />} />
        <Route path="calendario" element={<PaginaCalendario />} />
        <Route path="chamadas" element={<PaginaChamadas />} />
        <Route path="configuracoes" element={<PaginaConfiguracoes />} />
        <Route path="financas" element={<PaginaFinancas />} />
        <Route path="univan" element={<PainelUnivan />} />
        <Route path="univan/gestores" element={<GestoresUnivan />} />
        <Route path="univan/pagamentos" element={<PagamentosUnivan />} />
        <Route path="univan/inadimplencia" element={<InadimplenciaUnivan />} />
        <Route path="dias-sem-aula" element={<Navigate to="/calendario" replace />} />
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
