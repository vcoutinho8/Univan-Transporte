import { useEffect, useRef, useState } from 'react'

/**
 * Faz um número "subir" até o valor final (efeito de contador nos indicadores do painel).
 * Enquanto o valor não chegou (null/undefined), devolve null.
 */
export function useContagem(alvo: number | null | undefined, duracaoMs = 900): number | null {
  const [atual, setAtual] = useState<number | null>(null)
  const anterior = useRef(0)

  useEffect(() => {
    if (alvo === null || alvo === undefined) return
    const inicio = performance.now()
    const de = anterior.current
    let quadro = 0

    const passo = (agora: number) => {
      const progresso = Math.min((agora - inicio) / duracaoMs, 1)
      const suavizado = 1 - Math.pow(1 - progresso, 3) // desacelera no fim
      setAtual(Math.round(de + (alvo - de) * suavizado))
      if (progresso < 1) quadro = requestAnimationFrame(passo)
      else anterior.current = alvo
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [alvo, duracaoMs])

  return atual
}
