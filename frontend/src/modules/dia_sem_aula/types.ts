type Referencia = { id: number; nome: string }

/** Um dia sem aula (DiaSemAulaResposta). Sem instituição = vale para todas. */
export interface DiaSemAula {
  id: number
  data: string
  motivo: string
  fk_instituicao: number | null
  instituicao: Referencia | null
}

/** Dias seguidos com o mesmo motivo e instituição (PeriodoSemAula). */
export interface PeriodoSemAula {
  inicio: string
  fim: string
  dias: number
  dias_uteis: number
  motivo: string
  instituicao: Referencia | null
  ids: number[]
}

export interface DadosPeriodoSemAula {
  data_inicio: string
  data_fim: string
  /** Vazia = todas as instituições; ou uma ou mais. */
  fk_instituicoes: number[]
  motivo: string
}

export interface ResultadoCadastro {
  criados: number
  ja_existiam: number
  /** Viagens já geradas nesses dias (continuam valendo até serem canceladas). */
  viagens_geradas: number
}
