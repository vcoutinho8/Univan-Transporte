import { useState, type FormEvent } from 'react'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Cartao from '../../shared/components/Card.tsx'
import Gaveta from '../../shared/components/Drawer.tsx'
import EstadoVazio from '../../shared/components/EmptyState.tsx'
import Icone from '../../shared/components/Icon.tsx'
import CampoMoeda from '../../shared/components/MoneyInput.tsx'
import SeletorMes from '../../shared/components/MonthPicker.tsx'
import { useAviso, useConfirmacao } from '../../shared/components/NoticeModal.tsx'
import CabecalhoPagina from '../../shared/components/PageHeader.tsx'
import CartaoIndicador from '../../shared/components/StatCard.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { ErroApi, requisitar } from '../../shared/services/api.ts'
import { cnpjValido, dataIso, formatarCelular, formatarCnpj, formatarData, formatarMoeda, soDigitos } from '../../shared/utils/formatar.ts'
import { RelatorioInadimplenciaGestores } from '../relatorio/TableReport.tsx'

type Situacao = 'ativa' | 'em_negociacao' | 'inativa'

interface Gestor {
  id: number
  nome_fantasia: string | null
  razao_social: string
  cnpj: string
  responsavel: string | null
  status: Situacao
  valor_assinatura: string
  motivo_inativacao: string | null
  gestor: { id: number | null; nome: string; login: string; email: string | null } | null
  em_atraso_desde: string | null
  dias_para_inativar: number | null
}

interface Pagamento {
  id: number
  fk_empresa: number
  empresa: string
  competencia: string
  valor: string
  data_vencimento: string
  data_pagamento: string | null
  status: 'aberto' | 'pago' | 'cancelado'
  vencido: boolean
}

interface Painel {
  gestores_ativos: number
  em_negociacao: number
  inativos: number
  previsto_mes: string
  recebido_mes: string
  em_atraso: string
  meses: { mes: string; previsto: string; recebido: string }[]
}

const SITUACAO: Record<Situacao, [string, string]> = {
  ativa: ['Ativa', 'bg-emerald-100 text-emerald-700'],
  em_negociacao: ['Em negociação', 'bg-amber-100 text-amber-700'],
  inativa: ['Inativa', 'bg-red-100 text-red-700'],
}
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const reais = (v: string | number) => formatarMoeda(Number(v))
const mensagemDeErro = (e: unknown) => (e instanceof ErroApi ? e.mensagemCompleta : 'Algo saiu diferente do esperado. Tente de novo.')
const th = 'px-5 py-3'
const td = 'px-5 py-3'

/** Popup de resultado + recarregar, para as ações de linha das telas do gerente. */
function useExecutar(recarregar: () => unknown) {
  const avisos = useAviso()
  const confirmacao = useConfirmacao()
  async function executar(acao: () => Promise<unknown>, ok: string) {
    try {
      await acao()
      avisos.mostrar({ tipo: 'sucesso', titulo: 'Tudo certo!', descricao: ok })
      await recarregar()
    } catch (e) {
      avisos.erro(mensagemDeErro(e), 'Ops, algo não deu certo')
    }
  }
  return { executar, avisos, confirmacao, modais: [avisos.modal, confirmacao.modal] }
}

function Erro({ texto }: { texto?: string | null }) {
  return texto ? <span className="mt-1 block text-xs font-semibold text-red-600">{texto}</span> : null
}

// ---------------------------------------------------------------- painel

/** Painel do gerente: indicadores e o recebido de cada mês dentro do previsto. */
export default function PainelUnivan() {
  const painel = useRequisicao(() => requisitar<Painel>('/univan/painel'), [])
  const d = painel.dados
  return (
    <div>
      <CabecalhoPagina titulo="Painel do UniVan" descricao="Quem assina o app e como estão os pagamentos da assinatura." />
      {painel.erro && <Alerta mensagem={painel.erro} />}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CartaoIndicador rotulo="Gestores ativos" valor={d?.gestores_ativos} icone="empresa" tom="verde" para="/univan/gestores" detalhe="Ver gestores" />
        <CartaoIndicador rotulo="Em negociação" valor={d?.em_negociacao} icone="relogio" tom="ambar" atraso={60} para="/univan/inadimplencia" detalhe="Ver inadimplência" />
        <CartaoIndicador rotulo="Inativos" valor={d?.inativos} icone="cadeado" tom="vermelho" atraso={120} />
        <CartaoIndicador
          rotulo="Recebido no mês"
          valor={d ? Math.round(Number(d.recebido_mes) * 100) : undefined}
          formatar={(c) => formatarMoeda(c / 100)}
          icone="dinheiro"
          tom="laranja"
          atraso={180}
          detalhe={d ? `de ${reais(d.previsto_mes)} previstos` : undefined}
        />
      </div>
      <Cartao titulo="Assinaturas nos últimos 6 meses">{d ? <GraficoAssinaturas dados={d} /> : <div className="esqueleto h-64" />}</Cartao>
    </div>
  )
}

/** Valor "redondo" para o topo do eixo (ex.: 1.180 → 1.500). */
function topoDoEixo(maior: number): number {
  if (maior <= 0) return 100
  const passo = 10 ** Math.floor(Math.log10(maior)) / 2
  return Math.ceil(maior / passo) * passo
}

/**
 * Barras de "recebido dentro do previsto": a trilha cinza é o previsto do mês e o laranja, o que
 * entrou. Um eixo só (R$), grade discreta, percentual escrito só no mês atual e detalhe no hover/foco.
 */
function GraficoAssinaturas({ dados }: { dados: Painel }) {
  const topo = topoDoEixo(Math.max(...dados.meses.map((m) => Number(m.previsto))))
  const linhas = [1, 0.5, 0]
  const altura = (v: string) => `${(Number(v) / topo) * 100}%`
  const ultimo = dados.meses.length - 1
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-laranja" /> Recebido
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-slate-200 ring-1 ring-slate-300" /> Previsto
        </span>
        <span className="ml-auto flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-red-700">
          <Icone nome="alerta" className="h-3.5 w-3.5" />
          Em atraso: {reais(dados.em_atraso)}
        </span>
      </div>
      <div className="flex gap-3">
        <div className="relative h-56 w-16 shrink-0 text-right text-[11px] text-slate-400 tabular-nums" aria-hidden>
          {linhas.map((l) => (
            <span key={l} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - l) * 100}%` }}>
              {formatarMoeda(topo * l).replace(',00', '')}
            </span>
          ))}
        </div>
        <div className="relative h-56 flex-1">
          {linhas.map((l) => (
            <div key={l} className={`absolute inset-x-0 border-t ${l === 0 ? 'border-slate-300' : 'border-dashed border-slate-200'}`} style={{ top: `${(1 - l) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end justify-around gap-2">
            {dados.meses.map((m, i) => {
              const nome = MESES[Number(m.mes.slice(5, 7)) - 1]
              const previsto = Number(m.previsto)
              const pct = previsto ? Math.round((Number(m.recebido) / previsto) * 100) : 0
              return (
                <div
                  key={m.mes}
                  tabIndex={0}
                  aria-label={`${nome}: recebido ${reais(m.recebido)} de ${reais(m.previsto)} previstos`}
                  className="group relative flex h-full w-full max-w-16 items-end justify-center outline-none"
                >
                  <div className="relative w-8 rounded-t bg-slate-200 transition-colors group-hover:bg-slate-300 group-focus:bg-slate-300 sm:w-10" style={{ height: altura(m.previsto) }}>
                    <div className="absolute inset-x-0 bottom-0 rounded-t bg-laranja" style={{ height: `${Math.min(pct, 100)}%` }} />
                  </div>
                  {i === ultimo && previsto > 0 && (
                    <span className="absolute pb-1 text-[11px] font-bold text-marinho tabular-nums" style={{ bottom: altura(m.previsto) }}>
                      {pct}%
                    </span>
                  )}
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-44 -translate-x-1/2 rounded-xl bg-marinho p-3 text-xs text-white shadow-lg group-hover:block group-focus:block">
                    <p className="font-bold capitalize">
                      {nome}/{m.mes.slice(0, 4)}
                    </p>
                    <p className="mt-1 flex justify-between gap-2">
                      <span className="text-white/70">Previsto</span> {reais(m.previsto)}
                    </p>
                    <p className="flex justify-between gap-2">
                      <span className="text-white/70">Recebido</span> {reais(m.recebido)} ({pct}%)
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="mt-2 flex gap-3">
        <div className="w-16 shrink-0" />
        <div className="flex flex-1 justify-around gap-2">
          {dados.meses.map((m) => (
            <span key={m.mes} className="w-full max-w-16 text-center text-xs font-bold text-slate-500 capitalize">
              {MESES[Number(m.mes.slice(5, 7)) - 1]}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- gestores

export function GestoresUnivan() {
  const lista = useRequisicao(() => requisitar<Gestor[]>('/univan/gestores'), [])
  const { executar, confirmacao, avisos, modais } = useExecutar(lista.recarregar)
  const [novo, setNovo] = useState(false)

  async function inativar(g: Gestor) {
    const nome = g.nome_fantasia ?? g.razao_social
    const motivo = await confirmacao.pedirTexto({
      titulo: `Inativar ${nome}?`,
      descricao: 'Os usuários desta empresa não conseguem mais entrar até você reativar.',
      botao: 'Inativar',
      perigo: true,
      campo: { rotulo: 'Motivo', placeholder: 'Ex.: pediu cancelamento' },
    })
    if (motivo) void executar(() => requisitar(`/univan/gestores/${g.id}/inativar`, { metodo: 'POST', corpo: { motivo } }), `${nome} foi inativada.`)
  }

  return (
    <div>
      {modais}
      <CabecalhoPagina
        titulo="Gestores"
        descricao="Empresas que assinam o UniVan. O gestor entra com o CNPJ da empresa."
        acoes={
          <Botao onClick={() => setNovo(true)}>
            <Icone nome="mais" className="h-4 w-4" />
            Novo gestor
          </Botao>
        }
      />
      <Cartao semEspaco>
        {lista.erro ? (
          <div className="p-5">
            <Alerta mensagem={lista.erro} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-[#f7f7f7] text-xs font-bold text-slate-500 uppercase">
                <tr>
                  <th className={th}>Empresa</th>
                  <th className={th}>CNPJ (acesso)</th>
                  <th className={th}>Responsável</th>
                  <th className={th}>Situação</th>
                  <th className={`${th} text-right`}>Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.carregando && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                      Carregando...
                    </td>
                  </tr>
                )}
                {lista.dados?.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EstadoVazio icone="empresa" titulo="Nenhum gestor ainda" descricao="Crie o primeiro gestor do UniVan." compacto />
                    </td>
                  </tr>
                )}
                {(lista.dados ?? []).map((g) => (
                  <tr key={g.id} className="transition-colors hover:bg-fundo/50">
                    <td className={td}>
                      <p className="font-semibold text-marinho">{g.nome_fantasia ?? g.razao_social}</p>
                      <p className="text-xs text-slate-500">{g.razao_social}</p>
                    </td>
                    <td className={`${td} font-mono text-xs whitespace-nowrap`}>{formatarCnpj(g.cnpj)}</td>
                    <td className={td}>
                      <p>{g.responsavel ?? '—'}</p>
                      {g.gestor?.email && <p className="text-xs text-slate-500">{g.gestor.email}</p>}
                    </td>
                    <td className={td}>
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${SITUACAO[g.status][1]}`}>{SITUACAO[g.status][0]}</span>
                      {g.status === 'em_negociacao' && g.em_atraso_desde && (
                        <p className="mt-1 text-xs font-semibold text-amber-700">
                          Desde {formatarData(g.em_atraso_desde)} · {g.dias_para_inativar} dia(s) para inativar
                        </p>
                      )}
                      {g.status === 'inativa' && g.motivo_inativacao && <p className="mt-1 text-xs font-semibold text-red-600">{g.motivo_inativacao}</p>}
                    </td>
                    <td className={td}>
                      <div className="flex justify-end">
                        {g.status === 'inativa' ? (
                          <Botao
                            variante="secundario"
                            className="px-3 py-1.5"
                            onClick={() => void executar(() => requisitar(`/univan/gestores/${g.id}/reativar`, { metodo: 'POST' }), `${g.nome_fantasia ?? g.razao_social} voltou a ter acesso.`)}
                          >
                            Reativar
                          </Botao>
                        ) : (
                          <Botao variante="perigo" className="px-3 py-1.5" onClick={() => void inativar(g)}>
                            Inativar
                          </Botao>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
      {novo && (
        <FormularioGestor
          aoFechar={() => setNovo(false)}
          aoSalvar={async (dados) => {
            await requisitar('/univan/gestores', { metodo: 'POST', corpo: dados })
            setNovo(false)
            avisos.mostrar({
              tipo: 'sucesso',
              titulo: 'Gestor criado!',
              descricao: `${dados.nome_fantasia} entrou no UniVan. O gestor entra com o CNPJ ${formatarCnpj(dados.cnpj)} e a senha 123456.`,
            })
            await lista.recarregar()
          }}
        />
      )}
    </div>
  )
}

interface DadosGestor {
  nome_fantasia: string
  razao_social: string | null
  cnpj: string
  responsavel: string
  email: string | null
  telefone: string | null
}

/** Novo gestor: validação na tela (sem o balão do navegador) e, se a API recusar, o que foi digitado fica. */
function FormularioGestor({ aoSalvar, aoFechar }: { aoSalvar: (dados: DadosGestor) => Promise<void>; aoFechar: () => void }) {
  const [v, setV] = useState({ nome_fantasia: '', razao_social: '', cnpj: '', responsavel: '', email: '', telefone: '' })
  const [tocado, setTocado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erroApi, setErroApi] = useState<string | null>(null)
  const mudar = (campo: keyof typeof v, valor: string) => setV((atual) => ({ ...atual, [campo]: valor }))

  const telefone = soDigitos(v.telefone)
  const erros = {
    nome_fantasia: !v.nome_fantasia.trim() ? 'Informe o nome fantasia.' : undefined,
    cnpj: !soDigitos(v.cnpj) ? 'Informe o CNPJ.' : !cnpjValido(v.cnpj) ? 'CNPJ inválido. Confira os 14 números.' : undefined,
    responsavel: !v.responsavel.trim() ? 'Informe quem administra a empresa.' : undefined,
    email: v.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim()) ? 'E-mail inválido. Ex.: nome@empresa.com.br' : undefined,
    telefone: telefone && telefone.length !== 10 && telefone.length !== 11 ? 'Informe o DDD e o número.' : undefined,
  }
  const mostrar = (campo: keyof typeof erros) => (tocado ? erros[campo] : undefined)
  const campo = (erro?: string) => `campo ${erro ? 'border-red-300 ring-2 ring-red-100' : ''}`

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setTocado(true)
    if (Object.values(erros).some(Boolean)) return
    setEnviando(true)
    setErroApi(null)
    try {
      await aoSalvar({
        nome_fantasia: v.nome_fantasia.trim(),
        razao_social: v.razao_social.trim() || null,
        cnpj: soDigitos(v.cnpj),
        responsavel: v.responsavel.trim(),
        email: v.email.trim() || null,
        telefone: telefone || null,
      })
    } catch (erro) {
      setErroApi(mensagemDeErro(erro))
    } finally {
      setEnviando(false)
    }
  }

  const rotulo = 'block text-sm font-semibold text-marinho'
  return (
    <Gaveta titulo="Novo gestor" descricao="A empresa que vai usar o UniVan e quem a administra." aoFechar={aoFechar} largura="max-w-lg">
      <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {erroApi && <Alerta mensagem={erroApi} />}
          <label className={rotulo}>
            Nome fantasia
            <input maxLength={100} value={v.nome_fantasia} onChange={(e) => mudar('nome_fantasia', e.target.value)} className={campo(mostrar('nome_fantasia'))} placeholder="Ex.: Vans do Sul" />
            <Erro texto={mostrar('nome_fantasia')} />
          </label>
          <label className={rotulo}>
            Razão social <span className="font-normal text-slate-400">(opcional)</span>
            <input maxLength={100} value={v.razao_social} onChange={(e) => mudar('razao_social', e.target.value)} className="campo" placeholder="Ex.: Vans do Sul Transportes Ltda" />
          </label>
          <label className={rotulo}>
            CNPJ <span className="font-normal text-slate-400">(é o acesso do gestor)</span>
            <input inputMode="numeric" value={v.cnpj} onChange={(e) => mudar('cnpj', formatarCnpj(e.target.value))} className={campo(mostrar('cnpj'))} placeholder="00.000.000/0000-00" />
            <Erro texto={mostrar('cnpj')} />
          </label>
          <label className={rotulo}>
            Responsável (gestor)
            <input maxLength={100} value={v.responsavel} onChange={(e) => mudar('responsavel', e.target.value)} className={campo(mostrar('responsavel'))} placeholder="Nome de quem administra" />
            <Erro texto={mostrar('responsavel')} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={rotulo}>
              E-mail <span className="font-normal text-slate-400">(recupera a senha)</span>
              <input type="email" maxLength={120} value={v.email} onChange={(e) => mudar('email', e.target.value)} className={campo(mostrar('email'))} placeholder="nome@empresa.com.br" />
              <Erro texto={mostrar('email')} />
            </label>
            <label className={rotulo}>
              Telefone <span className="font-normal text-slate-400">(opcional)</span>
              <input inputMode="tel" value={v.telefone} onChange={(e) => mudar('telefone', formatarCelular(e.target.value))} className={campo(mostrar('telefone'))} placeholder="(27) 99999-0000" />
              <Erro texto={mostrar('telefone')} />
            </label>
          </div>
          <p className="rounded-xl bg-laranja/5 p-3 text-xs text-marinho ring-1 ring-laranja/20">
            O gestor entra com o <strong>CNPJ</strong> e a senha <strong>123456</strong>, e cria a própria senha no primeiro acesso. A assinatura segue o valor geral,
            definido em Pagamentos.
          </p>
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <Botao type="button" variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" disabled={enviando}>
            {enviando ? 'Criando...' : 'Criar gestor'}
          </Botao>
        </footer>
      </form>
    </Gaveta>
  )
}

// ---------------------------------------------------------------- pagamentos

/** Valor geral da assinatura: um bloco só, que muda para todos os gestores. */
function BlocoAssinatura({ aoMudar }: { aoMudar: () => unknown }) {
  const assinatura = useRequisicao(() => requisitar<{ valor: string }>('/univan/assinatura'), [])
  const [editando, setEditando] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const avisos = useAviso()

  async function salvar() {
    if (!editando) return setErro('Informe o valor da assinatura.')
    try {
      await requisitar('/univan/assinatura', { metodo: 'PUT', corpo: { valor: editando } })
      avisos.mostrar({ tipo: 'sucesso', titulo: 'Assinatura atualizada!', descricao: `Todos os gestores passam a pagar ${formatarMoeda(editando)} por mês, a partir das cobranças que ainda não venceram.` })
      setEditando(null)
      setErro(null)
      await Promise.all([assinatura.recarregar(), aoMudar()])
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
      {avisos.modal}
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-laranja/10 text-laranja">
        <Icone nome="dinheiro" className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-500">Assinatura mensal · vale para todos os gestores</p>
        {editando === null ? (
          <p className="text-2xl font-extrabold text-marinho tabular-nums">{assinatura.dados ? reais(assinatura.dados.valor) : '—'}</p>
        ) : (
          <div className="mt-1 max-w-48">
            <CampoMoeda autoFocus valor={editando} aoMudar={(v) => setEditando(v ?? 0)} className="campo mt-0" />
          </div>
        )}
        <Erro texto={erro} />
      </div>
      {editando === null ? (
        <Botao variante="secundario" disabled={!assinatura.dados} onClick={() => setEditando(Number(assinatura.dados!.valor))}>
          <Icone nome="editar" className="h-4 w-4" />
          Alterar valor
        </Botao>
      ) : (
        <div className="flex gap-2">
          <Botao
            variante="secundario"
            onClick={() => {
              setEditando(null)
              setErro(null)
            }}
          >
            Cancelar
          </Botao>
          <Botao onClick={() => void salvar()}>Salvar para todos</Botao>
        </div>
      )}
    </div>
  )
}

export function PagamentosUnivan() {
  const [competencia, setCompetencia] = useState(`${dataIso().slice(0, 7)}-01`)
  const lista = useRequisicao(() => requisitar<Pagamento[]>('/univan/pagamentos', { parametros: { competencia } }), [competencia])
  const { executar, confirmacao, modais } = useExecutar(lista.recarregar)

  return (
    <div>
      {modais}
      <CabecalhoPagina
        titulo="Pagamentos"
        descricao="Assinatura de cada gestor, mês a mês."
        acoes={
          <Botao
            variante="secundario"
            onClick={() => void executar(() => requisitar('/univan/pagamentos/gerar', { metodo: 'POST', parametros: { competencia } }), 'Assinaturas do mês lançadas.')}
          >
            <Icone nome="mais" className="h-4 w-4" />
            Lançar assinaturas do mês
          </Botao>
        }
      />
      <BlocoAssinatura aoMudar={lista.recarregar} />
      <div className="mb-4">
        <SeletorMes competencia={competencia} aoMudar={setCompetencia} />
      </div>
      <Cartao semEspaco>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-[#f7f7f7] text-xs font-bold text-slate-500 uppercase">
              <tr>
                <th className={th}>Empresa</th>
                <th className={`${th} text-right`}>Valor</th>
                <th className={th}>Vencimento</th>
                <th className={th}>Pagamento</th>
                <th className={th}>Situação</th>
                <th className={`${th} text-right`}>Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.carregando && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    Carregando...
                  </td>
                </tr>
              )}
              {lista.dados?.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EstadoVazio icone="dinheiro" titulo="Nenhuma assinatura neste mês" descricao="Use “Lançar assinaturas do mês”." compacto />
                  </td>
                </tr>
              )}
              {(lista.dados ?? []).map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-fundo/50">
                  <td className={`${td} font-semibold text-marinho`}>{p.empresa}</td>
                  <td className={`${td} text-right font-bold text-marinho tabular-nums`}>{reais(p.valor)}</td>
                  <td className={`${td} tabular-nums ${p.vencido ? 'font-semibold text-red-600' : ''}`}>{formatarData(p.data_vencimento)}</td>
                  <td className={`${td} tabular-nums`}>{p.data_pagamento ? formatarData(p.data_pagamento) : '—'}</td>
                  <td className={td}>
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${p.status === 'pago' ? 'bg-emerald-100 text-emerald-700' : p.vencido ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}
                    >
                      {p.status === 'pago' ? 'Pago' : p.vencido ? 'Vencido' : 'Em aberto'}
                    </span>
                  </td>
                  <td className={td}>
                    {p.status === 'aberto' && (
                      <div className="flex justify-end">
                        <Botao
                          className="px-3 py-1.5 text-xs"
                          onClick={async () => {
                            const sim = await confirmacao.confirmar({ titulo: `Pagamento de ${p.empresa} recebido?`, descricao: `${reais(p.valor)}. O acesso fica liberado.`, botao: 'Recebido' })
                            if (sim) void executar(() => requisitar(`/univan/pagamentos/${p.id}/baixa`, { metodo: 'POST' }), `Pagamento de ${p.empresa} registrado!`)
                          }}
                        >
                          Recebido
                        </Botao>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </div>
  )
}

// ---------------------------------------------------------------- inadimplência

export function InadimplenciaUnivan() {
  return (
    <div>
      <CabecalhoPagina titulo="Inadimplência" descricao="Gestores com a assinatura em atraso e quantos dias faltam para a inativação automática." />
      <RelatorioInadimplenciaGestores />
    </div>
  )
}
