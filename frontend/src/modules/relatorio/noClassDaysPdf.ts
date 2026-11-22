import type { ColunaPdf, DadosPdf } from '../../shared/pdf/types.ts'
import { formatarData } from '../../shared/utils/formatar.ts'
import type { PeriodoSemAula } from '../dia_sem_aula/types.ts'
import type { RelatorioDiasSemAula } from './types.ts'

const COLUNAS: ColunaPdf[] = [
  { titulo: 'Período', largura: 28 },
  { titulo: 'Motivo', largura: 36 },
  { titulo: 'Quem fica sem aula', largura: 36 },
]

/** "21/12/2026 a 31/01/2027" ou só "25/12/2026". */
export const descreverPeriodo = (p: Pick<PeriodoSemAula, 'inicio' | 'fim'>) =>
  p.inicio === p.fim ? formatarData(p.inicio) : `${formatarData(p.inicio)} a ${formatarData(p.fim)}`

/** PDF do relatório de dias sem aula: uma linha por período (dias seguidos com o mesmo motivo). */
export function montarPdfDiasSemAula(relatorio: RelatorioDiasSemAula, filtros: DadosPdf['filtros'], geradoEm: string): DadosPdf {
  return {
    titulo: 'Dias sem aula',
    periodo: `${formatarData(relatorio.data_inicio)} a ${formatarData(relatorio.data_fim)}`,
    filtros,
    indicadores: [
      { rotulo: 'Dias sem aula', valor: String(relatorio.total_dias) },
      { rotulo: 'Dias úteis', valor: String(relatorio.dias_uteis) },
      { rotulo: 'Para todas', valor: String(relatorio.gerais) },
      { rotulo: 'Períodos', valor: String(relatorio.periodos.length) },
    ],
    colunas: COLUNAS,
    linhas: relatorio.periodos.map((p) => [
      descreverPeriodo(p),
      p.motivo,
      p.instituicao ? p.instituicao.nome : 'Todas as instituições',
    ]),
    geradoEm,
  }
}
