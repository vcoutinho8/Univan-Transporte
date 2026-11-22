import type { StatusCadastro } from '../../shared/types/api.ts'

/** Par [latitude, longitude], a ordem usada pelo Leaflet. */
export type Coordenada = [number, number]

/** Área (tabela `area`): região da cidade atendida por um motorista (AreaResposta). */
export interface Area {
  id: number
  nome: string
  status: StatusCadastro
  fk_motorista: number | null
  motorista: { id: number; nome: string } | null
  poligono: Coordenada[]
}

/** Dados enviados ao cadastrar (AreaCriacao) ou alterar (AreaAtualizacao) uma área. */
export interface DadosArea {
  nome: string
  fk_motorista: number | null
  poligono: Coordenada[]
}
