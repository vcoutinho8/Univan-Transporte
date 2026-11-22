import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { ROTULOS_PERFIL } from '../../shared/auth/permissoes.ts'
import { useSessao } from '../../shared/auth/useSessao.ts'
import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Icone, { type NomeIcone } from '../../shared/components/Icon.tsx'
import Modal from '../../shared/components/Modal.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { ErroApi } from '../../shared/services/api.ts'
import { formatarCpf, iniciais } from '../../shared/utils/formatar.ts'
import CamposEndereco, { enderecoDoFormulario, paraApi, validarEndereco } from '../endereco/AddressFields.tsx'
import { servicoInstituicao } from '../instituicao/institutionService.ts'
import type { Instituicao } from '../instituicao/types.ts'
import { servicoMotorista } from '../motorista/driverService.ts'
import { servicoConta, type MinhaConta, type UsuarioDetalhe } from './accountService.ts'
import FormularioInstituicao from './InstitutionForm.tsx'
import FormularioUsuario, { Campo } from './UserForm.tsx'

type Aba = 'conta' | 'usuarios' | 'instituicoes'

/**
 * Configurações: cada um cuida da própria conta (e-mail, senha e, motorista, a casa; o CPF só o
 * admin muda). O admin também cria e edita os acessos (logins de auxiliar, senha esquecida) e
 * as instituições. No celular do motorista, é a aba da engrenagem (com o "Sair").
 */
export default function PaginaConfiguracoes() {
  const { usuario } = useSessao()
  const admin = usuario?.perfil === 'admin'
  const [aba, setAba] = useState<Aba>('conta')
  const conta = useRequisicao(() => servicoConta.minha(), [])

  const abas: { id: Aba; rotulo: string; icone: NomeIcone }[] = [
    { id: 'conta', rotulo: 'Minha conta', icone: 'usuario' },
    ...(admin
      ? ([
          { id: 'usuarios', rotulo: 'Usuários', icone: 'passageiros' },
          { id: 'instituicoes', rotulo: 'Instituições', icone: 'escola' },
        ] as const)
      : []),
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Quem está logado */}
      <div className="flex items-center gap-4 rounded-2xl bg-marinho p-5 text-white shadow-lg">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/15 text-lg font-extrabold">
          {usuario ? iniciais(usuario.nome) : ''}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold">{usuario?.nome}</h1>
          <p className="text-sm text-white/70">
            {usuario ? ROTULOS_PERFIL[usuario.perfil] : ''} · {usuario?.login}
          </p>
        </div>
        <Icone nome="engrenagem" className="ml-auto h-7 w-7 shrink-0 text-white/30" />
      </div>

      {abas.length > 1 && (
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200/70">
          {abas.map((a) => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-colors sm:text-sm ${
                aba === a.id ? 'bg-marinho text-white' : 'text-slate-500 hover:text-marinho'
              }`}
            >
              <Icone nome={a.icone} className="hidden h-4 w-4 sm:block" />
              {a.rotulo}
            </button>
          ))}
        </div>
      )}

      {aba === 'conta' &&
        (conta.dados ? (
          <MinhaContaSecao conta={conta.dados} aoAtualizar={conta.recarregar} />
        ) : conta.erro ? (
          <Alerta mensagem={conta.erro} />
        ) : (
          <div className="h-64 animate-pulse rounded-2xl bg-white" />
        ))}
      {aba === 'usuarios' && <UsuariosSecao />}
      {aba === 'instituicoes' && <InstituicoesSecao />}
    </div>
  )
}

function Cartao({ titulo, icone, children }: { titulo: string; icone: NomeIcone; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-extrabold tracking-wide text-marinho uppercase">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-laranja/10 text-laranja">
          <Icone nome={icone} className="h-4 w-4" />
        </span>
        {titulo}
      </h2>
      {children}
    </section>
  )
}

/** Resultado de um salvamento: ok (verde) ou erro (vermelho). */
function useEnvio() {
  const [estado, setEstado] = useState<{ ok?: string; erro?: string; salvando?: boolean }>({})
  async function enviar(acao: () => Promise<unknown>, ok: string) {
    setEstado({ salvando: true })
    try {
      await acao()
      setEstado({ ok })
    } catch (e) {
      setEstado({ erro: e instanceof ErroApi ? e.mensagemCompleta : e instanceof Error && e.message ? e.message : 'Não foi possível salvar.' })
    }
  }
  const aviso = estado.erro ? <Alerta mensagem={estado.erro} /> : estado.ok ? <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{estado.ok}</p> : null
  return { enviar, aviso, salvando: Boolean(estado.salvando) }
}

function MinhaContaSecao({ conta, aoAtualizar }: { conta: MinhaConta; aoAtualizar: () => void }) {
  const { sair } = useSessao()
  const navegar = useNavigate()
  const [email, setEmail] = useState(conta.email ?? '')
  const [senhaAtual, setSenhaAtual] = useState('')
  const [senhaNova, setSenhaNova] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [endereco, setEndereco] = useState(() => enderecoDoFormulario(conta.endereco))
  const [confirmarSair, setConfirmarSair] = useState(false)
  const dados = useEnvio()
  const senha = useEnvio()
  const casa = useEnvio()
  const motorista = conta.perfil === 'motorista'

  function salvarSenha(e: FormEvent) {
    e.preventDefault()
    if (senhaNova !== confirmacao) return
    void senha.enviar(async () => {
      await servicoConta.alterarMinha({ senha_atual: senhaAtual, senha_nova: senhaNova })
      setSenhaAtual('')
      setSenhaNova('')
      setConfirmacao('')
    }, 'Senha trocada. Use a nova no próximo login.')
  }

  return (
    <div className="space-y-4">
      <Cartao titulo="Meus dados" icone="usuario">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void dados.enviar(async () => {
              await servicoConta.alterarMinha({ email: email.trim() || null })
              aoAtualizar()
            }, 'E-mail salvo.')
          }}
          className="space-y-4"
        >
          {dados.aviso}
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nome">
              <input value={conta.nome} disabled className="campo bg-fundo text-slate-500" />
            </Campo>
            <Campo rotulo="CPF" dica="Só o administrador altera o CPF.">
              <input value={conta.cpf ? formatarCpf(conta.cpf) : 'Não informado'} disabled className="campo bg-fundo text-slate-500" />
            </Campo>
          </div>
          <Campo rotulo="E-mail">
            <input type="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} className="campo" placeholder="nome@exemplo.com" />
          </Campo>
          <Botao type="submit" disabled={dados.salvando} className="w-full sm:w-auto">
            Salvar e-mail
          </Botao>
        </form>
      </Cartao>

      <Cartao titulo="Trocar senha" icone="cadeado">
        <form onSubmit={salvarSenha} className="space-y-4">
          {senhaNova && confirmacao && senhaNova !== confirmacao ? <Alerta mensagem="A confirmação não é igual à nova senha." /> : senha.aviso}
          <Campo rotulo="Senha atual">
            <input type="password" required autoComplete="current-password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} className="campo" />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nova senha" dica="Mínimo 6 caracteres.">
              <input type="password" required minLength={6} autoComplete="new-password" value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} className="campo" />
            </Campo>
            <Campo rotulo="Repita a nova senha">
              <input type="password" required minLength={6} autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} className="campo" />
            </Campo>
          </div>
          <Botao type="submit" disabled={senha.salvando || senhaNova !== confirmacao} className="w-full sm:w-auto">
            Trocar senha
          </Botao>
        </form>
      </Cartao>

      {motorista && (
        <Cartao titulo="Minha casa" icone="pino">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const problema = validarEndereco(endereco)
              void casa.enviar(async () => {
                if (problema) throw new Error(problema)
                await servicoConta.alterarMinha({ endereco: paraApi(endereco) })
              }, 'Endereço salvo. A ida passa a sair daqui.')
            }}
            className="space-y-4"
          >
            {casa.aviso}
            <p className="text-sm text-slate-500">De onde a ida sai e onde a volta termina.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <CamposEndereco valor={endereco} aoMudar={setEndereco} rotuloMapa="Casa / garagem no mapa" />
            </div>
            <Botao type="submit" disabled={casa.salvando} className="w-full sm:w-auto">
              Salvar endereço
            </Botao>
          </form>
        </Cartao>
      )}

      <button
        onClick={() => setConfirmarSair(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 text-sm font-bold text-red-500 shadow-sm ring-1 ring-red-100 hover:bg-red-50"
      >
        <Icone nome="sair" className="h-5 w-5" />
        Sair da conta
      </button>
      {confirmarSair && (
        <Modal
          titulo="Sair da sua conta?"
          descricao="Para voltar, é só entrar de novo com seu usuário e senha."
          icone="sair"
          tom="vermelho"
          aoFechar={() => setConfirmarSair(false)}
          acoes={
            <>
              <Botao variante="secundario" onClick={() => setConfirmarSair(false)}>
                Ficar
              </Botao>
              <Botao
                variante="perigo"
                onClick={() => {
                  sair()
                  navegar('/login', { replace: true })
                }}
              >
                Sair
              </Botao>
            </>
          }
        />
      )}
    </div>
  )
}

function UsuariosSecao() {
  const usuarios = useRequisicao(() => servicoConta.listar(), [])
  const motoristas = useRequisicao(() => servicoMotorista.listar(), [])
  const [editando, setEditando] = useState<UsuarioDetalhe | 'novo' | null>(null)
  const usados = new Set((usuarios.dados ?? []).map((u) => u.fk_motorista).filter((id): id is number => id !== null))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Logins de quem usa o sistema. Esqueceram a senha? Edite e defina uma nova.</p>
        <Botao onClick={() => setEditando('novo')} className="shrink-0">
          <Icone nome="mais" className="h-4 w-4" />
          Novo
        </Botao>
      </div>
      {usuarios.erro && <Alerta mensagem={usuarios.erro} />}
      <ul className="space-y-2">
        {(usuarios.dados ?? []).map((u) => (
          <li key={u.id}>
            <button
              onClick={() => setEditando(u)}
              className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200/70 hover:ring-laranja/50"
            >
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-extrabold ${u.status === 'ativo' ? 'bg-marinho text-white' : 'bg-slate-200 text-slate-400'}`}>
                {iniciais(u.nome)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-marinho">{u.nome}</span>
                <span className="block truncate text-xs text-slate-500">
                  {u.login}
                  {u.email ? ` · ${u.email}` : ''}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded-full bg-laranja/10 px-2.5 py-0.5 text-[11px] font-bold text-laranja">{ROTULOS_PERFIL[u.perfil]}</span>
                {u.status === 'inativo' && <span className="text-[11px] font-bold text-slate-400">inativo</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {editando && (
        <FormularioUsuario
          usuario={editando === 'novo' ? null : editando}
          motoristas={motoristas.dados ?? []}
          usados={usados}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null)
            void usuarios.recarregar()
          }}
        />
      )}
    </div>
  )
}

function InstituicoesSecao() {
  const instituicoes = useRequisicao(() => servicoInstituicao.listar(), [])
  const [editando, setEditando] = useState<Instituicao | 'nova' | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Faculdades de destino. O pino no mapa é onde a van para.</p>
        <Botao onClick={() => setEditando('nova')} className="shrink-0">
          <Icone nome="mais" className="h-4 w-4" />
          Nova
        </Botao>
      </div>
      {instituicoes.erro && <Alerta mensagem={instituicoes.erro} />}
      <ul className="space-y-2">
        {(instituicoes.dados ?? []).map((i) => (
          <li key={i.id}>
            <button
              onClick={() => setEditando(i)}
              className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200/70 hover:ring-laranja/50"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-marinho text-white">
                <Icone nome="escola" className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-marinho">{i.nome}</span>
                <span className="block truncate text-xs text-slate-500">
                  {i.endereco.logradouro}
                  {i.endereco.numero ? `, ${i.endereco.numero}` : ''} · {i.endereco.bairro} · {i.endereco.cidade}
                </span>
              </span>
              <Icone nome="editar" className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          </li>
        ))}
      </ul>
      {editando && (
        <FormularioInstituicao
          instituicao={editando === 'nova' ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null)
            void instituicoes.recarregar()
          }}
        />
      )}
    </div>
  )
}
