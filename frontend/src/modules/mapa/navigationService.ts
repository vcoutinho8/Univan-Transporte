import { useEffect, useRef, useState } from 'react'

import type { Coordenada } from '../area/types.ts'

/**
 * Navegação curva a curva dentro do site: rota do OSRM com as manobras (steps=true), traduzidas
 * para português. A rota é refeita a partir da posição atual conforme a van anda (e se sair do
 * caminho), então a "próxima manobra" é sempre a do primeiro trecho.
 */
const URL_OSRM = 'https://router.project-osrm.org/route/v1/driving/'

export interface Manobra {
  /** turn, new name, depart, arrive, merge, on ramp, off ramp, fork, end of road, continue, roundabout, rotary, exit roundabout... */
  tipo: string
  /** left, right, slight left, slight right, sharp left, sharp right, straight, uturn */
  modificador: string | null
  /** Saída da rotatória (1ª, 2ª...). */
  saida: number | null
  /** Nome da rua em que entra depois da manobra. */
  rua: string
  /** Onde a manobra acontece (para o balão no mapa). */
  local: Coordenada | null
}

export interface RotaNavegacao {
  linha: Coordenada[]
  distanciaM: number
  duracaoS: number
  /** A próxima manobra e a distância até ela. */
  proxima: Manobra
  distanciaAteManobraM: number
  /** A manobra depois da próxima (para o "depois, ..."). */
  seguinte: Manobra | null
  /** Rumo do primeiro trecho (graus): orienta a seta da van quando o GPS não dá a direção. */
  rumoInicial: number | null
}

const LADO: Record<string, string> = {
  left: 'à esquerda',
  right: 'à direita',
  'slight left': 'levemente à esquerda',
  'slight right': 'levemente à direita',
  'sharp left': 'acentuadamente à esquerda',
  'sharp right': 'acentuadamente à direita',
}

/** Frase da manobra em português ("Vire à direita na Rua X"). */
export function instrucao(m: Manobra): string {
  const na = m.rua ? ` na ${m.rua}` : ''
  const lado = m.modificador ? LADO[m.modificador] : undefined
  switch (m.tipo) {
    case 'arrive':
      return 'Você chegou à parada'
    case 'depart':
      return m.rua ? `Siga pela ${m.rua}` : 'Siga em frente'
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      return m.saida ? `Na rotatória, pegue a ${m.saida}ª saída${na}` : `Entre na rotatória${na}`
    case 'exit roundabout':
    case 'exit rotary':
      return `Saia da rotatória${na}`
    case 'merge':
      return `Entre ${lado ?? ''}${na}`.replace(/\s+/g, ' ').trim()
    case 'on ramp':
      return `Pegue o acesso ${lado ?? ''}${na}`.replace(/\s+/g, ' ').trim()
    case 'off ramp':
      return `Pegue a saída ${lado ?? ''}${na}`.replace(/\s+/g, ' ').trim()
    case 'fork':
      return `Na bifurcação, mantenha-se ${lado ?? 'em frente'}${na}`
    case 'end of road':
      return `No fim da rua, vire ${lado ?? 'à direita'}${na}`
  }
  if (m.modificador === 'uturn') return `Faça o retorno${na}`
  if (!m.modificador || m.modificador === 'straight' || m.tipo === 'new name' || m.tipo === 'continue') {
    return m.rua ? `Siga em frente pela ${m.rua}` : 'Siga em frente'
  }
  return `Vire ${lado}${na}`
}

/** "800 m" / "1,2 km" (arredonda como os apps de navegação). */
export function formatarMetros(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`
  if (m >= 100) return `${Math.round(m / 50) * 50} m`
  return `${Math.max(10, Math.round(m / 10) * 10)} m`
}

/** Distância em metros entre dois pontos (haversine). */
export function metrosEntre([lat1, lng1]: Coordenada, [lat2, lng2]: Coordenada): number {
  const rad = Math.PI / 180
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(a))
}

/** Ponto do segmento a-b mais perto de p (plano local; serve para distâncias de rua). */
function projetar(p: Coordenada, a: Coordenada, b: Coordenada): Coordenada {
  const k = Math.cos((p[0] * Math.PI) / 180)
  const [ax, ay, bx, by, px, py] = [a[1] * k, a[0], b[1] * k, b[0], p[1] * k, p[0]]
  const dx = bx - ax
  const dy = by - ay
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0
  return [ay + dy * t, (ax + dx * t) / k]
}

/**
 * O que falta da linha: começa no ponto da rua mais perto da van e some o trecho já andado.
 * Assim a linha acompanha a van entre um recálculo e outro, sem "cortar caminho" nas curvas.
 * Pega o primeiro trecho a menos de 25 m (num retorno, a rua de volta passa perto da de ida).
 */
export function linhaRestante(linha: Coordenada[], posicao: Coordenada): Coordenada[] {
  if (linha.length < 2) return linha
  let indice = 0
  let ponto = linha[0]
  let menor = Infinity
  for (let i = 0; i < linha.length - 1; i++) {
    const p = projetar(posicao, linha[i], linha[i + 1])
    const d = metrosEntre(p, posicao)
    if (d < menor) [menor, indice, ponto] = [d, i, p]
    if (d < 25) break
  }
  return [ponto, ...linha.slice(indice + 1)]
}

interface PassoOsrm {
  distance: number
  name: string
  maneuver: { type: string; modifier?: string; exit?: number; location?: [number, number]; bearing_after?: number }
}

function manobra(passo: PassoOsrm | undefined): Manobra | null {
  if (!passo) return null
  const local = passo.maneuver.location
  return {
    tipo: passo.maneuver.type,
    modificador: passo.maneuver.modifier ?? null,
    saida: passo.maneuver.exit ?? null,
    rua: passo.name ?? '',
    local: local ? [local[1], local[0]] : null,
  }
}

export async function buscarRotaNavegacao(origem: Coordenada, destino: Coordenada, sinal?: AbortSignal): Promise<RotaNavegacao | null> {
  const pontos = [origem, destino].map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';')
  try {
    const resposta = await fetch(`${URL_OSRM}${pontos}?overview=full&geometries=geojson&steps=true`, { signal: sinal })
    const corpo = await resposta.json()
    const rota = corpo?.routes?.[0]
    if (!rota) return null
    const passos: PassoOsrm[] = rota.legs?.[0]?.steps ?? []
    // passos[0] é a partida; a próxima manobra é a do passo 1 (ou a chegada).
    const proxima = manobra(passos[1]) ?? { tipo: 'arrive', modificador: null, saida: null, rua: '', local: destino }
    return {
      linha: (rota.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng]),
      distanciaM: rota.distance,
      duracaoS: rota.duration,
      proxima,
      distanciaAteManobraM: passos[0]?.distance ?? rota.distance,
      seguinte: manobra(passos[2]),
      rumoInicial: passos[0]?.maneuver.bearing_after ?? null,
    }
  } catch {
    return null
  }
}

/** Distância andada que faz refazer a rota (e atualizar a próxima manobra). */
const METROS_PARA_REFAZER = 30
/** Se o servidor de rotas não responder nesse tempo, desiste e tenta de novo. */
const LIMITE_MS = 8000
const ESPERA_NOVA_TENTATIVA_MS = 3000
/** Intervalo mínimo entre recálculos na mesma parada (andando rápido, não pede a cada leitura). */
const INTERVALO_MINIMO_MS = 4000

/** Direção (graus, 0 = norte) de um ponto até outro: a seta enquanto a rota não chega. */
export function rumoEntre([lat1, lng1]: Coordenada, [lat2, lng2]: Coordenada): number {
  const rad = Math.PI / 180
  const y = Math.sin((lng2 - lng1) * rad) * Math.cos(lat2 * rad)
  const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad)
  return ((Math.atan2(y, x) / rad) + 360) % 360
}

/**
 * Rota até o destino, refeita conforme a van anda.
 *
 * Novas posições do GPS chegam várias vezes por segundo: elas NÃO cancelam o pedido em andamento
 * (antes cancelavam e a rota nunca chegava). Um pedido por vez; se falhar ou passar de 8 s, tenta
 * de novo em 3 s.
 */
export function useRotaNavegacao(posicao: Coordenada | null, destino: Coordenada | null) {
  const [rota, setRota] = useState<RotaNavegacao | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const ultima = useRef<{ origem: Coordenada; destino: string } | null>(null)
  const emAndamento = useRef(false)
  const ultimoPedido = useRef(0)
  const vivo = useRef(true)
  const chaveDestino = destino?.join(',') ?? ''
  const destinoAtual = useRef(chaveDestino)
  destinoAtual.current = chaveDestino

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])

  // Trocou de parada: a rota antiga não vale mais.
  useEffect(() => {
    setRota(null)
    ultima.current = null
  }, [chaveDestino])

  useEffect(() => {
    if (!posicao || !destino || emAndamento.current) return
    const anterior = ultima.current
    if (anterior && anterior.destino === chaveDestino) {
      if (metrosEntre(anterior.origem, posicao) < METROS_PARA_REFAZER || Date.now() - ultimoPedido.current < INTERVALO_MINIMO_MS) return
    }
    ultimoPedido.current = Date.now()
    ultima.current = { origem: posicao, destino: chaveDestino }
    emAndamento.current = true
    const controle = new AbortController()
    const limite = window.setTimeout(() => controle.abort(), LIMITE_MS)
    const pedidoPara = chaveDestino
    void buscarRotaNavegacao(posicao, destino, controle.signal).then((nova) => {
      window.clearTimeout(limite)
      emAndamento.current = false
      if (!vivo.current) return
      if (pedidoPara !== destinoAtual.current) {
        // A parada mudou enquanto esperava: descarta e pede a rota da nova agora.
        ultima.current = null
        setTentativa((t) => t + 1)
        return
      }
      if (nova) {
        setRota(nova)
        return
      }
      // Falhou (sem rede, servidor lento): tenta de novo daqui a pouco.
      window.setTimeout(() => {
        if (!vivo.current) return
        ultima.current = null
        setTentativa((t) => t + 1)
      }, ESPERA_NOVA_TENTATIVA_MS)
    })
    // chaveDestino representa o destino (o array muda de referência a cada render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posicao, chaveDestino, tentativa])

  return { rota }
}
