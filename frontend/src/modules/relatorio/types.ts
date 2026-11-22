import type { PeriodoSemAula } from '../dia_sem_aula/types.ts'
import type { Turno } from '../estudante/types.ts'

type Referencia = { id: number; nome: string }

/** Linha do relatório de passageiros ativos. */
export interface EstudanteDoRelatorio {
  id: number
  nome: string
  cpf: string
  celular: string
  email: string | null
  instituicao: Referencia
  curso: string | null
  turno: Turno
  area: Referencia | null
  /** Rota ativa que leva o passageiro (mesma regra da geração das viagens). */
  rota: Referencia | null
  horario_embarque: string | null
  /** A API devolve o decimal como texto ("550.00"). */
  valor_mensal: string | number
  dia_vencimento: number
  /** Frequência no período pedido. */
  presencas: number
  faltas: number
  avisos: number
}

/** Relatório de passageiros ativos (RelatorioEstudantesAtivos). */
export interface RelatorioEstudantesAtivos {
  /** AAAA-MM-DDTHH:MM:SS */
  gerado_em: string
  /** AAAA-MM-DD */
  data_inicio: string
  data_fim: string
  total: number
  valor_mensal_total: string | number
  sem_area: number
  sem_rota: number
  presencas: number
  faltas: number
  por_instituicao: { instituicao: Referencia; total: number }[]
  por_turno: { turno: Turno; total: number }[]
  estudantes: EstudanteDoRelatorio[]
}

export interface FiltrosRelatorioEstudantes {
  data_inicio: string
  data_fim: string
  fk_instituicao?: number | ''
  turno?: Turno | ''
}

/** Relatório de dias sem aula (RelatorioDiasSemAula). */
export interface RelatorioDiasSemAula {
  gerado_em: string
  data_inicio: string
  data_fim: string
  /** Datas distintas sem aula (para alguma instituição). */
  total_dias: number
  dias_uteis: number
  /** Datas sem aula para todas as instituições. */
  gerais: number
  periodos: PeriodoSemAula[]
}
