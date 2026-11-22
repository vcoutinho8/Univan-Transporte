import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import Alerta from '../components/Alert.tsx'
import Botao from '../components/Button.tsx'
import Icone from '../components/Icon.tsx'
import Logo from '../components/Logo.tsx'
import { ErroApi, requisitar } from '../services/api.ts'

/** Página do link do e-mail ("Esqueci a senha" do gestor): cria a senha nova sem estar logado. */
export default function PaginaRedefinirSenha() {
  const [parametros] = useSearchParams()
  const token = parametros.get('token') ?? ''
  const [nova, setNova] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState<string | null>(token ? null : 'Link incompleto. Abra de novo o link do e-mail.')
  const [pronto, setPronto] = useState(false)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (nova !== repetida) return setErro('As duas senhas não são iguais.')
    setSalvando(true)
    setErro(null)
    try {
      await requisitar('/auth/redefinir-senha', { metodo: 'POST', corpo: { token, senha_nova: nova } })
      setPronto(true)
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar a senha.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-[#eef2f8] px-4 py-8">
      <div className="w-full max-w-md animate-surgir rounded-3xl bg-white p-8 shadow-2xl shadow-marinho/10">
        <Logo className="w-28" />
        {pronto ? (
          <div className="mt-8 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-600">
              <Icone nome="ok" className="h-7 w-7" />
            </span>
            <h1 className="mt-4 text-2xl font-extrabold text-marinho">Senha criada!</h1>
            <p className="mt-1 text-sm text-slate-500">Agora é só entrar com o seu CPF e a senha nova.</p>
            <Link to="/login" className="mt-6 inline-block rounded-xl bg-laranja px-6 py-3 text-sm font-bold text-white hover:bg-laranja-claro">
              Ir para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={salvar} className="mt-8 space-y-4">
            <div>
              <h1 className="text-2xl font-extrabold text-marinho">Criar senha nova</h1>
              <p className="mt-1 text-sm text-slate-500">Escolha uma senha que só você saiba (mínimo 6 caracteres).</p>
            </div>
            {erro && <Alerta mensagem={erro} />}
            <label className="block text-sm font-semibold text-marinho">
              Nova senha
              <input type="password" required minLength={6} autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} className="campo" />
            </label>
            <label className="block text-sm font-semibold text-marinho">
              Repita a nova senha
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={repetida}
                onChange={(e) => setRepetida(e.target.value)}
                className="campo"
              />
            </label>
            <Botao type="submit" disabled={salvando || !token} className="w-full py-3">
              {salvando ? 'Salvando...' : 'Criar senha'}
            </Botao>
            <Link to="/login" className="block text-center text-sm font-semibold text-laranja hover:underline">
              Voltar para o login
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
