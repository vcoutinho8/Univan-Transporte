import { useEffect, useRef, useState } from 'react'

import type { Coordenada } from '../area/types.ts'
import { buscarRotaNavegacao, metrosEntre, rumoEntre } from '../mapa/navigationService.ts'

/** Onde a van está depois de andar `metros` pela linha (e para onde aponta). No fim, fica no último ponto. */
export function pontoNaLinha(linha: Coordenada[], metros: number): { posicao: Coordenada; rumo: number | null; fim: boolean } {
  let resta = metros
  for (let i = 0; i < linha.length - 1; i++) {
    const trecho = metrosEntre(linha[i], linha[i + 1])
    if (trecho > 0 && resta <= trecho) {
      const f = resta / trecho
      const [a, b] = [linha[i], linha[i + 1]]
      return { posicao: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], rumo: rumoEntre(a, b), fim: false }
    }
    resta -= trecho
  }
  const ultimo = linha[linha.length - 1]
  const penultimo = linha[linha.length - 2]
  return { posicao: ultimo, rumo: penultimo ? rumoEntre(penultimo, ultimo) : null, fim: true }
}

/**
 * Simulador de GPS para testes: a van sai de `inicio` e anda pelas ruas (rota do OSRM) até o
 * `destino`, na velocidade escolhida. Ao chegar, para; trocando o destino (parada registrada),
 * traça o novo caminho a partir de onde está. `velocidadeKmh` 0 = pausado.
 */
export function useSimulador(ligado: boolean, inicio: Coordenada | null, destino: Coordenada | null, velocidadeKmh: number) {
  const [estado, setEstado] = useState<{ posicao: Coordenada | null; rumo: number | null }>({ posicao: null, rumo: null })
  const linha = useRef<Coordenada[] | null>(null)
  const andado = useRef(0)
  const atual = useRef<Coordenada | null>(null)
  atual.current = estado.posicao

  // Ligou: começa no ponto de partida. Desligou: some (volta o GPS de verdade).
  useEffect(() => {
    setEstado({ posicao: ligado ? inicio : null, rumo: null })
    // Só o liga/desliga reinicia; `inicio` muda de referência a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligado])

  const chaveDestino = destino?.join(',') ?? ''
  useEffect(() => {
    linha.current = null
    andado.current = 0
    const origem = atual.current ?? inicio
    if (!ligado || !origem || !destino) return
    const controle = new AbortController()
    void buscarRotaNavegacao(origem, destino, controle.signal).then((rota) => {
      // Sem servidor de rotas: anda em linha reta.
      if (!controle.signal.aborted) linha.current = rota?.linha.length ? [origem, ...rota.linha] : [origem, destino]
    })
    return () => controle.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligado, chaveDestino])

  useEffect(() => {
    if (!ligado || velocidadeKmh <= 0) return
    const id = window.setInterval(() => {
      if (!linha.current) return
      andado.current += velocidadeKmh / 3.6 / 2
      const p = pontoNaLinha(linha.current, andado.current)
      setEstado({ posicao: p.posicao, rumo: p.rumo })
    }, 500)
    return () => window.clearInterval(id)
  }, [ligado, velocidadeKmh])

  /** Pula direto para o destino (testar a chegada sem esperar). */
  function chegar() {
    if (!destino) return
    andado.current = Number.POSITIVE_INFINITY
    setEstado((e) => ({ posicao: destino, rumo: e.rumo }))
  }

  return { ...estado, chegar }
}
