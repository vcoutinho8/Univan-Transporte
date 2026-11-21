import type { Turno } from '../estudante/types.ts'

export type Sentido = 'ida' | 'volta'
export type StatusViagem = 'agendada' | 'em_andamento' | 'concluida' | 'cancelada'
export type StatusChamada = 'pendente' | 'presente' | 'ausente' | 'nao_vai'

export const ROTULOS_STATUS_VIAGEM: Record<StatusViagem, string> = {
  agendada: 'Agendada',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}

export const ROTULOS_STATUS_CHAMADA: Record<StatusChamada, string> = {
  pendente: 'Pendente',
  presente: 'Presente',
  ausente: 'Ausente',
  nao_vai: 'Avisou que não vai',
}

/** Situação das chamadas de uma viagem. */
export interface ContagemPassageiros {
  total: number
  pendente: number
  presente: number
  ausente: number
  nao_vai: number
}

/** Viagem (tabela `viagem`), como devolvida pela API (ViagemResposta). */
export interface Viagem {
  id: number
  /** AAAA-MM-DD */
  data: string
  sentido: Sentido
  status: StatusViagem
  /** Horário de ida ou de volta da rota, conforme o sentido. */
  horario_previsto: string | null
  /** AAAA-MM-DDTHH:MM:SS */
  horario_saida: string | null
  horario_chegada: string | null
  rota: { id: number; nome: string; turno: Turno; instituicao: { id: number; nome: string } }
  motorista: { id: number; nome: string }
  veiculo: { id: number; placa: string; modelo: string; capacidade: number }
  /** Motorista ou veículo diferente do cadastro da rota. */
  substituicao: boolean
  passageiros: ContagemPassageiros
}

export interface Chamada {
  estudante: {
    id: number
    nome: string
    apelido: string | null
    celular: string
    endereco: { logradouro: string; numero: string | null; complemento: string | null; bairro: string }
  }
  status: StatusChamada
  horario_previsto: string | null
  horario_aviso: string | null
  horario_embarque: string | null
  /** Desceu no destino (faculdade na ida, casa na volta). */
  horario_desembarque: string | null
}

export interface ViagemDetalhe extends Viagem {
  chamadas: Chamada[]
}

/** Resultado de "Gerar viagens do dia". */
export interface ResultadoGeracao {
  data: string
  viagens_criadas: number
  chamadas_criadas: number
  avisos: string[]
}

export interface FiltrosViagem {
  data?: string
  turno?: Turno | ''
  status?: StatusViagem | ''
  fk_motorista?: number
}

/**
 * Fase da jornada em andamento: `embarque` (buscando passageiros) e `a_caminho` (todos
 * registrados, faltam os desembarques nos destinos). Fora disso, igual ao status.
 */
export type FaseJornada = 'agendada' | 'embarque' | 'a_caminho' | 'concluida' | 'cancelada'

/** Identifica a jornada do motorista: dia, motorista, turno e sentido. */
export interface ChaveJornada {
  data: string
  fk_motorista: number
  turno: Turno
  sentido: Sentido
}

/** Passageiro na fila da jornada, com a viagem (rota) e a instituição dele. */
export interface ChamadaDaJornada extends Chamada {
  fk_viagem: number
  instituicao: { id: number; nome: string }
}

/**
 * Jornada (JornadaResposta): todas as rotas de um motorista no turno e sentido, com uma fila
 * única de passageiros. Quem avisou que não vai não entra na fila (só em `passageiros.nao_vai`).
 */
export interface Jornada {
  data: string
  turno: Turno
  sentido: Sentido
  motorista: { id: number; nome: string }
  status: StatusViagem
  fase: FaseJornada
  horario_previsto: string | null
  horario_saida: string | null
  horario_chegada: string | null
  viagens: Viagem[]
  passageiros: ContagemPassageiros
  fila: ChamadaDaJornada[]
}
