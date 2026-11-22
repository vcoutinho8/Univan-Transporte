import type { StatusCadastro } from '../../shared/types/api.ts'

export type CategoriaVeiculo = 'doblo' | 'van' | 'micro_onibus' | 'onibus'

export interface ConfiguracaoCategoria {
  valor: CategoriaVeiculo
  rotulo: string
  min: number
  max: number
}

export const CATEGORIAS_VEICULO: Record<CategoriaVeiculo, ConfiguracaoCategoria> = {
  doblo: { valor: 'doblo', rotulo: 'Doblò', min: 5, max: 7 },
  van: { valor: 'van', rotulo: 'Van', min: 8, max: 19 },
  micro_onibus: { valor: 'micro_onibus', rotulo: 'Micro-ônibus', min: 20, max: 32 },
  onibus: { valor: 'onibus', rotulo: 'Ônibus', min: 33, max: 70 },
}

export const LISTA_CATEGORIAS_VEICULO: ConfiguracaoCategoria[] = Object.values(CATEGORIAS_VEICULO)

/** Identifica a categoria correspondente à quantidade de lugares do veículo. */
export function obterCategoriaPorCapacidade(capacidade: number): CategoriaVeiculo {
  for (const config of LISTA_CATEGORIAS_VEICULO) {
    if (capacidade >= config.min && capacidade <= config.max) {
      return config.valor
    }
  }
  return capacidade < 5 ? 'doblo' : 'onibus'
}

/** Veículo (tabela `veiculo`), como devolvido pela API (VeiculoResposta). */
export interface Veiculo {
  id: number
  fk_empresa: number
  placa: string
  modelo: string
  cor: string | null
  capacidade: number
  categoria?: CategoriaVeiculo
  status: StatusCadastro
  empresa: { id: number; razao_social: string; nome_fantasia: string | null }
}

/**
 * Dados enviados ao cadastrar (VeiculoCriacao) ou alterar (VeiculoAtualizacao).
 * Sem empresa: a API usa a empresa de quem está usando o sistema.
 */
export interface DadosVeiculo {
  placa: string
  categoria: CategoriaVeiculo
  modelo: string
  cor: string | null
  capacidade: number
  status?: StatusCadastro
}

export interface OpcaoCor {
  nome: string
  hex: string
  borda?: boolean
}

export const CORES_VEICULO: OpcaoCor[] = [
  { nome: 'Branca', hex: '#FFFFFF', borda: true },
  { nome: 'Prata', hex: '#CBD5E1' },
  { nome: 'Cinza', hex: '#64748B' },
  { nome: 'Preta', hex: '#1E293B' },
  { nome: 'Azul', hex: '#2563EB' },
  { nome: 'Vermelha', hex: '#DC2626' },
  { nome: 'Amarela', hex: '#EAB308' },
  { nome: 'Verde', hex: '#16A34A' },
]

/** Retorna o hex correspondente ao nome da cor (case-insensitive) para exibição visual. */
export function obterHexCor(nomeCor: string | null): OpcaoCor | null {
  if (!nomeCor) return null
  const normalizado = nomeCor.trim().toLowerCase()
  return CORES_VEICULO.find((c) => c.nome.toLowerCase() === normalizado) ?? null
}