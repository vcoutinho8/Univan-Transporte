import type { Endereco } from '../endereco/types.ts'

/** Instituição (tabela `instituicao`), como devolvida pela API (InstituicaoResposta). */
export interface Instituicao {
  id: number
  nome: string
  endereco: Endereco
  /** Ponto de parada ajustado no mapa (vazio = usa a localização do endereço). */
  parada_latitude: number | null
  parada_longitude: number | null
  /** Onde a van para: o ponto ajustado ou, sem ajuste, a localização do endereço. */
  ponto_parada: [number, number] | null
  /** Paradas extras (ex.: UVV: Biopráticas, fundos). A principal é `ponto_parada`. */
  paradas: ParadaExtra[]
}

export interface ParadaExtra {
  id: number
  nome: string
  latitude: number
  longitude: number
}
