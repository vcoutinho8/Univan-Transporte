import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'

import Icone from '../components/Icon.tsx'
import { abreTela, ROTULOS_PERFIL, telaInicial } from './permissoes.ts'
import { useSessao } from './useSessao.ts'

/**
 * Só mostra o conteúdo com alguém logado; sem sessão, vai para o login (que leva à tela inicial
 * do perfil, nunca à tela de quem saiu).
 * Tela que o perfil não abre mostra "sem acesso" (a API recusaria os dados de qualquer jeito).
 */
export default function RotaProtegida({ children }: { children: ReactNode }) {
  const { usuario } = useSessao()
  const local = useLocation()

  if (!usuario) return <Navigate to="/login" replace />
  if (local.pathname === '/' && usuario.perfil === 'motorista') return <Navigate to={telaInicial('motorista')} replace />
  if (!abreTela(usuario.perfil, local.pathname)) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-center">
        <div className="max-w-sm">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-red-500">
            <Icone nome="cadeado" className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-xl font-extrabold text-marinho">Sem acesso a esta tela</h1>
          <p className="mt-2 text-sm text-slate-500">
            Seu perfil ({ROTULOS_PERFIL[usuario.perfil]}) não abre esta tela. Se precisar dela, fale com o administrador.
          </p>
          <Link
            to={telaInicial(usuario.perfil)}
            className="mt-5 inline-block rounded-lg bg-laranja px-4 py-2 text-sm font-semibold text-white hover:bg-laranja-claro"
          >
            Ir para o início
          </Link>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
