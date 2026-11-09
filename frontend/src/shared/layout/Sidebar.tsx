import { NavLink } from 'react-router-dom'

import Icone from '../components/Icon.tsx'
import Logo from '../components/Logo.tsx'
import { MENU } from './menu.ts'

interface Propriedades {
  /** No celular o menu fica escondido e abre por cima do conteúdo. */
  aberto: boolean
  aoFechar: () => void
}

/** Menu lateral fixo (desktop) ou gaveta deslizante (celular/tablet). */
export default function MenuLateral({ aberto, aoFechar }: Propriedades) {
  return (
    <>
      {/* Fundo escurecido atrás da gaveta, só no celular. */}
      <div
        onClick={aoFechar}
        className={`fixed inset-0 z-30 bg-marinho-escuro/40 transition-opacity lg:hidden ${
          aberto ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-white shadow-xl ring-1 ring-slate-200/70 transition-transform lg:translate-x-0 lg:shadow-none ${
          aberto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-20 items-center justify-between px-6">
          <Logo className="w-36" />
          <button onClick={aoFechar} className="text-slate-400 lg:hidden" aria-label="Fechar menu">
            <Icone nome="fechar" />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-4 pb-6">
          {MENU.map((grupo) => (
            <div key={grupo.titulo}>
              <p className="mb-2 px-3 text-[11px] font-bold tracking-widest text-slate-400 uppercase">
                {grupo.titulo}
              </p>
              <ul className="space-y-1">
                {grupo.itens.map((item) => (
                  <li key={item.para}>
                    <NavLink
                      to={item.para}
                      end
                      onClick={aoFechar}
                      className={({ isActive }) =>
                        `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                          isActive
                            ? 'bg-laranja text-white shadow-sm shadow-laranja/30'
                            : 'text-marinho hover:bg-fundo'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icone nome={item.icone} className="h-5 w-5 shrink-0" />
                          <span className="flex-1">{item.rotulo}</span>
                          {!item.pronto && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                isActive ? 'bg-white/20 text-white' : 'bg-fundo text-slate-400'
                              }`}
                            >
                              Em breve
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <p className="border-t border-slate-100 px-6 py-4 text-xs text-slate-400">UniVan · MVP v0.2</p>
      </aside>
    </>
  )
}
