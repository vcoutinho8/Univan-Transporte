import type { ColunaPdf, DadosPdf, LinhaPdf } from '../../shared/pdf/types.ts'
import { formatarCelular, formatarData, formatarMoeda } from '../../shared/utils/formatar.ts'
import { ROTULOS_TURNO } from '../estudante/types.ts'
import type { EstudanteDoRelatorio } from './types.ts'

/** Colunas do PDF de passageiros ativos (fixas, cabem numa folha A4 em pé). */
export const COLUNAS_PDF: (ColunaPdf & { valor: (e: EstudanteDoRelatorio) => string | number })[] = [
  { titulo: 'Nome', largura: 21, valor: (e) => e.nome },
  { titulo: 'Celular', largura: 14, valor: (e) => formatarCelular(e.celular) },
  { titulo: 'Instituição', largura: 23, valor: (e) => e.instituicao.nome },
  { titulo: 'Turno', largura: 7, valor: (e) => ROTULOS_TURNO[e.turno] },
  { titulo: 'Bairro', largura: 14, valor: (e) => e.area?.nome ?? 'Sem bairro' },
  { titulo: 'Pres.', largura: 7, alinhar: 'center', valor: (e) => e.presencas },
  { titulo: 'Faltas', largura: 7, alinhar: 'center', valor: (e) => e.faltas },
  { titulo: 'Avisos', largura: 7, alinhar: 'center', valor: (e) => e.avisos },
]

export const AGRUPAMENTOS = {
  nenhum: { rotulo: 'Sem agrupar', chave: null },
  instituicao: { rotulo: 'Instituição', chave: (e: EstudanteDoRelatorio) => e.instituicao.nome },
  turno: { rotulo: 'Turno', chave: (e: EstudanteDoRelatorio) => ROTULOS_TURNO[e.turno] },
  bairro: { rotulo: 'Bairro', chave: (e: EstudanteDoRelatorio) => e.area?.nome ?? 'Sem bairro' },
} as const

export type Agrupamento = keyof typeof AGRUPAMENTOS

/** Monta o PDF de passageiros ativos com o agrupamento, os filtros e o período escolhidos. */
export function montarPdfEstudantes(
  estudantes: EstudanteDoRelatorio[],
  agrupar: Agrupamento,
  filtros: DadosPdf['filtros'],
  geradoEm: string,
  periodo: { inicio: string; fim: string },
): DadosPdf {
  const linha = (e: EstudanteDoRelatorio): LinhaPdf => COLUNAS_PDF.map((c) => c.valor(e))

  const chave = AGRUPAMENTOS[agrupar].chave
  let linhas: LinhaPdf[]
  if (!chave) {
    linhas = estudantes.map(linha)
  } else {
    const grupos = new Map<string, EstudanteDoRelatorio[]>()
    for (const e of estudantes) grupos.set(chave(e), [...(grupos.get(chave(e)) ?? []), e])
    const ordem =
      agrupar === 'turno' ? Object.values(ROTULOS_TURNO) : [...grupos.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    linhas = ordem
      .filter((g) => grupos.has(g))
      .flatMap((g) => [{ grupo: `${g} · ${grupos.get(g)!.length} passageiro(s)` }, ...grupos.get(g)!.map(linha)])
  }

  const soma = (campo: (e: EstudanteDoRelatorio) => number) => estudantes.reduce((s, e) => s + campo(e), 0)
  return {
    titulo: 'Passageiros ativos',
    periodo: `${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}`,
    filtros: [...filtros, ...(chave ? [{ rotulo: 'Agrupado por', valor: AGRUPAMENTOS[agrupar].rotulo }] : [])],
    indicadores: [
      { rotulo: 'Passageiros', valor: String(estudantes.length) },
      { rotulo: 'Presenças', valor: String(soma((e) => e.presencas)) },
      { rotulo: 'Faltas sem aviso', valor: String(soma((e) => e.faltas)) },
      { rotulo: 'Mensalidades', valor: formatarMoeda(soma((e) => Number(e.valor_mensal))) },
    ],
    colunas: COLUNAS_PDF.map(({ titulo, largura, alinhar }) => ({ titulo, largura, alinhar })),
    linhas,
    geradoEm,
  }
}
