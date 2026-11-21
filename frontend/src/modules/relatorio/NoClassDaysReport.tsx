import { useEffect, useState } from 'react'

import Botao from '../../shared/components/Button.tsx'
import Cartao from '../../shared/components/Card.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { useAviso } from '../../shared/components/NoticeModal.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { baixarArquivo, criarPdf } from '../../shared/pdf/gerarPdf.ts'
import { ErroApi } from '../../shared/services/api.ts'
import { baixarCsv } from '../../shared/utils/csv.ts'
import { dataIso, formatarData } from '../../shared/utils/formatar.ts'
import { validarPeriodo, type Periodo } from '../../shared/utils/periodo.ts'
import { servicoInstituicao } from '../instituicao/institutionService.ts'
import { descreverPeriodo, montarPdfDiasSemAula } from './noClassDaysPdf.ts'
import { servicoRelatorio } from './reportService.ts'
import type { RelatorioDiasSemAula } from './types.ts'

/** Atalhos de período deste relatório: olham para a frente (planejamento do semestre). */
function atalhos(hoje = new Date()): { rotulo: string; periodo: Periodo }[] {
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()
  const primeiroDia = (a: number, m: number) => dataIso(new Date(a, m, 1))
  const ultimoDia = (a: number, m: number) => dataIso(new Date(a, m + 1, 0))
  const semestre = mes < 6 ? 0 : 6
  return [
    { rotulo: 'Este mês', periodo: { inicio: primeiroDia(ano, mes), fim: ultimoDia(ano, mes) } },
    { rotulo: 'Próximos 3 meses', periodo: { inicio: primeiroDia(ano, mes), fim: ultimoDia(ano, mes + 2) } },
    { rotulo: 'Este semestre', periodo: { inicio: primeiroDia(ano, semestre), fim: ultimoDia(ano, semestre + 5) } },
    { rotulo: 'Este ano', periodo: { inicio: primeiroDia(ano, 0), fim: ultimoDia(ano, 11) } },
  ]
}

interface Resultado {
  url: string
  arquivo: Blob
  relatorio: RelatorioDiasSemAula
  chave: string
}

/**
 * Relatório de dias sem aula: feriados, recessos e férias do período, agrupados em períodos
 * seguidos. Abre vazio com os filtros; "Gerar relatório" mostra o PDF na tela.
 */
export default function RelatorioDiasSemAulaTela() {
  const opcoes = atalhos()
  const [periodo, setPeriodo] = useState<Periodo>(opcoes[2].periodo)
  const [instituicao, setInstituicao] = useState<number | ''>('')
  const [gerando, setGerando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const instituicoes = useRequisicao(() => servicoInstituicao.listar())
  const avisos = useAviso()

  useEffect(() => {
    if (!resultado) return
    return () => URL.revokeObjectURL(resultado.url)
  }, [resultado])

  const erroPeriodo = validarPeriodo(periodo)
  const chave = JSON.stringify({ periodo, instituicao })
  const nomeInstituicao = instituicoes.dados?.find((i) => i.id === instituicao)?.nome
  const filtros = nomeInstituicao ? [{ rotulo: 'Instituição', valor: `${nomeInstituicao} (e os feriados gerais)` }] : []

  async function gerar() {
    if (erroPeriodo) return
    setGerando(true)
    try {
      const relatorio = await servicoRelatorio.diasSemAula({
        data_inicio: periodo.inicio,
        data_fim: periodo.fim,
        fk_instituicao: instituicao,
      })
      if (relatorio.periodos.length === 0) {
        avisos.mostrar({
          tipo: 'info',
          titulo: 'Nenhum dia sem aula nesse período',
          descricao: `De ${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)} todos os dias são de aula${
            nomeInstituicao ? ` em ${nomeInstituicao}` : ''
          }. Cadastre feriados e férias no Calendário.`,
        })
        return
      }
      const agora = new Date()
      const geradoEm = `${formatarData(dataIso(agora))} às ${agora.toTimeString().slice(0, 5)}`
      const arquivo = await criarPdf(montarPdfDiasSemAula(relatorio, filtros, geradoEm))
      setResultado({ url: URL.createObjectURL(arquivo), arquivo, relatorio, chave })
    } catch (e) {
      avisos.erro(e instanceof ErroApi ? e.mensagemCompleta : 'Tente de novo em instantes.', 'Não foi possível gerar o relatório')
    } finally {
      setGerando(false)
    }
  }

  const nomeArquivo = `dias-sem-aula-${periodo.inicio}-a-${periodo.fim}`

  return (
    <div className="space-y-4">
      <Cartao titulo="Filtros do relatório">
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl bg-fundo/70 p-4">
          <label className="text-sm font-semibold text-marinho">
            De
            <input type="date" value={periodo.inicio} onChange={(e) => setPeriodo((p) => ({ ...p, inicio: e.target.value }))} className="campo bg-white font-normal" />
          </label>
          <label className="text-sm font-semibold text-marinho">
            Até
            <input type="date" value={periodo.fim} min={periodo.inicio} onChange={(e) => setPeriodo((p) => ({ ...p, fim: e.target.value }))} className="campo bg-white font-normal" />
          </label>
          <div className="flex flex-wrap gap-1.5 pb-1">
            {opcoes.map((o) => {
              const ativo = o.periodo.inicio === periodo.inicio && o.periodo.fim === periodo.fim
              return (
                <button
                  key={o.rotulo}
                  type="button"
                  onClick={() => setPeriodo(o.periodo)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    ativo ? 'bg-marinho text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-marinho'
                  }`}
                >
                  {o.rotulo}
                </button>
              )
            })}
          </div>
          {erroPeriodo && <p className="w-full text-xs font-semibold text-red-600">{erroPeriodo}</p>}
        </div>

        <label className="block max-w-md text-sm font-semibold text-marinho">
          Instituição
          <select
            value={instituicao}
            onChange={(e) => setInstituicao(e.target.value ? Number(e.target.value) : '')}
            className="campo font-normal"
          >
            <option value="">Todas as instituições</option>
            {instituicoes.dados?.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
          <Botao onClick={() => void gerar()} disabled={gerando || Boolean(erroPeriodo)}>
            <Icone nome="documento" className="h-4 w-4" />
            {gerando ? 'Gerando...' : resultado ? 'Gerar de novo' : 'Gerar relatório'}
          </Botao>
        </div>
      </Cartao>

      {resultado ? (
        <Cartao
          semEspaco
          titulo={`${resultado.relatorio.total_dias} dia(s) sem aula · ${resultado.relatorio.dias_uteis} útil(eis)`}
          acoes={
            <div className="flex gap-2">
              <Botao
                variante="secundario"
                onClick={() =>
                  baixarCsv(
                    `${nomeArquivo}.csv`,
                    ['Período', 'Motivo', 'Quem fica sem aula'],
                    resultado.relatorio.periodos.map((p) => [
                      descreverPeriodo(p),
                      p.motivo,
                      p.instituicao ? p.instituicao.nome : 'Todas as instituições',
                    ]),
                  )
                }
              >
                Exportar CSV
              </Botao>
              <Botao onClick={() => baixarArquivo(resultado.arquivo, `${nomeArquivo}.pdf`)}>
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
                  <p className="mt-1 text-sm text-slate-500">Gere de novo para ver o relatório atualizado.</p>
                  <Botao className="mt-3" onClick={() => void gerar()} disabled={gerando || Boolean(erroPeriodo)}>
                    <Icone nome="documento" className="h-4 w-4" />
                    {gerando ? 'Gerando...' : 'Gerar de novo'}
                  </Botao>
                </div>
              </div>
            )}
          </div>
        </Cartao>
      ) : (
        <div className="grid min-h-[45vh] place-items-center rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 p-8 text-center">
          <div className="max-w-md">
            <span className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-laranja/10 text-laranja ${gerando ? 'animate-pulse' : ''}`}>
              <Icone nome="viagem" className="h-8 w-8" />
            </span>
            <h2 className="mt-4 text-lg font-extrabold text-marinho">{gerando ? 'Montando seu relatório...' : 'Seu relatório aparece aqui'}</h2>
            <p className="mt-2 text-sm text-slate-500">
              Escolha o período (ex.: este semestre) e, se quiser, uma instituição. O relatório lista feriados, recessos e
              férias, com quantos dias úteis ficam sem viagem.
            </p>
          </div>
        </div>
      )}
      {avisos.modal}
    </div>
  )
}
