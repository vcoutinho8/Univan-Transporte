/** Resposta de GET /api/painel/resumo (backend/app/modules/painel/painel_schema.py). */
export interface ViagensDoDia {
  agendada: number
  em_andamento: number
  concluida: number
  cancelada: number
}

export interface ResumoPainel {
  data: string
  veiculos_ativos: number
  motoristas_ativos: number
  estudantes_ativos: number
  rotas_ativas: number
  estudantes_sem_area: number
  viagens_hoje: ViagensDoDia
}

/** Um dia do gráfico da semana (GET /api/painel/semana). */
export interface DiaDaSemana {
  data: string
  viagens: number
  presentes: number
  ausentes: number
  nao_vai: number
  pendentes: number
}
