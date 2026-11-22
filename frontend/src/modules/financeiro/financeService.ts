import { requisitar } from '../../shared/services/api.ts'

export type StatusTitulo = 'aberto' | 'pago' | 'cancelado'
export type CategoriaGasto = 'salario' | 'combustivel' | 'manutencao' | 'seguro' | 'impostos' | 'outros'

export const ROTULOS_CATEGORIA: Record<CategoriaGasto, string> = {
  salario: 'Salário',
  combustivel: 'Combustível',
  manutencao: 'Manutenção',
  seguro: 'Seguro',
  impostos: 'Impostos e taxas',
  outros: 'Outros',
}

interface Pessoa {
  id: number
  nome: string
  apelido?: string | null
  celular?: string | null
}

interface Titulo {
  id: number
  competencia: string | null
  /** Vem como texto da API (Decimal). */
  valor: string
  data_vencimento: string
  status: StatusTitulo
  /** Em aberto e com o vencimento já passado. */
  vencido: boolean
}

export interface Mensalidade extends Titulo {
  estudante: Pessoa
  data_recebimento: string | null
  valor_recebido: string | null
}

export interface Gasto extends Titulo {
  categoria: CategoriaGasto
  descricao: string
  favorecido: string | null
  motorista: Pessoa | null
  veiculo_placa: string | null
  data_pagamento: string | null
  valor_pago: string | null
}

export interface ResumoMes {
  a_receber: string
  recebido: string
  em_aberto: string
  vencido: string
  a_pagar: string
  pago: string
  saldo: string
}

export interface NovoGasto {
  categoria: CategoriaGasto
  /** Obrigatória em "outros"; sem ela, vale o nome do tipo. */
  descricao: string | null
  valor: number
  data_vencimento: string
  fk_motorista?: number | null
  fk_veiculo?: number | null
}

export const servicoFinanceiro = {
  mensalidades: (competencia: string) => requisitar<Mensalidade[]>('/financeiro/receber', { parametros: { competencia } }),
  gastos: (competencia: string) => requisitar<Gasto[]>('/financeiro/pagar', { parametros: { competencia } }),
  resumo: (competencia: string) => requisitar<ResumoMes>('/financeiro/resumo', { parametros: { competencia } }),
  receber: (id: number) => requisitar<Mensalidade>(`/financeiro/receber/${id}/baixa`, { metodo: 'POST', corpo: {} }),
  lancarGasto: (dados: NovoGasto) => requisitar<Gasto>('/financeiro/pagar', { metodo: 'POST', corpo: dados }),
  pagarGasto: (id: number) => requisitar<Gasto>(`/financeiro/pagar/${id}/baixa`, { metodo: 'POST', corpo: {} }),
  cancelarGasto: (id: number) => requisitar<Gasto>(`/financeiro/pagar/${id}/cancelar`, { metodo: 'POST' }),
}
