import type { Turno } from '../estudante/types.ts'
import type { Sentido, StatusChamada, StatusViagem } from '../viagem/types.ts'

type Referencia = { id: number; nome: string }

/** A chamada do passageiro num sentido do dia (SituacaoNoSentido). */
export interface SituacaoNoSentido {
  fk_viagem: number
  status: StatusChamada
  viagem_status: StatusViagem
  horario_previsto: string | null
  horario_aviso: string | null
  horario_embarque: string | null
  /** Avisou "não vou" com menos de 1 hora do horário previsto. */
  tardio: boolean
}

/** Um passageiro esperado no dia, com a ida e a volta (PassageiroDoDia). */
export interface PassageiroDoDia {
  estudante: { id: number; nome: string; apelido: string | null; celular: string; bairro: string }
  instituicao: Referencia
  motorista: Referencia
  turno: Turno
  ida: SituacaoNoSentido | null
  volta: SituacaoNoSentido | null
}

export interface ChamadasDoDia {
  data: string
  resumo: { passageiros: number; confirmados: number; avisaram: number; tardios: number }
  passageiros: PassageiroDoDia[]
}

export interface AvisoPedido {
  data: string
  fk_estudante: number
  sentidos: Sentido[]
}
