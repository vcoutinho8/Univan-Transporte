import { useState, type FormEvent } from 'react'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Cartao from '../../shared/components/Card.tsx'
import Gaveta from '../../shared/components/Drawer.tsx'
import EstadoVazio from '../../shared/components/EmptyState.tsx'
import Icone from '../../shared/components/Icon.tsx'
import CampoMoeda from '../../shared/components/MoneyInput.tsx'
import SeletorMes, { nomeDoMes } from '../../shared/components/MonthPicker.tsx'
import { useAviso, useConfirmacao } from '../../shared/components/NoticeModal.tsx'
import CabecalhoPagina from '../../shared/components/PageHeader.tsx'
import CartaoIndicador from '../../shared/components/StatCard.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { ErroApi } from '../../shared/services/api.ts'
import { combinaBusca } from '../../shared/utils/busca.ts'
import { dataIso, formatarData, formatarMoeda, soDigitos } from '../../shared/utils/formatar.ts'
import { servicoMotorista } from '../motorista/driverService.ts'
import { servicoVeiculo } from '../veiculo/vehicleService.ts'
import { ROTULOS_CATEGORIA, servicoFinanceiro, type CategoriaGasto, type Gasto, type Mensalidade, type NovoGasto } from './financeService.ts'

type Aba = 'receber' | 'pagar'
const reais = (valor: string | null) => formatarMoeda(Number(valor ?? 0))
const centavos = (valor: string | number | undefined) => (valor === undefined ? undefined : Math.round(Number(valor) * 100))
const emReais = (c: number) => formatarMoeda(c / 100)
const mensagemDeErro = (e: unknown) => (e instanceof ErroApi ? e.mensagemCompleta : 'Algo saiu diferente do esperado. Tente de novo.')

const th = 'px-5 py-3'
const td = 'px-5 py-3'

function Situacao({ status, vencido }: { status: string; vencido: boolean }) {
  const [cor, texto] =
    status === 'pago'
      ? ['bg-emerald-100 text-emerald-700', 'Pago']
      : status === 'cancelado'
        ? ['bg-slate-100 text-slate-500', 'Cancelado']
        : vencido
          ? ['bg-red-100 text-red-700', 'Vencido']
          : ['bg-amber-100 text-amber-700', 'Em aberto']
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${cor}`}>{texto}</span>
}

/** Cobrança simpática pelo WhatsApp do passageiro (mensalidade em aberto ou vencida). */
function linkCobranca(m: Mensalidade, mes: string): string {
  const nome = m.estudante.apelido || m.estudante.nome.split(' ')[0]
  const texto = m.vencido
    ? `Olá, ${nome}! Tudo bem? 😊 Passando para lembrar que a mensalidade do transporte de ${mes} (${reais(m.valor)}) venceu em ${formatarData(m.data_vencimento)}. Se já pagou, desconsidere. Obrigado!`
    : `Olá, ${nome}! Tudo bem? 😊 A mensalidade do transporte de ${mes} (${reais(m.valor)}) vence em ${formatarData(m.data_vencimento)}. Qualquer dúvida, é só chamar!`
  return `https://wa.me/55${soDigitos(m.estudante.celular ?? '')}?text=${encodeURIComponent(texto)}`
}

/**
 * Financeiro (gestor e auxiliar). As mensalidades e os salários do mês corrente entram sozinhos
 * (dos cadastros de passageiro e motorista); a pessoa registra os pagamentos e lança os gastos.
 */
export default function PaginaFinancas() {
  const mesAtual = `${dataIso().slice(0, 7)}-01`
  const [aba, setAba] = useState<Aba>('receber')
  const [competencia, setCompetencia] = useState(mesAtual)
  const [versao, setVersao] = useState(0)
  const resumo = useRequisicao(() => servicoFinanceiro.resumo(competencia), [competencia, versao])
  const avisos = useAviso()
  const confirmacao = useConfirmacao()

  /** Ação de linha (registrar pagamento, cancelar gasto): popup do resultado e recarrega tudo. */
  async function executar(acao: () => Promise<unknown>, ok: string) {
    try {
      await acao()
      avisos.mostrar({ tipo: 'sucesso', titulo: 'Tudo certo!', descricao: ok })
      setVersao((v) => v + 1)
    } catch (e) {
      avisos.erro(mensagemDeErro(e), 'Ops, algo não deu certo')
    }
  }

  const d = resumo.dados
  return (
    <div>
      {avisos.modal}
      {confirmacao.modal}
      <CabecalhoPagina
        titulo="Financeiro"
        descricao="Mensalidades dos passageiros e gastos com motoristas e veículos."
        acoes={
          <nav className="flex gap-1 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200/70" aria-label="Abas">
            {(['receber', 'pagar'] as Aba[]).map((a) => (
              <button
                key={a}
                onClick={() => setAba(a)}
                aria-current={aba === a ? 'page' : undefined}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all duration-200 ${aba === a ? 'bg-laranja text-white shadow-md shadow-laranja/30' : 'text-marinho hover:bg-fundo'}`}
              >
                <Icone nome={a === 'receber' ? 'dinheiro' : 'documento'} className="h-4 w-4" />
                {a === 'receber' ? 'A receber' : 'A pagar'}
              </button>
            ))}
          </nav>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SeletorMes competencia={competencia} aoMudar={setCompetencia} ate={mesAtual} />
        {competencia === mesAtual && (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Icone nome="ok" className="h-4 w-4 text-emerald-500" />
            Mensalidades e salários do mês lançados automaticamente
          </p>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {aba === 'receber' ? (
          <>
            <CartaoIndicador rotulo="A receber no mês" valor={centavos(d?.a_receber)} formatar={emReais} icone="dinheiro" tom="marinho" />
            <CartaoIndicador rotulo="Recebido" valor={centavos(d?.recebido)} formatar={emReais} icone="ok" tom="verde" atraso={60} />
            <CartaoIndicador rotulo="Em aberto" valor={centavos(d?.em_aberto)} formatar={emReais} icone="relogio" tom="ambar" atraso={120} />
            <CartaoIndicador rotulo="Vencido" valor={centavos(d?.vencido)} formatar={emReais} icone="alerta" tom="vermelho" atraso={180} />
          </>
        ) : (
          <>
            <CartaoIndicador rotulo="Gastos do mês" valor={centavos(d?.a_pagar)} formatar={emReais} icone="documento" tom="marinho" />
            <CartaoIndicador rotulo="Pago" valor={centavos(d?.pago)} formatar={emReais} icone="ok" tom="verde" atraso={60} />
            <CartaoIndicador rotulo="Falta pagar" valor={d && centavos(Number(d.a_pagar) - Number(d.pago))} formatar={emReais} icone="relogio" tom="ambar" atraso={120} />
            <CartaoIndicador rotulo="Saldo (recebido − pago)" valor={centavos(d?.saldo)} formatar={emReais} icone="tendencia" tom="laranja" atraso={180} />
          </>
        )}
      </div>

      {aba === 'receber' ? (
        <ListaMensalidades competencia={competencia} versao={versao} confirmacao={confirmacao} executar={executar} />
      ) : (
        <ListaGastos
          competencia={competencia}
          versao={versao}
          confirmacao={confirmacao}
          executar={executar}
          aoLancar={(g) => {
            avisos.mostrar({ tipo: 'sucesso', titulo: 'Tudo certo!', descricao: `“${g.descricao}” foi lançado nos gastos.` })
            setVersao((v) => v + 1)
          }}
        />
      )}
    </div>
  )
}

type Executar = (acao: () => Promise<unknown>, ok: string) => Promise<void>
type Confirmacao = ReturnType<typeof useConfirmacao>

const FILTROS = { todas: 'Todas', abertas: 'Em aberto', vencidas: 'Vencidas', pagas: 'Pagas' } as const

function ListaMensalidades({ competencia, versao, confirmacao, executar }: { competencia: string; versao: number; confirmacao: Confirmacao; executar: Executar }) {
  const lista = useRequisicao(() => servicoFinanceiro.mensalidades(competencia), [competencia, versao])
  const [filtro, setFiltro] = useState<keyof typeof FILTROS>('todas')
  const [busca, setBusca] = useState('')
  const mes = nomeDoMes(competencia)
  const visiveis = (lista.dados ?? []).filter(
    (m) =>
      combinaBusca([m.estudante.nome, m.estudante.apelido], busca) &&
      (filtro === 'todas' ? true : filtro === 'pagas' ? m.status === 'pago' : filtro === 'vencidas' ? m.vencido : m.status === 'aberto' && !m.vencido),
  )

  return (
    <Cartao
      semEspaco
      acoes={
        <div className="flex w-full flex-wrap items-center gap-3">
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">Buscar passageiro</span>
            <Icone nome="busca" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar passageiro" className="campo mt-0 rounded-full bg-fundo pl-9" />
          </label>
          <select aria-label="Situação" value={filtro} onChange={(e) => setFiltro(e.target.value as keyof typeof FILTROS)} className="campo mt-0 w-auto">
            {Object.entries(FILTROS).map(([chave, rotulo]) => (
              <option key={chave} value={chave}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {lista.erro ? (
        <div className="px-5 pb-5">
          <Alerta mensagem={lista.erro} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-y border-slate-100 bg-[#f7f7f7] text-xs font-bold text-slate-500 uppercase">
              <tr>
                <th className={th}>Passageiro</th>
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
              {!lista.carregando && visiveis.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EstadoVazio
                      icone="dinheiro"
                      titulo={lista.dados?.length ? 'Nenhuma mensalidade com esse filtro' : `Sem mensalidades em ${mes}`}
                      descricao={lista.dados?.length ? 'Troque a busca ou a situação.' : 'As mensalidades entram sozinhas no mês corrente, a partir do cadastro dos passageiros.'}
                      compacto
                    />
                  </td>
                </tr>
              )}
              {!lista.carregando &&
                visiveis.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-fundo/50">
                    <td className={`${td} font-semibold text-marinho`}>{m.estudante.nome}</td>
                    <td className={`${td} text-right font-bold text-marinho tabular-nums`}>{reais(m.valor)}</td>
                    <td className={`${td} tabular-nums ${m.vencido ? 'font-semibold text-red-600' : ''}`}>{formatarData(m.data_vencimento)}</td>
                    <td className={`${td} tabular-nums`}>{m.data_recebimento ? formatarData(m.data_recebimento) : '—'}</td>
                    <td className={td}>
                      <Situacao status={m.status} vencido={m.vencido} />
                    </td>
                    <td className={td}>
                      {m.status === 'aberto' && (
                        <div className="flex items-center justify-end gap-2">
                          {m.estudante.celular && (
                            <a
                              href={linkCobranca(m, mes)}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold whitespace-nowrap text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                            >
                              {m.vencido ? 'Cobrar no WhatsApp' : 'Lembrar no WhatsApp'}
                            </a>
                          )}
                          <Botao
                            className="px-3 py-1.5 text-xs"
                            onClick={async () => {
                              const sim = await confirmacao.confirmar({ titulo: `Registrar o pagamento de ${m.estudante.nome}?`, descricao: `${reais(m.valor)} recebidos hoje.`, botao: 'Registrar' })
                              if (sim) void executar(() => servicoFinanceiro.receber(m.id), `Pagamento de ${m.estudante.nome} registrado.`)
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
      )}
    </Cartao>
  )
}

function ListaGastos({
  competencia,
  versao,
  confirmacao,
  executar,
  aoLancar,
}: {
  competencia: string
  versao: number
  confirmacao: Confirmacao
  executar: Executar
  aoLancar: (g: Gasto) => void
}) {
  const lista = useRequisicao(() => servicoFinanceiro.gastos(competencia), [competencia, versao])
  const [novo, setNovo] = useState(false)

  return (
    <Cartao
      semEspaco
      acoes={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">Os salários vêm do cadastro de cada motorista. Lance aqui manutenção, combustível e outros.</p>
          <Botao onClick={() => setNovo(true)}>
            <Icone nome="mais" className="h-4 w-4" />
            Novo gasto
          </Botao>
        </div>
      }
    >
      {lista.erro ? (
        <div className="px-5 pb-5">
          <Alerta mensagem={lista.erro} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-y border-slate-100 bg-[#f7f7f7] text-xs font-bold text-slate-500 uppercase">
              <tr>
                <th className={th}>Descrição</th>
                <th className={th}>Tipo</th>
                <th className={th}>Motorista / veículo</th>
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
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-500">
                    Carregando...
                  </td>
                </tr>
              )}
              {!lista.carregando && lista.dados?.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EstadoVazio icone="documento" titulo="Nenhum gasto neste mês" descricao="Lance aqui manutenção, combustível e outros gastos." compacto />
                  </td>
                </tr>
              )}
              {!lista.carregando &&
                (lista.dados ?? []).map((g) => (
                  <tr key={g.id} className="transition-colors hover:bg-fundo/50">
                    <td className={`${td} font-semibold text-marinho`}>{g.descricao}</td>
                    <td className={td}>{ROTULOS_CATEGORIA[g.categoria]}</td>
                    <td className={`${td} text-slate-600`}>{[g.motorista?.nome, g.veiculo_placa].filter(Boolean).join(' · ') || '—'}</td>
                    <td className={`${td} text-right font-bold text-marinho tabular-nums`}>{reais(g.valor)}</td>
                    <td className={`${td} tabular-nums ${g.vencido ? 'font-semibold text-red-600' : ''}`}>{formatarData(g.data_vencimento)}</td>
                    <td className={`${td} tabular-nums`}>{g.data_pagamento ? formatarData(g.data_pagamento) : '—'}</td>
                    <td className={td}>
                      <Situacao status={g.status} vencido={g.vencido} />
                    </td>
                    <td className={td}>
                      {g.status === 'aberto' && (
                        <div className="flex items-center justify-end gap-2">
                          {g.categoria !== 'salario' && (
                            <Botao
                              variante="fantasma"
                              className="px-3 py-1.5 text-xs text-red-500"
                              onClick={async () => {
                                const sim = await confirmacao.confirmar({ titulo: 'Cancelar este gasto?', descricao: g.descricao, botao: 'Cancelar gasto', perigo: true })
                                if (sim) void executar(() => servicoFinanceiro.cancelarGasto(g.id), 'Gasto cancelado.')
                              }}
                            >
                              Cancelar
                            </Botao>
                          )}
                          <Botao
                            className="px-3 py-1.5 text-xs"
                            onClick={async () => {
                              const sim = await confirmacao.confirmar({ titulo: `Marcar “${g.descricao}” como pago?`, descricao: `${reais(g.valor)} pagos hoje.`, botao: 'Pago' })
                              if (sim) void executar(() => servicoFinanceiro.pagarGasto(g.id), 'Pagamento registrado!')
                            }}
                          >
                            Pago
                          </Botao>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {novo && (
        <FormularioGasto
          aoFechar={() => setNovo(false)}
          aoSalvar={async (dados) => {
            const gasto = await servicoFinanceiro.lancarGasto(dados)
            setNovo(false)
            aoLancar(gasto)
          }}
        />
      )}
    </Cartao>
  )
}

const TIPOS: CategoriaGasto[] = ['manutencao', 'combustivel', 'outros']

function Erro({ texto }: { texto?: string }) {
  return texto ? <span className="mt-1 block text-xs font-semibold text-red-600">{texto}</span> : null
}

/** Novo gasto: o motorista escolhido traz o veículo vinculado a ele. Erro da API mantém o que foi digitado. */
function FormularioGasto({ aoSalvar, aoFechar }: { aoSalvar: (dados: NovoGasto) => Promise<void>; aoFechar: () => void }) {
  const motoristas = useRequisicao(() => servicoMotorista.listar({ status: 'ativo' }))
  const veiculos = useRequisicao(() => servicoVeiculo.listar({ status: 'ativo' }))
  const [categoria, setCategoria] = useState<CategoriaGasto>('manutencao')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState<number | null>(null)
  const [vencimento, setVencimento] = useState(dataIso())
  const [motorista, setMotorista] = useState('')
  const [veiculo, setVeiculo] = useState('')
  const [tocado, setTocado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erroApi, setErroApi] = useState<string | null>(null)

  const erros = {
    descricao: categoria === 'outros' && !descricao.trim() ? 'Descreva o gasto (ex.: Lavagem da van).' : undefined,
    valor: !valor ? 'Informe o valor.' : undefined,
    vencimento: !vencimento ? 'Informe o vencimento.' : undefined,
  }
  const mostrar = (campo: keyof typeof erros) => (tocado ? erros[campo] : undefined)

  function escolherMotorista(id: string) {
    setMotorista(id)
    const vinculado = (motoristas.dados ?? []).find((m) => String(m.id) === id)?.fk_veiculo
    if (vinculado) setVeiculo(String(vinculado))
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setTocado(true)
    if (Object.values(erros).some(Boolean)) return
    setEnviando(true)
    setErroApi(null)
    try {
      await aoSalvar({
        categoria,
        descricao: descricao.trim() || null,
        valor: valor!,
        data_vencimento: vencimento,
        fk_motorista: motorista ? Number(motorista) : null,
        fk_veiculo: veiculo ? Number(veiculo) : null,
      })
    } catch (erro) {
      setErroApi(mensagemDeErro(erro))
    } finally {
      setEnviando(false)
    }
  }

  const rotulo = 'block text-sm font-semibold text-marinho'
  const campo = (erro?: string) => `campo ${erro ? 'border-red-300 ring-2 ring-red-100' : ''}`
  const motoristasDoVeiculo = (id: number) => (motoristas.dados ?? []).filter((m) => m.fk_veiculo === id).map((m) => m.nome.split(' ')[0])

  return (
    <Gaveta titulo="Novo gasto" descricao="Manutenção, combustível ou outro gasto da operação." aoFechar={aoFechar} largura="max-w-lg">
      <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {erroApi && <Alerta mensagem={erroApi} />}
          <div>
            <p className={rotulo}>Tipo</p>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {TIPOS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setCategoria(t)}
                  aria-pressed={categoria === t}
                  className={`rounded-xl px-3 py-2.5 text-sm font-bold ring-1 transition-colors ${categoria === t ? 'bg-laranja text-white ring-laranja' : 'bg-white text-marinho ring-slate-200 hover:bg-fundo'}`}
                >
                  {ROTULOS_CATEGORIA[t]}
                </button>
              ))}
            </div>
          </div>
          <label className={rotulo}>
            Descrição {categoria !== 'outros' && <span className="font-normal text-slate-400">(opcional)</span>}
            <input
              maxLength={150}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className={campo(mostrar('descricao'))}
              placeholder={categoria === 'combustivel' ? 'Ex.: Abastecimento' : categoria === 'manutencao' ? 'Ex.: Troca de pneus' : 'Ex.: Lavagem da van'}
            />
            <Erro texto={mostrar('descricao')} />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className={rotulo}>
              Valor
              <CampoMoeda valor={valor} aoMudar={setValor} className={campo(mostrar('valor'))} />
              <Erro texto={mostrar('valor')} />
            </label>
            <label className={rotulo}>
              Vencimento
              <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={campo(mostrar('vencimento'))} />
              <Erro texto={mostrar('vencimento')} />
            </label>
          </div>
          <label className={rotulo}>
            Motorista <span className="font-normal text-slate-400">(opcional: traz o veículo dele)</span>
            <select value={motorista} onChange={(e) => escolherMotorista(e.target.value)} className="campo">
              <option value="">—</option>
              {(motoristas.dados ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                  {m.veiculo ? ` · ${m.veiculo.placa}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className={rotulo}>
            Veículo <span className="font-normal text-slate-400">(opcional)</span>
            <select value={veiculo} onChange={(e) => setVeiculo(e.target.value)} className="campo">
              <option value="">—</option>
              {(veiculos.dados ?? []).map((v) => {
                const nomes = motoristasDoVeiculo(v.id)
                return (
                  <option key={v.id} value={v.id}>
                    {v.placa} · {v.modelo}
                    {nomes.length ? ` (${nomes.join(', ')})` : ''}
                  </option>
                )
              })}
            </select>
          </label>
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <Botao type="button" variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" disabled={enviando}>
            {enviando ? 'Lançando...' : 'Lançar gasto'}
          </Botao>
        </footer>
      </form>
    </Gaveta>
  )
}
