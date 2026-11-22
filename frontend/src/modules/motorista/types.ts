import type { StatusCadastro } from '../../shared/types/api.ts'
import type { DadosEndereco, Endereco } from '../endereco/types.ts'

/** Veículo padrão do motorista, resumido (VeiculoDoMotorista). */
export interface VeiculoDoMotorista {
  id: number
  placa: string
  modelo: string
  cor: string | null
  capacidade: number
  status: StatusCadastro
}

/** Motorista (tabela `motorista`), como devolvido pela API (MotoristaResposta). */
export interface Motorista {
  id: number
  fk_empresa: number
  fk_veiculo: number | null
  nome: string
  apelido: string | null
  cpf: string
  celular: string | null
  cnh: string
  /** Validade da CNH, no formato AAAA-MM-DD. */
  cnh_validade: string
  status: StatusCadastro
  veiculo: VeiculoDoMotorista | null
  /** Casa/garagem: de onde a ida sai e onde a volta termina. */
  endereco?: Endereco | null
}

/**
 * Dados enviados ao cadastrar (MotoristaCriacao) ou alterar (MotoristaAtualizacao).
 * Sem empresa: a API usa a empresa de quem está usando o sistema.
 */
export interface DadosMotorista {
  nome: string
  apelido: string | null
  cpf: string
  celular: string
  cnh: string
  cnh_validade: string
  fk_veiculo: number | null
  /** null tira o endereço; ausente não mexe. */
  endereco?: DadosEndereco | null
  status?: StatusCadastro
}
