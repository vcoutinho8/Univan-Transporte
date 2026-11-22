import { useState, type ComponentType } from 'react'

import Botao from '../../shared/components/Button.tsx'
import Cartao from '../../shared/components/Card.tsx'
import EstadoVazio from '../../shared/components/EmptyState.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { requisitar } from '../../shared/services/api.ts'
import { dataIso, formatarData, formatarMoeda, somarDias } from '../../shared/utils/formatar.ts'

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

function valorDaCelula(valor: string | number | null, tipo: Coluna['tipo']): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (tipo === 'data') return formatarData(String(valor))
  if (tipo === 'moeda') return formatarMoeda(Number(valor))
  if (tipo === 'percentual') return `${Math.round(Number(valor) * 100)}%`
  return String(valor)
}

/** Baixa a tabela como CSV (abre no Excel/Planilhas), com ";" e acentos certos. */
function exportarCsv(nome: string, tabela: Tabela) {
  const escapar = (t: string) => `"${t.replace(/"/g, '""')}"`
  const linhas = [
    tabela.colunas.map((c) => escapar(c.rotulo)).join(';'),
    ...tabela.linhas.map((l) => tabela.colunas.map((c) => escapar(valorDaCelula(l[c.chave], c.tipo))).join(';')),
  ]
  const arquivo = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' })
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(arquivo), download: `${nome}.csv` })
  link.click()
  URL.revokeObjectURL(link.href)
}

/**
 * Relatório em tabela (a API devolve colunas + linhas): filtro de período ou de dias, resumo,
 * exportar para planilha e imprimir. Um relatório novo é só um endpoint e uma linha no catálogo.
 */
function RelatorioTabela({ endpoint, filtro, nome }: { endpoint: string; filtro: Filtro; nome: string }) {
  const hoje = dataIso()
  const [inicio, setInicio] = useState(`${hoje.slice(0, 7)}-01`)
  const [fim, setFim] = useState(hoje)
  const [dias, setDias] = useState(60)
  const parametros = filtro === 'periodo' ? { inicio, fim } : filtro === 'dias' ? { dias } : {}
  const tabela = useRequisicao(() => requisitar<Tabela>(endpoint, { parametros }), [endpoint, inicio, fim, dias])

  return (
    <Cartao semEspaco>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4 print:hidden">
        {filtro === 'periodo' && (
          <>
            <label className="text-sm font-semibold text-marinho">
              De
              <input type="date" value={inicio} max={fim} onChange={(e) => setInicio(e.target.value)} className="campo mt-1" />
            </label>
            <label className="text-sm font-semibold text-marinho">
              Até
              <input type="date" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} className="campo mt-1" />
            </label>
            <div className="flex gap-1 pb-0.5">
              {[
                ['Este mês', `${hoje.slice(0, 7)}-01`, hoje],
                ['Últimos 30 dias', somarDias(hoje, -30), hoje],
              ].map(([rotulo, i, f]) => (
                <button
                  key={rotulo}
                  onClick={() => {
                    setInicio(i)
                    setFim(f)
                  }}
                  className="rounded-full bg-fundo px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </>
        )}
        {filtro === 'dias' && (
          <label className="text-sm font-semibold text-marinho">
            Vencendo em até
            <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="campo mt-1">
              {[30, 60, 90, 180, 365].map((d) => (
                <option key={d} value={d}>
                  {d} dias
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="ml-auto flex gap-2">
          <Botao variante="secundario" disabled={!tabela.dados?.linhas.length} onClick={() => tabela.dados && exportarCsv(nome, tabela.dados)}>
            <Icone nome="baixar" className="h-4 w-4" />
            Planilha
          </Botao>
          <Botao variante="secundario" disabled={!tabela.dados?.linhas.length} onClick={() => window.print()}>
            <Icone nome="documento" className="h-4 w-4" />
            Imprimir
          </Botao>
        </div>
      </div>

      {tabela.carregando && <div className="esqueleto m-5 h-40" />}
      {tabela.erro && <p className="m-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">{tabela.erro}</p>}
      {tabela.dados && (
        <>
          <p className="px-5 pt-4 text-sm font-semibold text-slate-600">{tabela.dados.resumo}</p>
          {tabela.dados.linhas.length === 0 ? (
            <EstadoVazio icone="relatorio" titulo="Nada para mostrar" descricao="Nenhum registro com esses filtros." compacto />
          ) : (
            <div className="overflow-x-auto p-5 pt-3">
              <table className="w-full text-left text-sm">
                <thead className="border-y border-slate-100 bg-[#f7f7f7] text-xs font-bold text-slate-500 uppercase">
                  <tr>
                    {tabela.dados.colunas.map((c) => (
                      <th key={c.chave} className={`px-3 py-2.5 ${c.tipo === 'texto' || c.tipo === 'data' ? '' : 'text-right'}`}>
                        {c.rotulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tabela.dados.linhas.map((l, i) => (
                    <tr key={i} className="hover:bg-fundo/50">
                      {tabela.dados!.colunas.map((c) => (
                        <td key={c.chave} className={`px-3 py-2 ${c.tipo === 'texto' || c.tipo === 'data' ? 'text-marinho' : 'text-right tabular-nums'}`}>
                          {valorDaCelula(l[c.chave], c.tipo)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Cartao>
  )
}

const relatorio = (endpoint: string, filtro: Filtro, nome: string): ComponentType => {
  const Componente = () => <RelatorioTabela endpoint={endpoint} filtro={filtro} nome={nome} />
  return Componente
}

export const RelatorioViagensPeriodo = relatorio('/relatorios/viagens-periodo', 'periodo', 'viagens-por-periodo')
export const RelatorioFrequenciaPassageiro = relatorio('/relatorios/frequencia-passageiro', 'periodo', 'frequencia-por-passageiro')
export const RelatorioCnhVencendo = relatorio('/relatorios/cnh-vencendo', 'dias', 'cnh-vencendo')
export const RelatorioInadimplentes = relatorio('/relatorios/inadimplentes', 'nenhum', 'inadimplentes')
export const RelatorioInadimplenciaGestores = relatorio('/univan/relatorios/inadimplencia', 'nenhum', 'inadimplencia-gestores')
