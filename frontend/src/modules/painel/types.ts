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

export interface Saude {
  api: string
  banco: string
}
