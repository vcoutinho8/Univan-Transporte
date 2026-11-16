import type { StatusCadastro } from '../../shared/types/api.ts'
import type { Turno } from '../estudante/types.ts'

/** Rota (tabelas `rota` + `rota_dia`), como devolvida pela API (RotaResposta). */
export interface Rota {
  id: number
  nome: string
  fk_motorista: number
  fk_instituicao: number
  turno: Turno
  horario_ida: string | null
  horario_volta: string | null
  status: StatusCadastro
  motorista: { id: number; nome: string }
  instituicao: { id: number; nome: string }
  /** 1 = segunda ... 7 = domingo. */
  dias: number[]
  /** Passageiros que a rota leva hoje (mesma regra da geração das viagens). */
  total_passageiros: number
}

export interface DadosRota {
  nome: string
  fk_motorista: number
  fk_instituicao: number
  turno: Turno
  horario_ida: string | null
  horario_volta: string | null
  dias: number[]
}

export const DIAS_SEMANA: { numero: number; curto: string; nome: string }[] = [
  { numero: 1, curto: 'S', nome: 'Segunda' },
  { numero: 2, curto: 'T', nome: 'Terça' },
  { numero: 3, curto: 'Q', nome: 'Quarta' },
  { numero: 4, curto: 'Q', nome: 'Quinta' },
  { numero: 5, curto: 'S', nome: 'Sexta' },
  { numero: 6, curto: 'S', nome: 'Sábado' },
  { numero: 7, curto: 'D', nome: 'Domingo' },
]

/** "Seg a sex", "Seg, qua e sex"... */
export function descreverDias(dias: number[]): string {
  const ordenados = [...dias].sort()
  if (ordenados.join() === '1,2,3,4,5') return 'Seg a sex'
  if (ordenados.join() === '1,2,3,4,5,6') return 'Seg a sáb'
  if (ordenados.length === 7) return 'Todos os dias'
  const nomes = ordenados.map((d) => DIAS_SEMANA[d - 1].nome.slice(0, 3).toLowerCase())
  const texto = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0] ?? ''
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}
