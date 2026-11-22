import type { StatusCadastro } from '../../shared/types/api.ts'
import type { DadosEndereco, Endereco } from '../endereco/types.ts'

export type Turno = 'manha' | 'tarde' | 'noite'

export const ROTULOS_TURNO: Record<Turno, string> = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' }

/** Passageiro (tabela `estudante`), como devolvido pela API (EstudanteResposta). */
export interface Estudante {
  id: number
  nome: string
  apelido: string | null
  cpf: string
  celular: string
  email: string | null
  fk_instituicao: number
  curso: string | null
  turno: Turno
  horario_embarque: string | null
  valor_mensal: number
  dia_vencimento: number
  status: StatusCadastro
  fk_area: number | null
  instituicao: { id: number; nome: string }
  endereco: Endereco
  area: { id: number; nome: string } | null
  /** Parada extra da faculdade (vazio = a principal). */
  fk_parada?: number | null
  parada?: { id: number; nome: string } | null
}

/** Dados enviados ao cadastrar (EstudanteCriacao) ou alterar (EstudanteAtualizacao). */
export interface DadosEstudante {
  nome: string
  apelido: string | null
  cpf: string
  celular: string
  email: string | null
  fk_instituicao: number
  curso: string | null
  turno: Turno
  horario_embarque: string | null
  valor_mensal: number
  dia_vencimento: number
  endereco: DadosEndereco
  /** Parada extra da faculdade (null = a principal). */
  fk_parada?: number | null
  status?: StatusCadastro
}
