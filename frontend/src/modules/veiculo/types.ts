import type { StatusCadastro } from '../../shared/types/api.ts'

/** Veículo (tabela `veiculo`), como devolvido pela API (VeiculoResposta). */
export interface Veiculo {
  id: number
  fk_empresa: number
  placa: string
  modelo: string
  cor: string | null
  capacidade: number
  status: StatusCadastro
  empresa: { id: number; razao_social: string; nome_fantasia: string | null }
}

/**
 * Dados enviados ao cadastrar (VeiculoCriacao) ou alterar (VeiculoAtualizacao).
 * Sem empresa: a API usa a empresa de quem está usando o sistema.
 */
export interface DadosVeiculo {
  placa: string
  modelo: string
  cor: string | null
  capacidade: number
  status?: StatusCadastro
}
