import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { ROTULOS_PERFIL } from '../../shared/auth/permissoes.ts'
import { useSessao } from '../../shared/auth/useSessao.ts'
import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Cartao from '../../shared/components/Card.tsx'
import Icone, { type NomeIcone } from '../../shared/components/Icon.tsx'
import { useAviso, useConfirmacao } from '../../shared/components/NoticeModal.tsx'
import CabecalhoPagina from '../../shared/components/PageHeader.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { ErroApi } from '../../shared/services/api.ts'
import { formatarCpf, iniciais, soDigitos } from '../../shared/utils/formatar.ts'
import CamposEndereco, { enderecoDoFormulario, paraApi, validarEndereco } from '../endereco/AddressFields.tsx'
import { servicoInstituicao } from '../instituicao/institutionService.ts'
import type { Instituicao } from '../instituicao/types.ts'
import { servicoMotorista } from '../motorista/driverService.ts'
import { servicoConta, type MinhaConta, type UsuarioDetalhe } from './accountService.ts'
import FormularioInstituicao from './InstitutionForm.tsx'
import FormularioUsuario, { Campo } from './UserForm.tsx'

type Aba = 'conta' | 'usuarios' | 'instituicoes'

const ABAS: { id: Aba; rotulo: string; icone: NomeIcone; descricao: string }[] = [
  { id: 'conta', rotulo: 'Minha conta', icone: 'usuario', descricao: 'Seus dados, sua senha e como você entra no sistema.' },
  { id: 'usuarios', rotulo: 'Usuários', icone: 'passageiros', descricao: 'Quem entra no sistema: o acesso é pelo CPF e a senha começa 123456.' },
  { id: 'instituicoes', rotulo: 'Instituições', icone: 'escola', descricao: 'Faculdades de destino, escolhidas no cadastro oficial do MEC.' },
]

/**
 * Configurações: cada um cuida da própria conta; o gestor também cuida dos acessos e das
 * instituições. No celular do motorista é a aba da engrenagem (com o "Sair").
 */
export default function PaginaConfiguracoes() {
  const { usuario } = useSessao()
  const gestor = usuario?.perfil === 'admin'
  const [aba, setAba] = useState<Aba>('conta')
  const abas = gestor ? ABAS : ABAS.slice(0, 1)
  const atual = abas.find((a) => a.id === aba) ?? abas[0]

  return (
    <div className="mx-auto max-w-5xl">
      <CabecalhoPagina
        titulo="Configurações"
        descricao={atual.descricao}
        acoes={
          abas.length > 1 && (
            <nav className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200/70" aria-label="Abas">
              {abas.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAba(a.id)}
                  aria-current={a.id === aba ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                    a.id === aba ? 'bg-laranja text-white shadow-md shadow-laranja/30' : 'text-marinho hover:bg-fundo'
                  }`}
                >
                  <Icone nome={a.icone} className="h-4 w-4" />
                  {a.rotulo}
                </button>
              ))}
            </nav>
          )
        }
      />
      {atual.id === 'conta' && <MinhaContaSecao />}
      {atual.id === 'usuarios' && <UsuariosSecao />}
      {atual.id === 'instituicoes' && <InstituicoesSecao />}
    </div>
  )
}

function Secao({ titulo, icone, children }: { titulo: string; icone: NomeIcone; children: ReactNode }) {
  return (
    <Cartao className="pt-5">
      <h2 className="mb-4 flex items-center gap-2 text-base font-extrabold text-marinho">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-laranja/10 text-laranja">
          <Icone nome={icone} className="h-4 w-4" />
        </span>
        {titulo}
      </h2>
      {children}
    </Cartao>
  )
}

function MinhaContaSecao() {
  const conta = useRequisicao(() => servicoConta.minha(), [])
  if (conta.erro) return <Alerta mensagem={conta.erro} />
  if (!conta.dados) return <div className="h-80 animate-pulse rounded-2xl bg-white" />
  return <FormulariosDaConta conta={conta.dados} aoAtualizar={conta.recarregar} />
}

function FormulariosDaConta({ conta, aoAtualizar }: { conta: MinhaConta; aoAtualizar: () => void }) {
  const { sair, atualizarUsuario } = useSessao()
  const navegar = useNavigate()
  const avisos = useAviso()
  const confirmacao = useConfirmacao()
  const motorista = conta.perfil === 'motorista'
  const [nome, setNome] = useState(conta.nome)
  const [cpf, setCpf] = useState(conta.cpf ? formatarCpf(conta.cpf) : '')
  const [email, setEmail] = useState(conta.email ?? '')
  const [senhaAtual, setSenhaAtual] = useState('')
  const [senhaNova, setSenhaNova] = useState('')
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('')
  const [endereco, setEndereco] = useState(() => enderecoDoFormulario(conta.endereco))
  const [salvando, setSalvando] = useState<'dados' | 'senha' | 'casa' | null>(null)

  async function salvar(qual: 'dados' | 'senha' | 'casa', acao: () => Promise<unknown>, ok: string) {
    setSalvando(qual)
    try {
      await acao()
      avisos.mostrar({ tipo: 'sucesso', titulo: 'Pronto!', descricao: ok })
      aoAtualizar()
    } catch (e) {
      avisos.erro(e instanceof ErroApi ? e.mensagemCompleta : e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(null)
    }
  }

  function salvarDados(e: FormEvent) {
    e.preventDefault()
    void salvar(
      'dados',
      async () => {
        await servicoConta.alterarMinha({ ...(motorista ? {} : { nome, cpf: soDigitos(cpf) }), email: email.trim() || null })
        if (!motorista) atualizarUsuario({ nome, login: soDigitos(cpf) })
      },
      motorista ? 'E-mail salvo.' : `Dados salvos. Seu acesso agora é pelo CPF ${cpf}.`,
    )
  }

  function salvarSenha(e: FormEvent) {
    e.preventDefault()
    void salvar(
      'senha',
      async () => {
        await servicoConta.alterarMinha({ senha_atual: senhaAtual, senha_nova: senhaNova })
        setSenhaAtual('')
        setSenhaNova('')
        setConfirmacaoSenha('')
      },
      'Senha trocada. Use a nova no próximo login.',
    )
  }

  function salvarCasa(e: FormEvent) {
    e.preventDefault()
    const problema = validarEndereco(endereco)
    void salvar(
      'casa',
      async () => {
        if (problema) throw new Error(problema)
        await servicoConta.alterarMinha({ endereco: paraApi(endereco) })
      },
      'Endereço salvo. A ida passa a sair daqui.',
    )
  }

  async function sairDaConta() {
    const sim = await confirmacao.confirmar({
      titulo: 'Sair da sua conta?',
      descricao: 'Para voltar, é só entrar de novo com seu CPF e senha.',
      botao: 'Sair',
      perigo: true,
    })
    if (!sim) return
    sair()
    navegar('/login', { replace: true })
  }

  const senhasDiferentes = senhaNova !== '' && confirmacaoSenha !== '' && senhaNova !== confirmacaoSenha

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      {avisos.modal}
      {confirmacao.modal}

      {/* Quem está logado */}
      <Cartao className="flex flex-col items-center justify-center p-6 text-center">
        <span className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-marinho text-3xl font-extrabold text-white shadow-lg shadow-marinho/20">
          {iniciais(conta.nome)}
        </span>
        <p className="mt-4 text-xl font-extrabold text-marinho">{conta.nome}</p>
        <span className="mt-2 inline-block rounded-full bg-laranja/10 px-3 py-1 text-xs font-bold text-laranja">{ROTULOS_PERFIL[conta.perfil]}</span>
        {conta.nome_empresa && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-slate-500">
            <Icone nome="empresa" className="h-4 w-4 text-marinho" />
            <span>
              Trabalha na <strong className="text-marinho">{conta.nome_empresa}</strong>
            </span>
          </p>
        )}
      </Cartao>

        <Secao titulo="Meus dados" icone="usuario">
          <form onSubmit={salvarDados} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Nome" dica={motorista ? 'O nome do motorista muda no cadastro de motorista.' : undefined}>
                <input required maxLength={100} disabled={motorista} value={nome} onChange={(e) => setNome(e.target.value)} className="campo disabled:bg-fundo disabled:text-slate-500" />
              </Campo>
              <Campo rotulo="CPF" dica={motorista ? 'Só o gestor altera o CPF do motorista.' : 'É também o seu usuário de acesso.'}>
                <input
                  required={!motorista}
                  disabled={motorista}
                  inputMode="numeric"
                  maxLength={14}
                  value={cpf}
                  onChange={(e) => setCpf(formatarCpf(e.target.value))}
                  className="campo disabled:bg-fundo disabled:text-slate-500"
                  placeholder="000.000.000-00"
                />
              </Campo>
            </div>
            <Campo rotulo="E-mail">
              <input type="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} className="campo" placeholder="nome@exemplo.com" />
            </Campo>
            <div className="flex justify-end">
              <Botao type="submit" disabled={salvando === 'dados'}>
                {salvando === 'dados' ? 'Salvando...' : 'Salvar dados'}
              </Botao>
            </div>
          </form>
        </Secao>

        <div className="space-y-4 lg:col-span-2">
        <Secao titulo="Senha" icone="cadeado">
          <form onSubmit={salvarSenha} className="space-y-4">
            {senhasDiferentes && <Alerta mensagem="A confirmação não é igual à nova senha." />}
            <Campo rotulo="Senha atual">
              <input type="password" required autoComplete="current-password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} className="campo" />
            </Campo>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Nova senha" dica="Mínimo 6 caracteres.">
                <input type="password" required minLength={6} autoComplete="new-password" value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} className="campo" />
              </Campo>
              <Campo rotulo="Repita a nova senha">
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmacaoSenha}
                  onChange={(e) => setConfirmacaoSenha(e.target.value)}
                  className="campo"
                />
              </Campo>
            </div>
            <div className="flex justify-end">
              <Botao type="submit" disabled={salvando === 'senha' || senhasDiferentes}>
                {salvando === 'senha' ? 'Salvando...' : 'Trocar senha'}
              </Botao>
            </div>
          </form>
        </Secao>

        {motorista && (
          <Secao titulo="Minha casa" icone="pino">
            <form onSubmit={salvarCasa} className="space-y-4">
              <p className="text-sm text-slate-500">De onde a ida sai e onde a volta termina.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <CamposEndereco valor={endereco} aoMudar={setEndereco} rotuloMapa="Casa / garagem no mapa" />
              </div>
              <div className="flex justify-end">
                <Botao type="submit" disabled={salvando === 'casa'}>
                  {salvando === 'casa' ? 'Salvando...' : 'Salvar endereço'}
                </Botao>
              </div>
            </form>
          </Secao>
        )}
        <Botao variante="perigo" className="w-full py-3 lg:hidden" onClick={() => void sairDaConta()}>
          <Icone nome="sair" className="h-4 w-4" />
          Sair da conta
        </Botao>
      </div>
    </div>
  )
}

function ListaVazia({ texto }: { texto: string }) {
  return <p className="px-5 py-10 text-center text-sm text-slate-500">{texto}</p>
}

function UsuariosSecao() {
  const usuarios = useRequisicao(() => servicoConta.listar(), [])
  const motoristas = useRequisicao(() => servicoMotorista.listar(), [])
  const avisos = useAviso()
  const [editando, setEditando] = useState<UsuarioDetalhe | 'novo' | null>(null)
  const usados = new Set((usuarios.dados ?? []).map((u) => u.fk_motorista).filter((id): id is number => id !== null))
  const pedidos = (usuarios.dados ?? []).filter((u) => u.pediu_senha_em).length

  return (
    <Cartao semEspaco>
      {avisos.modal}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <p className="text-sm text-slate-500">
          {usuarios.dados ? `${usuarios.dados.length} usuário(s)` : 'Carregando...'}
          {pedidos > 0 && <span className="ml-2 font-bold text-red-600">· {pedidos} pediu(ram) senha nova: abra e use "Resetar senha"</span>}
        </p>
        <Botao onClick={() => setEditando('novo')}>
          <Icone nome="mais" className="h-4 w-4" />
          Novo usuário
        </Botao>
      </div>
      {usuarios.erro && <Alerta mensagem={usuarios.erro} />}
      {usuarios.dados?.length === 0 && <ListaVazia texto="Nenhum usuário ainda." />}
      <ul className="divide-y divide-slate-100">
        {(usuarios.dados ?? []).map((u) => (
          <li key={u.id}>
            <button onClick={() => setEditando(u)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-fundo/60">
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-extrabold ${u.status === 'ativo' ? 'bg-laranja/10 text-laranja' : 'bg-slate-100 text-slate-400'}`}
              >
                {iniciais(u.nome)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-marinho">{u.nome}</span>
                <span className="block truncate text-xs text-slate-500">Acesso: {/^\d{11}$/.test(u.login) ? formatarCpf(u.login) : u.login}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded-full bg-fundo px-2.5 py-0.5 text-[11px] font-bold text-marinho">{ROTULOS_PERFIL[u.perfil]}</span>
                {u.status === 'inativo' ? (
                  <span className="text-[11px] font-bold text-slate-400">inativo</span>
                ) : u.pediu_senha_em ? (
                  <span className="animate-pulse rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">pediu senha nova</span>
                ) : (
                  u.trocar_senha && <span className="text-[11px] font-bold text-amber-600">senha padrão</span>
                )}
              </span>
              <Icone nome="chevron" className="h-4 w-4 shrink-0 text-slate-300" />
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
          aoSalvar={(mensagem) => {
            setEditando(null)
            avisos.mostrar({ tipo: 'sucesso', titulo: 'Pronto!', descricao: mensagem })
            void usuarios.recarregar()
          }}
        />
      )}
    </Cartao>
  )
}

function InstituicoesSecao() {
  const instituicoes = useRequisicao(() => servicoInstituicao.listar(), [])
  const avisos = useAviso()
  const [editando, setEditando] = useState<Instituicao | 'nova' | null>(null)

  return (
    <Cartao semEspaco>
      {avisos.modal}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <p className="text-sm text-slate-500">Os portões de cada uma se ajustam em Mapa e rotas › Faculdades.</p>
        <Botao onClick={() => setEditando('nova')} className="shrink-0">
          <Icone nome="mais" className="h-4 w-4" />
          Nova instituição
        </Botao>
      </div>
      {instituicoes.erro && <Alerta mensagem={instituicoes.erro} />}
      {instituicoes.dados?.length === 0 && <ListaVazia texto="Nenhuma instituição ainda." />}
      <ul className="divide-y divide-slate-100">
        {(instituicoes.dados ?? []).map((i) => (
          <li key={i.id}>
            <button onClick={() => setEditando(i)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-fundo/60">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-laranja/10 text-laranja">
                <Icone nome="escola" className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-marinho">{i.nome}</span>
                <span className="block truncate text-xs text-slate-500">
                  {i.endereco.logradouro}, {i.endereco.numero ?? 'S/N'} · {i.endereco.bairro} · {i.endereco.cidade}/{i.endereco.estado}
                </span>
              </span>
              {!i.ponto_parada && <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">sem localização</span>}
              <Icone nome="chevron" className="h-4 w-4 shrink-0 text-slate-300" />
            </button>
          </li>
        ))}
      </ul>
      {editando && (
        <FormularioInstituicao
          instituicao={editando === 'nova' ? null : editando}
          cadastradas={instituicoes.dados ?? []}
          aoFechar={() => setEditando(null)}
          aoSalvar={(mensagem) => {
            setEditando(null)
            avisos.mostrar({ tipo: 'sucesso', titulo: 'Pronto!', descricao: mensagem })
            void instituicoes.recarregar()
          }}
        />
      )}
    </Cartao>
  )
}
