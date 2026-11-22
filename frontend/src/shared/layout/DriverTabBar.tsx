import { NavLink } from 'react-router-dom'

import Icone, { type NomeIcone } from '../components/Icon.tsx'

const ABAS: { para: string; rotulo: string; icone: NomeIcone }[] = [
  { para: '/minha-rota', rotulo: 'Minha rota', icone: 'rota' },
  { para: '/viagens', rotulo: 'Viagens', icone: 'viagem' },
  { para: '/chamadas', rotulo: 'Avisos', icone: 'megafone' },
  { para: '/configuracoes', rotulo: 'Ajustes', icone: 'engrenagem' },
]

/**
 * Abas do motorista no celular (no lugar da barra do topo, que roubava espaço do mapa): as três
 * telas dele a um toque e a engrenagem (Configurações: conta, senha, casa e o "Sair").
 */
export default function BarraMotorista() {
  const aba = 'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-bold transition-colors'
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {ABAS.map((a) => (
          <NavLink key={a.para} to={a.para} className={({ isActive }) => `${aba} ${isActive ? 'text-laranja' : 'text-slate-400'}`}>
            {({ isActive }) => (
              <>
                <span className={`grid h-8 w-12 place-items-center rounded-full transition-colors ${isActive ? 'bg-laranja/10' : ''}`}>
                  <Icone nome={a.icone} className="h-5 w-5" />
                </span>
                {a.rotulo}
              </>
            )}
          </NavLink>
        ))}
    </nav>
  )
}
