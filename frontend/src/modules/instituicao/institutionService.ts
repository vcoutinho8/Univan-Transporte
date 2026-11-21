import { requisitar } from '../../shared/services/api.ts'
import type { Instituicao } from './types.ts'

export const servicoInstituicao = {
  listar: () => requisitar<Instituicao[]>('/instituicoes'),

  /** Move o ponto de parada na rua; `null` volta a usar a localização do endereço. */
  ajustarParada: (id: number, ponto: [number, number] | null) =>
    requisitar<Instituicao>(`/instituicoes/${id}/parada`, {
      metodo: 'PATCH',
      corpo: ponto ? { latitude: ponto[0], longitude: ponto[1] } : { latitude: null, longitude: null },
    }),
}
