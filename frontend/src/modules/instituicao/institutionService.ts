import { requisitar } from '../../shared/services/api.ts'
import type { DadosEndereco } from '../endereco/types.ts'
import type { Instituicao } from './types.ts'

export interface DadosParadaExtra {
  nome: string
  latitude: number
  longitude: number
}

/** Faculdade do cadastro oficial (Censo da Educação Superior/INEP). */
export interface FaculdadeDoCatalogo {
  codigo: number
  nome: string
  sigla: string
  uf: string
  municipio: string
  cep: string
  logradouro: string
  numero: string
  bairro: string
}

export const servicoInstituicao = {
  /** Busca no cadastro oficial do MEC, só do estado informado. */
  catalogo: (uf: string, busca = '') =>
    requisitar<FaculdadeDoCatalogo[]>(`/instituicoes/catalogo?${new URLSearchParams({ uf, busca }).toString()}`),

  listar: () => requisitar<Instituicao[]>('/instituicoes'),

  /** Só o admin (tela de Configurações). */
  criar: (dados: { nome: string; endereco: DadosEndereco }) => requisitar<Instituicao>('/instituicoes', { metodo: 'POST', corpo: dados }),
  alterar: (id: number, dados: { nome?: string; endereco?: DadosEndereco }) =>
    requisitar<Instituicao>(`/instituicoes/${id}`, { metodo: 'PUT', corpo: dados }),
  /** Só sem passageiro, rota ou dia sem aula usando (a API recusa e diz quem usa). */
  excluir: (id: number) => requisitar<Instituicao>(`/instituicoes/${id}`, { metodo: 'DELETE' }),

  /** Move o ponto de parada na rua; `null` volta a usar a localização do endereço. */
  ajustarParada: (id: number, ponto: [number, number] | null) =>
    requisitar<Instituicao>(`/instituicoes/${id}/parada`, {
      metodo: 'PATCH',
      corpo: ponto ? { latitude: ponto[0], longitude: ponto[1] } : { latitude: null, longitude: null },
    }),

  /** Parada extra (ex.: Biopráticas), a até 1 km da faculdade. */
  adicionarParada: (id: number, dados: DadosParadaExtra) =>
    requisitar<Instituicao>(`/instituicoes/${id}/paradas`, { metodo: 'POST', corpo: dados }),

  alterarParada: (id: number, idParada: number, dados: DadosParadaExtra) =>
    requisitar<Instituicao>(`/instituicoes/${id}/paradas/${idParada}`, { metodo: 'PUT', corpo: dados }),

  /** Quem usava a parada volta para a principal. */
  removerParada: (id: number, idParada: number) =>
    requisitar<Instituicao>(`/instituicoes/${id}/paradas/${idParada}`, { metodo: 'DELETE' }),
}
