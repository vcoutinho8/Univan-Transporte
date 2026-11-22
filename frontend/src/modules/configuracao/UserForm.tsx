import { useState, type FormEvent, type ReactNode } from 'react'

import { ROTULOS_PERFIL } from '../../shared/auth/permissoes.ts'
import type { Perfil } from '../../shared/auth/sessao.ts'
import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Gaveta from '../../shared/components/Drawer.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { useConfirmacao } from '../../shared/components/NoticeModal.tsx'
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
 * Novo acesso ou edição (só o gestor). O usuário de acesso é o CPF e a senha começa 123456 (a
 * pessoa cria a dela no primeiro login). Na edição: nome, CPF, situação e o reset da senha.
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
  aoSalvar: (mensagem: string) => void
  aoFechar: () => void
}) {
  const confirmacao = useConfirmacao()
  const [nome, setNome] = useState(usuario?.nome ?? '')
  const [perfil, setPerfil] = useState<Perfil>(usuario?.perfil ?? 'auxiliar')
  const [fkMotorista, setFkMotorista] = useState<number | ''>(usuario?.fk_motorista ?? '')
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState(usuario?.cpf ? formatarCpf(usuario.cpf) : '')
  const [ativo, setAtivo] = useState(usuario?.status !== 'inativo')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const motorista = perfil === 'motorista'

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (motorista && !fkMotorista && !usuario) return setErro('Escolha qual motorista vai usar este acesso.')
    setSalvando(true)
    try {
      if (usuario) {
        await servicoConta.alterar(usuario.id, { nome, ...(motorista ? {} : { cpf: soDigitos(cpf) }), status: ativo ? 'ativo' : 'inativo' })
        aoSalvar(`${nome} atualizado(a).`)
      } else {
        await servicoConta.criar({
          nome,
          perfil,
          ...(motorista ? { fk_motorista: Number(fkMotorista) } : { cpf: soDigitos(cpf) }),
          email: email.trim() || null,
        })
        aoSalvar(`${nome} pode entrar com o CPF e a senha 123456. No primeiro acesso, cria a própria senha.`)
      }
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function resetar() {
    if (!usuario) return
    const sim = await confirmacao.confirmar({
      titulo: `Resetar a senha de ${usuario.nome}?`,
      descricao: 'A senha volta para 123456 e, no próximo login, a pessoa cria uma nova.',
      botao: 'Resetar senha',
    })
    if (!sim) return
    try {
      await servicoConta.resetarSenha(usuario.id)
      aoSalvar(`Senha de ${usuario.nome} resetada para 123456.`)
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Não foi possível resetar a senha.')
    }
  }

  return (
    <Gaveta titulo={usuario ? `Editar ${usuario.nome}` : 'Novo usuário'} descricao="Quem entra no sistema e o que pode ver." aoFechar={aoFechar} largura="max-w-lg">
      {confirmacao.modal}
      <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {erro && <Alerta mensagem={erro} />}
          <Campo rotulo="Nome">
            <input required maxLength={100} value={nome} onChange={(e) => setNome(e.target.value)} className="campo" placeholder="Ex.: Marina Souza" />
          </Campo>

          {usuario ? (
            <div className="flex items-center justify-between rounded-xl bg-fundo px-4 py-3 text-sm">
              <span className="text-slate-500">Perfil</span>
              <span className="font-bold text-marinho">{ROTULOS_PERFIL[usuario.perfil]}</span>
            </div>
          ) : (
            <Campo rotulo="Perfil" dica="Gestor vê e altera tudo; auxiliar acompanha; motorista vê as próprias viagens.">
              <div className="grid grid-cols-3 gap-2">
                {(['admin', 'auxiliar', 'motorista'] as Perfil[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPerfil(p)}
                    className={`rounded-xl px-2 py-2.5 text-xs font-bold transition-colors ${perfil === p ? 'bg-marinho text-white' : 'bg-fundo text-slate-600 hover:bg-slate-200'}`}
                  >
                    {ROTULOS_PERFIL[p]}
                  </button>
                ))}
              </div>
            </Campo>
          )}

          {motorista ? (
            !usuario && (
              <Campo rotulo="Motorista" dica="O acesso usa o CPF do cadastro do motorista.">
                <select required value={fkMotorista} onChange={(e) => setFkMotorista(e.target.value ? Number(e.target.value) : '')} className="campo">
                  <option value="">Escolha...</option>
                  {motoristas
                    .filter((m) => !usados.has(m.id))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome} · CPF {formatarCpf(m.cpf)}
                      </option>
                    ))}
                </select>
              </Campo>
            )
          ) : (
            <Campo rotulo="CPF" dica="É o usuário de acesso (login).">
              <input
                required
                inputMode="numeric"
                maxLength={14}
                value={cpf}
                onChange={(e) => setCpf(formatarCpf(e.target.value))}
                className="campo"
                placeholder="000.000.000-00"
              />
            </Campo>
          )}

          {!usuario && (
            <Campo rotulo="E-mail (opcional)">
              <input type="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} className="campo" placeholder="nome@exemplo.com" />
            </Campo>
          )}

          {usuario ? (
            <>
              <label className="flex items-center justify-between rounded-xl bg-fundo px-4 py-3">
                <span>
                  <span className="block text-sm font-semibold text-marinho">Acesso ativo</span>
                  <span className="text-xs text-slate-500">Desligado, a pessoa não consegue entrar.</span>
                </span>
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-5 w-5 accent-laranja" />
              </label>
              <button
                type="button"
                onClick={() => void resetar()}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left ring-1 ring-slate-200 transition-colors hover:bg-laranja/5 hover:ring-laranja/40"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-laranja/10 text-laranja">
                  <Icone nome="cadeado" className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-marinho">Resetar senha</span>
                  <span className="block text-xs text-slate-500">Volta para 123456; a pessoa cria a nova no próximo login.</span>
                </span>
              </button>
            </>
          ) : (
            <p className="flex items-start gap-2 rounded-xl bg-laranja/5 p-3 text-xs text-marinho ring-1 ring-laranja/20">
              <Icone nome="cadeado" className="mt-0.5 h-4 w-4 shrink-0 text-laranja" />
              Senha inicial: <strong>123456</strong>. No primeiro acesso a pessoa cria a própria senha.
            </p>
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
