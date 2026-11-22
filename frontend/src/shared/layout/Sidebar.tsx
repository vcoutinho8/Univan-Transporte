import { NavLink, useNavigate } from 'react-router-dom'

import { abreTela, ROTULOS_PERFIL } from '../auth/permissoes.ts'
import { iniciaisDoNome } from '../auth/sessao.ts'
import { useSessao } from '../auth/useSessao.ts'
import Icone from '../components/Icon.tsx'
import Logo from '../components/Logo.tsx'
import { MENU } from './menu.ts'

interface Propriedades {
  /** No celular o menu fica escondido e abre por cima do conteúdo. */
  aberto: boolean
  aoFechar: () => void
  /** No desktop: só os ícones (o nome aparece ao passar o mouse). */
  recolhido: boolean
  aoAlternarRecolhido: () => void
}

/** Rótulo que aparece ao lado do ícone quando o menu está recolhido. */
function Dica({ texto }: { texto: string }) {
  return (
    <span className="pointer-events-none absolute top-1/2 left-full z-50 ml-3 hidden -translate-y-1/2 rounded-lg bg-marinho px-2.5 py-1.5 text-xs font-bold whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 lg:block">
      {texto}
    </span>
  )
}

/**
 * Menu lateral: fixo no desktop (inteiro ou recolhido só com os ícones) e gaveta deslizante no
 * celular/tablet. Cada perfil vê só as telas que abre.
 */
export default function MenuLateral({ aberto, aoFechar, recolhido, aoAlternarRecolhido }: Propriedades) {
  const { usuario, sair } = useSessao()
  const navegar = useNavigate()
  const grupos = MENU.map((grupo) => ({ ...grupo, itens: grupo.itens.filter((item) => abreTela(usuario?.perfil, item.para)) })).filter(
    (grupo) => grupo.itens.length > 0,
  )
  // Recolhido só vale no desktop: no celular a gaveta abre sempre inteira.

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
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-white shadow-xl ring-1 ring-slate-200/70 transition-[transform,width] duration-300 lg:translate-x-0 lg:shadow-none ${
          aberto ? 'translate-x-0' : '-translate-x-full'
        } ${recolhido ? 'lg:w-20' : ''}`}
      >
        <div className={`flex h-20 items-center justify-between px-5 ${recolhido ? 'lg:justify-center lg:px-0' : ''}`}>
          <Logo className={`w-40 ${recolhido ? 'lg:hidden' : ''}`} />
          {recolhido && (
            <span className="hidden h-11 w-11 place-items-center rounded-2xl bg-laranja text-white shadow-lg shadow-laranja/30 lg:grid">
              <Icone nome="van" className="h-6 w-6" />
            </span>
          )}
          <button onClick={aoFechar} className="text-slate-400 lg:hidden" aria-label="Fechar menu">
            <Icone nome="fechar" />
          </button>
        </div>

        {/* Botão de recolher/expandir (desktop), na borda do menu */}
        <button
          onClick={aoAlternarRecolhido}
          aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
          title={recolhido ? 'Expandir menu' : 'Recolher menu'}
          className="absolute top-7 -right-3 z-50 hidden h-6 w-6 place-items-center rounded-full bg-white text-slate-500 shadow-md ring-1 ring-slate-200 transition-colors hover:bg-laranja hover:text-white hover:ring-laranja lg:grid"
        >
          <Icone nome="chevron" className={`h-3.5 w-3.5 transition-transform duration-300 ${recolhido ? '' : 'rotate-180'}`} />
        </button>

        <nav className={`flex-1 space-y-6 overflow-y-auto px-4 pb-6 ${recolhido ? 'lg:space-y-3 lg:overflow-visible lg:px-3' : ''}`}>
          {grupos.map((grupo, indice) => (
            <div key={grupo.titulo}>
              <p className={`mb-2 px-3 text-[11px] font-bold tracking-widest text-slate-400 uppercase ${recolhido ? 'lg:hidden' : ''}`}>{grupo.titulo}</p>
              {recolhido && indice > 0 && <div className="mx-auto mb-3 hidden h-px w-8 bg-slate-200 lg:block" />}
              <ul className="space-y-1">
                {grupo.itens.map((item) => (
                  <li key={item.para} className="group relative">
                    <NavLink
                      to={item.para}
                      // Só o Painel ("/") exige endereço exato; /relatorios/x mantém "Relatórios" marcado.
                      end={item.para === '/'}
                      onClick={aoFechar}
                      aria-label={item.rotulo}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${recolhido ? 'lg:justify-center lg:px-0' : ''} ${
                          isActive
                            ? 'bg-laranja text-white shadow-md shadow-laranja/30'
                            : `text-marinho hover:bg-fundo ${recolhido ? '' : 'hover:translate-x-1'}`
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icone nome={item.icone} className="h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                          <span className={`flex-1 ${recolhido ? 'lg:hidden' : ''}`}>{item.rotulo}</span>
                          {!item.pronto && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${recolhido ? 'lg:hidden' : ''} ${
                                isActive ? 'bg-white/20 text-white' : 'bg-fundo text-slate-400'
                              }`}
                            >
                              Em breve
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                    {recolhido && <Dica texto={item.rotulo} />}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Usuário logado e o botão de sair. */}
        {usuario && (
          <div className={`flex items-center gap-3 border-t border-slate-100 px-4 py-4 ${recolhido ? 'lg:flex-col lg:gap-2 lg:px-2' : ''}`}>
            <span className="group relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-marinho text-sm font-bold text-white">
              {iniciaisDoNome(usuario.nome)}
              {recolhido && <Dica texto={`${usuario.nome} · ${ROTULOS_PERFIL[usuario.perfil]}`} />}
            </span>
            <div className={`min-w-0 flex-1 leading-tight ${recolhido ? 'lg:hidden' : ''}`}>
              <p className="truncate text-sm font-bold text-marinho">{usuario.nome}</p>
              <p className="truncate text-xs text-slate-500">
                {ROTULOS_PERFIL[usuario.perfil]} · {usuario.login}
              </p>
            </div>
            <button
              onClick={() => {
                sair()
                navegar('/login', { replace: true })
              }}
              title="Sair"
              aria-label="Sair"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
            >
              <Icone nome="sair" className="h-5 w-5" />
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
