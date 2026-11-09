/** Empresa (tabela `empresa`). */
export interface Empresa {
  id: number
  razao_social: string
  nome_fantasia: string | null
  cnpj: string
  telefone: string | null
}
