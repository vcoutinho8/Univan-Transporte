import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import type { Area } from '../area/types.ts'
import type { Estudante } from '../estudante/types.ts'
import type { Instituicao } from '../instituicao/types.ts'
import type { Motorista } from '../motorista/types.ts'
import type { Rota } from '../rota/types.ts'

/**
 * A tela "Mapa e rotas" monta UM mapa e troca só a aba (Visão geral, Rotas, Bairros).
 * Cada aba é renderizada dentro do mapa (para desenhar camadas com o react-leaflet) e manda o
 * painel da esquerda para fora dele com <PainelLateral>, um portal para a coluna lateral.
 * Os dados são carregados uma vez pela página e compartilhados por este contexto.
 */
export interface DadosMapa {
  /** Todas as áreas, ativas e inativas (a aba Bairros reativa as inativas). */
  areas: Area[]
  ativas: Area[]
  /** Passageiros ativos. */
  estudantes: Estudante[]
  /** Passageiros ativos que têm latitude/longitude no endereço. */
  comLocal: Estudante[]
  instituicoes: Instituicao[]
  motoristas: Motorista[]
  /** Todas as rotas, ativas e inativas. */
  rotas: Rota[]
  carregando: boolean
  /** Recarrega áreas, passageiros e rotas (depois de salvar algo que mexe na distribuição). */
  recarregar: () => Promise<void>
  /** Recarrega as instituições (depois de mover um ponto de parada). */
  recarregarInstituicoes: () => Promise<void>
}

interface ValorContexto {
  dados: DadosMapa
  painel: HTMLElement | null
}

export const ContextoMapa = createContext<ValorContexto | null>(null)

export function useDadosMapa(): DadosMapa {
  const valor = useContext(ContextoMapa)
  if (!valor) throw new Error('useDadosMapa fora da tela Mapa e rotas')
  return valor.dados
}

/** Leva o conteúdo para a coluna lateral da tela (fora do mapa). */
export function PainelLateral({ children }: { children: ReactNode }) {
  const valor = useContext(ContextoMapa)
  return valor?.painel ? createPortal(children, valor.painel) : null
}
