import { requisitar } from '../../shared/services/api.ts'
import type { Instituicao } from './types.ts'

export interface DadosParadaExtra {
  nome: string
  latitude: number
  longitude: number
}

export const servicoInstituicao = {
  listar: () => requisitar<Instituicao[]>('/instituicoes'),

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
