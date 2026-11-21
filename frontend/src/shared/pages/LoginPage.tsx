import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

import { telaInicial } from '../auth/permissoes.ts'
import { useSessao } from '../auth/useSessao.ts'
import Icone from '../components/Icon.tsx'
import Logo from '../components/Logo.tsx'
import { useAviso } from '../components/NoticeModal.tsx'
import { ErroApi } from '../services/api.ts'
import CenaVanNaEstrada from './LoginScene.tsx'

const FORMATO_USUARIO = /^[a-z0-9._-]{3,30}$/
/** Usuário guardado quando a pessoa marca "Lembrar meu usuário" (nunca a senha). */
const CHAVE_LEMBRAR = 'univan.lembrarUsuario'

/** Frases que se revezam embaixo da cena (como o carrossel do layout de referência). */
const DESTAQUES = [
  { titulo: 'Cada passageiro no lugar certo', texto: 'Viagens do dia geradas a partir das rotas, com embarque e desembarque.' },
  { titulo: 'Quem não vai, avisa antes', texto: 'O aviso prévio tira o passageiro da fila do motorista na hora.' },
  { titulo: 'A rota na palma da mão', texto: 'O motorista segue o mapa parada por parada, com navegação até a porta.' },
]

/** Mensagem do campo, ou nada se estiver certo (mesmas regras da API). */
export function validarLogin(usuario: string, senha: string): { usuario?: string; senha?: string } {
  const erros: { usuario?: string; senha?: string } = {}
  const login = usuario.trim().toLowerCase()
  if (!login) erros.usuario = 'Informe o usuário.'
  else if (!FORMATO_USUARIO.test(login)) erros.usuario = 'Use de 3 a 30 letras, números, ponto, hífen ou sublinhado.'
  if (!senha) erros.senha = 'Informe a senha.'
  return erros
}

/** Campo com o rótulo "sentado" na borda, como no layout de referência. */
function Campo({ rotulo, erro, children }: { rotulo: string; erro?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="relative block">
        <span
          className={`pointer-events-none absolute -top-2 left-3 z-10 bg-white px-1.5 text-xs font-semibold ${
            erro ? 'text-red-600' : 'text-slate-500'
          }`}
        >
          {rotulo}
        </span>
        {children}
      </span>
      {erro && <span className="mt-1.5 block text-xs font-semibold text-red-600">{erro}</span>}
    </label>
  )
}

/**
 * Tela de login: usuário e senha. Depois de entrar, cada perfil vai para a sua tela inicial
 * (motorista: Minha rota; admin e auxiliar: Painel), ou volta para a página que pediu o login.
 */
export default function PaginaLogin() {
  const { sessao, entrar } = useSessao()
  const navegar = useNavigate()
  const local = useLocation()
  const [usuario, setUsuario] = useState(() => localStorage.getItem(CHAVE_LEMBRAR) ?? '')
  const [lembrar, setLembrar] = useState(() => Boolean(localStorage.getItem(CHAVE_LEMBRAR)))
  const [senha, setSenha] = useState('')
  const [verSenha, setVerSenha] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [tocado, setTocado] = useState(false)
  const [destaque, setDestaque] = useState(0)
  // A van acelera por um instante a cada tecla (e enquanto entra).
  const [digitando, setDigitando] = useState(false)
  const avisos = useAviso()

  useEffect(() => {
    if (!digitando) return
    const pausa = window.setTimeout(() => setDigitando(false), 700)
    return () => window.clearTimeout(pausa)
  }, [digitando, usuario, senha])

  useEffect(() => {
    const relogio = window.setInterval(() => setDestaque((d) => (d + 1) % DESTAQUES.length), 5000)
    return () => window.clearInterval(relogio)
  }, [])

  const destino = (local.state as { de?: string } | null)?.de
  if (sessao) return <Navigate to={destino ?? telaInicial(sessao.usuario.perfil)} replace />

  const erros = tocado ? validarLogin(usuario, senha) : {}

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setTocado(true)
    if (Object.keys(validarLogin(usuario, senha)).length) return
    setEnviando(true)
    const login = usuario.trim().toLowerCase()
    try {
      const nova = await entrar(login, senha)
      if (lembrar) localStorage.setItem(CHAVE_LEMBRAR, login)
      else localStorage.removeItem(CHAVE_LEMBRAR)
      navegar(destino ?? telaInicial(nova.usuario.perfil), { replace: true })
    } catch (e) {
      const bloqueado = e instanceof ErroApi && e.status === 429
      avisos.mostrar({
        tipo: 'erro',
        titulo: bloqueado ? 'Acesso bloqueado por alguns minutos' : 'Não foi possível entrar',
        descricao:
          e instanceof ErroApi && e.status === 0
            ? 'O servidor não respondeu. Verifique se a API está rodando.'
            : e instanceof ErroApi
              ? e.message
              : 'Não foi possível entrar agora.',
      })
      setSenha('')
    } finally {
      setEnviando(false)
    }
  }

  const campo = (erro?: string) =>
    `w-full rounded-xl border bg-white px-4 py-3.5 text-sm text-marinho outline-none transition-colors placeholder:text-slate-400 focus:ring-4 ${
      erro ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-300 focus:border-laranja focus:ring-laranja/15'
    }`

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-[#eef2f8] px-4 py-8">
      {/* Fundo: manchas suaves da paleta */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-marinho/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -bottom-32 h-96 w-96 rounded-full bg-laranja/10 blur-3xl" />

      <div className="relative grid w-full max-w-5xl animate-surgir overflow-hidden rounded-3xl bg-white p-3 shadow-2xl shadow-marinho/10 sm:p-4 lg:grid-cols-[1fr_1.05fr]">
        {/* Formulário */}
        <main className="flex flex-col px-5 py-6 sm:px-10 sm:py-8">
          <Logo className="w-32" />

          <div className="my-auto py-10">
            <h1 className="text-3xl font-extrabold tracking-tight text-marinho">Entrar</h1>
            <p className="mt-2 text-sm text-slate-500">Acesse sua conta do UniVan para continuar.</p>

            <form onSubmit={enviar} noValidate className="mt-8 space-y-6">
              <Campo rotulo="Usuário" erro={erros.usuario}>
                <input
                  autoFocus={!usuario}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={usuario}
                  onChange={(e) => {
                    setUsuario(e.target.value)
                    setDigitando(true)
                  }}
                  placeholder="Digite seu usuário"
                  aria-invalid={Boolean(erros.usuario)}
                  className={campo(erros.usuario)}
                />
              </Campo>

              <Campo rotulo="Senha" erro={erros.senha}>
                <input
                  autoFocus={Boolean(usuario)}
                  type={verSenha ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => {
                    setSenha(e.target.value)
                    setDigitando(true)
                  }}
                  placeholder="Sua senha"
                  aria-invalid={Boolean(erros.senha)}
                  className={`${campo(erros.senha)} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setVerSenha(!verSenha)}
                  aria-label={verSenha ? 'Esconder senha' : 'Mostrar senha'}
                  className="absolute top-1/2 right-2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-fundo hover:text-marinho"
                >
                  <Icone nome={verSenha ? 'olhoFechado' : 'olho'} className="h-4 w-4" />
                </button>
              </Campo>

              <div className="flex items-center justify-between gap-3 text-sm">
                <label className="flex cursor-pointer items-center gap-2 text-slate-600">
                  <input
                    type="checkbox"
                    checked={lembrar}
                    onChange={(e) => setLembrar(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-laranja"
                  />
                  Lembrar meu usuário
                </label>
                <button
                  type="button"
                  onClick={() =>
                    avisos.mostrar({
                      tipo: 'info',
                      titulo: 'Esqueceu a senha?',
                      descricao: 'Peça ao administrador da sua empresa para criar uma senha nova para o seu usuário.',
                    })
                  }
                  className="font-semibold text-laranja hover:underline"
                >
                  Esqueci a senha
                </button>
              </div>

              <button
                type="submit"
                disabled={enviando}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-laranja py-3.5 text-sm font-bold text-white shadow-lg shadow-laranja/25 transition-all hover:-translate-y-0.5 hover:bg-laranja-claro disabled:translate-y-0 disabled:opacity-60"
              >
                {enviando ? 'Entrando...' : 'Entrar'}
                {!enviando && <Icone nome="seta" className="h-4 w-4" />}
              </button>
            </form>
          </div>

          <p className="text-xs text-slate-400">UniVan · Gestão de transporte universitário</p>
        </main>

        {/* Cena: a van na estrada, com as frases se revezando */}
        <aside
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            e.currentTarget.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3))
            e.currentTarget.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3))
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.setProperty('--px', '0')
            e.currentTarget.style.setProperty('--py', '0')
          }}
          className="relative order-first h-44 overflow-hidden rounded-2xl bg-marinho sm:h-56 lg:order-none lg:h-auto lg:min-h-[560px]">
          <div className="h-full lg:hidden">
            <CenaVanNaEstrada compacta acelerando={digitando || enviando} />
          </div>
          <div className="hidden h-full lg:block">
            <CenaVanNaEstrada acelerando={digitando || enviando} />
          </div>
          <div className="absolute inset-x-0 top-0 hidden bg-gradient-to-b from-[#0b2233] via-[#0b2233]/70 to-transparent px-8 pt-8 pb-16 text-white lg:block">
            <p className="text-xs font-bold tracking-widest text-laranja uppercase">Transporte universitário</p>
            <div key={destaque} className="animate-surgir">
              <h2 className="mt-2 text-2xl leading-tight font-extrabold">{DESTAQUES[destaque].titulo}</h2>
              <p className="mt-2 max-w-sm text-sm text-white/70">{DESTAQUES[destaque].texto}</p>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-5 hidden justify-center gap-1.5 lg:flex">
            {DESTAQUES.map((d, i) => (
              <button
                key={d.titulo}
                type="button"
                onClick={() => setDestaque(i)}
                aria-label={`Destaque ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === destaque ? 'w-6 bg-laranja' : 'w-1.5 bg-white/40 hover:bg-white/70'}`}
              />
            ))}
          </div>
        </aside>
      </div>
      {avisos.modal}
    </div>
  )
}
