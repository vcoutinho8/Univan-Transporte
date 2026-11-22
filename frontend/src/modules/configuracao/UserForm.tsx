import { useState, type FormEvent, type ReactNode } from 'react'

import { ROTULOS_PERFIL } from '../../shared/auth/permissoes.ts'
import type { Perfil } from '../../shared/auth/sessao.ts'
import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Gaveta from '../../shared/components/Drawer.tsx'
import { ErroApi } from '../../shared/services/api.ts'
import { formatarCpf, soDigitos } from '../../shared/utils/formatar.ts'
import type { Motorista } from '../motorista/types.ts'
import { servicoConta, type UsuarioDetalhe } from './accountService.ts'

export function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-marinho">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-slate-500">{dica}</span>}
    </label>
  )
}

/**
 * Novo acesso ou alteração (só o admin): nome, login, perfil, e-mail, CPF e senha. O perfil
 * motorista aponta para o cadastro do motorista (de onde vêm o CPF e as viagens dele).
 */
export default function FormularioUsuario({
  usuario,
  motoristas,
  usados,
  aoSalvar,
  aoFechar,
}: {
  usuario: UsuarioDetalhe | null
  motoristas: Motorista[]
  /** Motoristas que já têm login (não aparecem para outro usuário). */
  usados: Set<number>
  aoSalvar: () => void
  aoFechar: () => void
}) {
  const [nome, setNome] = useState(usuario?.nome ?? '')
  const [login, setLogin] = useState(usuario?.login ?? '')
  const [perfil, setPerfil] = useState<Perfil>(usuario?.perfil ?? 'auxiliar')
  const [fkMotorista, setFkMotorista] = useState<number | ''>(usuario?.fk_motorista ?? '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [cpf, setCpf] = useState(usuario?.cpf ? formatarCpf(usuario.cpf) : '')
  const [senha, setSenha] = useState('')
  const [ativo, setAtivo] = useState(usuario?.status !== 'inativo')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (perfil === 'motorista' && !fkMotorista) return setErro('Escolha qual motorista vai usar este login.')
    setSalvando(true)
    const dados = {
      nome,
      login,
      perfil,
      fk_motorista: perfil === 'motorista' ? Number(fkMotorista) : null,
      email: email.trim() || null,
      cpf: perfil === 'motorista' ? null : soDigitos(cpf) || null,
    }
    try {
      if (usuario) await servicoConta.alterar(usuario.id, { ...dados, ...(senha ? { senha } : {}), status: ativo ? 'ativo' : 'inativo' })
      else await servicoConta.criar({ ...dados, senha })
      aoSalvar()
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Gaveta titulo={usuario ? `Editar ${usuario.nome}` : 'Novo usuário'} descricao="Quem entra no sistema e o que pode ver." aoFechar={aoFechar} largura="max-w-lg">
      <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {erro && <Alerta mensagem={erro} />}
          <Campo rotulo="Nome">
            <input required maxLength={100} value={nome} onChange={(e) => setNome(e.target.value)} className="campo" placeholder="Ex.: Marina Souza" />
          </Campo>
          <Campo rotulo="Usuário (login)" dica="Letras minúsculas, números, ponto, hífen ou sublinhado.">
            <input
              required
              minLength={3}
              maxLength={30}
              autoCapitalize="none"
              value={login}
              onChange={(e) => setLogin(e.target.value.toLowerCase().replace(/\s/g, ''))}
              className="campo"
              placeholder="Ex.: marina"
            />
          </Campo>
          <Campo rotulo="Perfil" dica="Administrador vê e altera tudo; auxiliar acompanha; motorista vê as próprias viagens.">
            <div className="grid grid-cols-3 gap-2">
              {(['admin', 'auxiliar', 'motorista'] as Perfil[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPerfil(p)}
                  className={`rounded-xl py-2.5 text-sm font-bold transition-colors ${perfil === p ? 'bg-marinho text-white' : 'bg-fundo text-slate-600 hover:bg-slate-200'}`}
                >
                  {ROTULOS_PERFIL[p]}
                </button>
              ))}
            </div>
          </Campo>
          {perfil === 'motorista' ? (
            <Campo rotulo="Motorista" dica="O CPF e a casa vêm do cadastro do motorista.">
              <select required value={fkMotorista} onChange={(e) => setFkMotorista(e.target.value ? Number(e.target.value) : '')} className="campo">
                <option value="">Escolha...</option>
                {motoristas
                  .filter((m) => m.id === usuario?.fk_motorista || !usados.has(m.id))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
              </select>
            </Campo>
          ) : (
            <Campo rotulo="CPF (opcional)">
              <input inputMode="numeric" maxLength={14} value={cpf} onChange={(e) => setCpf(formatarCpf(e.target.value))} className="campo" placeholder="000.000.000-00" />
            </Campo>
          )}
          <Campo rotulo="E-mail (opcional)">
            <input type="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} className="campo" placeholder="nome@exemplo.com" />
          </Campo>
          <Campo
            rotulo={usuario ? 'Nova senha' : 'Senha inicial'}
            dica={usuario ? 'Deixe vazio para manter. Use para quem esqueceu a senha.' : 'Mínimo 6 caracteres. A pessoa pode trocar depois em Configurações.'}
          >
            <input
              type="text"
              autoComplete="new-password"
              required={!usuario}
              minLength={6}
              maxLength={128}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="campo"
            />
          </Campo>
          {usuario && (
            <label className="flex items-center justify-between rounded-xl bg-fundo px-4 py-3">
              <span>
                <span className="block text-sm font-semibold text-marinho">Acesso ativo</span>
                <span className="text-xs text-slate-500">Desligado, a pessoa não consegue entrar.</span>
              </span>
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-5 w-5 accent-laranja" />
            </label>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <Botao type="button" variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" disabled={salvando}>
            {salvando ? 'Salvando...' : usuario ? 'Salvar' : 'Criar usuário'}
          </Botao>
        </footer>
      </form>
    </Gaveta>
  )
}
