import { dataIso, somarDias } from './formatar.ts'

/** Período de um relatório, em datas AAAA-MM-DD (fim incluído). */
export interface Periodo {
  inicio: string
  fim: string
}

/** Mesmo limite da API (app/modules/relatorio/relatorio_servico.py). */
export const PERIODO_MAXIMO_DIAS = 366

function inicioDoMes(hoje: Date): string {
  return dataIso(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
}

/** Atalhos de período mostrados ao lado das datas. */
export const PERIODOS_RAPIDOS: { rotulo: string; calcular: (hoje: Date) => Periodo }[] = [
  { rotulo: 'Hoje', calcular: (hoje) => ({ inicio: dataIso(hoje), fim: dataIso(hoje) }) },
  { rotulo: 'Últimos 7 dias', calcular: (hoje) => ({ inicio: somarDias(dataIso(hoje), -6), fim: dataIso(hoje) }) },
  { rotulo: 'Este mês', calcular: (hoje) => ({ inicio: inicioDoMes(hoje), fim: dataIso(hoje) }) },
  {
    rotulo: 'Mês passado',
    calcular: (hoje) => ({
      inicio: dataIso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)),
      fim: dataIso(new Date(hoje.getFullYear(), hoje.getMonth(), 0)),
    }),
  },
]

/** Período padrão dos relatórios: do dia 1º do mês até hoje. */
export const periodoPadrao = (hoje = new Date()): Periodo => ({ inicio: inicioDoMes(hoje), fim: dataIso(hoje) })

/** Mensagem do problema com o período, ou `null` se estiver tudo certo. */
export function validarPeriodo({ inicio, fim }: Periodo): string | null {
  if (!inicio || !fim) return 'Informe a data inicial e a data final do período.'
  if (fim < inicio) return 'A data final não pode ser anterior à data inicial.'
  const dias = (Date.parse(fim) - Date.parse(inicio)) / 86_400_000
  if (dias >= PERIODO_MAXIMO_DIAS) return 'Escolha um período de no máximo um ano.'
  return null
}
