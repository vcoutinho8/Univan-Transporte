import type { Endereco } from '../endereco/types.ts'

/** Instituição (tabela `instituicao`), como devolvida pela API (InstituicaoResposta). */
export interface Instituicao {
  id: number
  nome: string
  endereco: Endereco
}
