import { useEffect, useState } from 'react'

import type { Coordenada } from '../area/types.ts'

/**
 * Trajeto pelas ruas com o OSRM (roteador do OpenStreetMap), chamado direto do navegador.
 * O servidor público (router.project-osrm.org) é de demonstração: serve para o MVP, mas em
 * produção troque URL_OSRM por um servidor próprio ou contratado. Se falhar, a tela cai para
 * a linha reta entre os pontos.
 */
const URL_OSRM = 'https://router.project-osrm.org/route/v1/driving/'

export interface Trajeto {
  /** Desenho do caminho pelas ruas, [lat, lng]. */
  linha: Coordenada[]
  distanciaKm: number
  duracaoMin: number
  /** Minutos de cada trecho: do ponto i ao ponto i + 1. */
  trechosMin: number[]
}

const cache = new Map<string, Trajeto | null>()

async function tracar(pontos: Coordenada[], sinal: AbortSignal): Promise<Trajeto | null> {
  const chave = pontos.map(([lat, lng]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';')
  if (cache.has(chave)) return cache.get(chave)!
  try {
    const resposta = await fetch(`${URL_OSRM}${chave}?overview=full&geometries=geojson`, { signal: sinal })
    const corpo = await resposta.json()
    const rota = corpo?.routes?.[0]
    const trajeto: Trajeto | null = rota
      ? {
          linha: (rota.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng]),
          distanciaKm: rota.distance / 1000,
          duracaoMin: rota.duration / 60,
          trechosMin: (rota.legs as { duration: number }[]).map((t) => t.duration / 60),
        }
      : null
    cache.set(chave, trajeto)
    return trajeto
  } catch {
    return null // sem rede, servidor fora ou requisição cancelada: a tela usa a linha reta
  }
}

/**
 * Trajeto pelas ruas passando pelos pontos, na ordem. `carregando` enquanto busca.
 * `manterAnterior`: enquanto busca, continua mostrando o trajeto antigo (a linha não pisca).
 */
export function useTrajeto(pontos: Coordenada[], manterAnterior = false) {
  const chave = pontos.map((p) => p.join(',')).join(';')
  const [estado, setEstado] = useState<{ chave: string; trajeto: Trajeto | null }>({ chave: '', trajeto: null })

  useEffect(() => {
    if (pontos.length < 2) return
    const controle = new AbortController()
    void tracar(pontos, controle.signal).then((trajeto) => {
      if (!controle.signal.aborted) setEstado({ chave, trajeto })
    })
    return () => controle.abort()
    // A chave já representa os pontos (o array muda de referência a cada render).
  }, [chave])

  const pronto = estado.chave === chave
  return { trajeto: pronto || manterAnterior ? estado.trajeto : null, carregando: pontos.length >= 2 && !pronto }
}
