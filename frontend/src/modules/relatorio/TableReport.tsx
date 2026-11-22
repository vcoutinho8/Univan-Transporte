import { useEffect, useState, type ComponentType } from 'react'

import Botao from '../../shared/components/Button.tsx'
import Cartao from '../../shared/components/Card.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { useAviso } from '../../shared/components/NoticeModal.tsx'
import { baixarArquivo, criarPdf } from '../../shared/pdf/gerarPdf.ts'
import { ErroApi, requisitar } from '../../shared/services/api.ts'
import { baixarCsv } from '../../shared/utils/csv.ts'
import { dataIso, formatarData, formatarMoeda } from '../../shared/utils/formatar.ts'
import { PERIODOS_RAPIDOS, periodoPadrao, validarPeriodo, type Periodo } from '../../shared/utils/periodo.ts'

interface Coluna {
  chave: string
  rotulo: string
  tipo: 'texto' | 'numero' | 'moeda' | 'data' | 'percentual'
}

interface Tabela {
  colunas: Coluna[]
  linhas: Record<string, string | number | null>[]
  resumo: string
}

type Filtro = 'periodo' | 'dias' | 'nenhum'

interface Resultado {
  url: string
  arquivo: Blob
  tabela: Tabela
  chave: string
}

function valorDaCelula(valor: string | number | null, tipo: Coluna['tipo']): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (tipo === 'data') return formatarData(String(valor))
  if (tipo === 'moeda') return formatarMoeda(Number(valor))
  if (tipo === 'percentual') return `${Math.round(Number(valor) * 100)}%`
  return String(valor)
}

const celulas = (tabela: Tabela) => tabela.linhas.map((l) => tabela.colunas.map((c) => valorDaCelula(l[c.chave], c.tipo)))

/**
 * Relatório em tabela (a API devolve colunas + linhas), no mesmo fluxo dos outros relatórios:
 * filtros, "Gerar relatório" e o PDF na tela, com download do PDF e da planilha.
 */
function RelatorioTabela({ endpoint, filtro, nome, titulo, explicacao }: { endpoint: string; filtro: Filtro; nome: string; titulo: string; explicacao: string }) {
  const hoje = new Date()
  const [periodo, setPeriodo] = useState<Periodo>(periodoPadrao())
  const [dias, setDias] = useState(60)
  const [gerando, setGerando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const avisos = useAviso()

  useEffect(() => {
    if (!resultado) return
    return () => URL.revokeObjectURL(resultado.url)
  }, [resultado])

  const erroPeriodo = filtro === 'periodo' ? validarPeriodo(periodo) : null
  const chave = JSON.stringify({ periodo, dias })
  const descricaoPeriodo =
    filtro === 'periodo' ? `${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}` : filtro === 'dias' ? `Vencendo em até ${dias} dias` : `Situação em ${formatarData(dataIso(hoje))}`

  async function gerar() {
    if (erroPeriodo) return
    setGerando(true)
    try {
      const parametros = filtro === 'periodo' ? { ...periodo } : filtro === 'dias' ? { dias } : {}
      const tabela = await requisitar<Tabela>(endpoint, { parametros })
      if (tabela.linhas.length === 0) {
        avisos.mostrar({ tipo: 'info', titulo: 'Nada para mostrar', descricao: `${tabela.resumo} Troque os filtros e gere de novo.` })
        return
      }
      const agora = new Date()
      const largura = 100 / tabela.colunas.length
      const arquivo = await criarPdf({
        titulo,
        periodo: descricaoPeriodo,
        filtros: [],
        indicadores: [{ rotulo: 'Registros', valor: String(tabela.linhas.length) }],
        colunas: tabela.colunas.map((c) => ({ titulo: c.rotulo, largura, alinhar: c.tipo === 'texto' || c.tipo === 'data' ? 'left' : 'right' })),
        linhas: celulas(tabela),
        geradoEm: `${formatarData(dataIso(agora))} às ${agora.toTimeString().slice(0, 5)}`,
      })
      setResultado({ url: URL.createObjectURL(arquivo), arquivo, tabela, chave })
    } catch (e) {
      avisos.erro(e instanceof ErroApi ? e.mensagemCompleta : 'Tente de novo em instantes.', 'Não foi possível gerar o relatório')
    } finally {
      setGerando(false)
    }
  }

  const botaoGerar = (
    <Botao onClick={() => void gerar()} disabled={gerando || Boolean(erroPeriodo)}>
      <Icone nome="documento" className="h-4 w-4" />
      {gerando ? 'Gerando...' : resultado ? 'Gerar de novo' : 'Gerar relatório'}
    </Botao>
  )

  return (
    <div className="space-y-4">
      <Cartao titulo="Filtros do relatório">
        {filtro === 'periodo' && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl bg-fundo/70 p-4">
            <label className="text-sm font-semibold text-marinho">
              De
              <input type="date" value={periodo.inicio} max={periodo.fim} onChange={(e) => setPeriodo((p) => ({ ...p, inicio: e.target.value }))} className="campo bg-white font-normal" />
            </label>
            <label className="text-sm font-semibold text-marinho">
              Até
              <input type="date" value={periodo.fim} min={periodo.inicio} onChange={(e) => setPeriodo((p) => ({ ...p, fim: e.target.value }))} className="campo bg-white font-normal" />
            </label>
            <div className="flex flex-wrap gap-1.5 pb-1">
              {PERIODOS_RAPIDOS.map((o) => {
                const p = o.calcular(hoje)
                const ativo = p.inicio === periodo.inicio && p.fim === periodo.fim
                return (
                  <button
                    key={o.rotulo}
                    type="button"
                    onClick={() => setPeriodo(p)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${ativo ? 'bg-marinho text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-marinho'}`}
                  >
                    {o.rotulo}
                  </button>
                )
              })}
            </div>
            {erroPeriodo && <p className="w-full text-xs font-semibold text-red-600">{erroPeriodo}</p>}
          </div>
        )}
        {filtro === 'dias' && (
          <label className="block max-w-xs text-sm font-semibold text-marinho">
            Vencendo em até
            <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="campo font-normal">
              {[30, 60, 90, 180, 365].map((d) => (
                <option key={d} value={d}>
                  {d} dias
                </option>
              ))}
            </select>
          </label>
        )}
        {filtro === 'nenhum' && <p className="text-sm text-slate-500">Mostra a situação de hoje. Não há filtros para escolher.</p>}
        <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">{botaoGerar}</div>
      </Cartao>

      {resultado ? (
        <Cartao
          semEspaco
          titulo={resultado.tabela.resumo}
          acoes={
            <div className="flex gap-2">
              <Botao variante="secundario" onClick={() => baixarCsv(`${nome}.csv`, resultado.tabela.colunas.map((c) => c.rotulo), celulas(resultado.tabela))}>
                Exportar CSV
              </Botao>
              <Botao onClick={() => baixarArquivo(resultado.arquivo, `${nome}.pdf`)}>
                <Icone nome="baixar" className="h-4 w-4" />
                Baixar PDF
              </Botao>
            </div>
          }
        >
          <div className="relative">
            <iframe title="Relatório em PDF" src={resultado.url} className="h-[75vh] w-full rounded-b-2xl border-t border-slate-100" />
            {resultado.chave !== chave && (
              <div className="absolute inset-0 grid place-items-center rounded-b-2xl bg-white/80 backdrop-blur-[1px]">
                <div className="text-center">
                  <p className="font-bold text-marinho">Os filtros mudaram</p>
                  <p className="mt-1 mb-3 text-sm text-slate-500">Gere de novo para ver o relatório atualizado.</p>
                  {botaoGerar}
                </div>
              </div>
            )}
          </div>
        </Cartao>
      ) : (
        <div className="grid min-h-[13rem] place-items-center rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 p-6 text-center">
          <div className="max-w-md">
            <span className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-laranja/10 text-laranja ${gerando ? 'animate-pulse' : ''}`}>
              <Icone nome="documento" className="h-8 w-8" />
            </span>
            <h2 className="mt-4 text-lg font-extrabold text-marinho">{gerando ? 'Montando seu relatório...' : 'Seu relatório aparece aqui'}</h2>
            <p className="mt-2 text-sm text-slate-500">{explicacao}</p>
          </div>
        </div>
      )}
      {avisos.modal}
    </div>
  )
}

const relatorio = (endpoint: string, filtro: Filtro, nome: string, titulo: string, explicacao: string): ComponentType => {
  const Componente = () => <RelatorioTabela endpoint={endpoint} filtro={filtro} nome={nome} titulo={titulo} explicacao={explicacao} />
  return Componente
}

export const RelatorioViagensPeriodo = relatorio(
  '/relatorios/viagens-periodo',
  'periodo',
  'viagens-por-periodo',
  'Viagens por período',
  'Escolha o período: o relatório lista cada viagem com rota, motorista, situação e presença.',
)
export const RelatorioFrequenciaPassageiro = relatorio(
  '/relatorios/frequencia-passageiro',
  'periodo',
  'frequencia-por-passageiro',
  'Frequência por passageiro',
  'Escolha o período: o relatório mostra quantas vezes cada passageiro embarcou, faltou ou avisou que não ia.',
)
export const RelatorioCnhVencendo = relatorio(
  '/relatorios/cnh-vencendo',
  'dias',
  'cnh-vencendo',
  'CNH vencendo',
  'Escolha o prazo: o relatório lista os motoristas com a CNH vencida ou vencendo nesses dias.',
)
export const RelatorioInadimplentes = relatorio(
  '/relatorios/inadimplentes',
  'nenhum',
  'inadimplentes',
  'Inadimplentes',
  'O relatório lista as mensalidades vencidas e em aberto de cada passageiro, com o total devido.',
)
