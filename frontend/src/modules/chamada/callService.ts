import { requisitar } from '../../shared/services/api.ts'
import type { Turno } from '../estudante/types.ts'
import type { AvisoPedido, ChamadasDoDia, PassageiroDoDia } from './types.ts'

export const servicoChamada = {
  doDia: (data: string, turno?: Turno) => requisitar<ChamadasDoDia>('/chamadas', { parametros: { data, turno } }),

  /** Passageiro avisou que não vai: sai da fila do motorista nesses sentidos. */
  avisar: (pedido: AvisoPedido) => requisitar<PassageiroDoDia>('/chamadas/aviso', { metodo: 'POST', corpo: pedido }),

  /** Passageiro mudou de ideia e vai. */
  desfazer: (pedido: AvisoPedido) =>
    requisitar<PassageiroDoDia>('/chamadas/aviso/desfazer', { metodo: 'POST', corpo: pedido }),
}
