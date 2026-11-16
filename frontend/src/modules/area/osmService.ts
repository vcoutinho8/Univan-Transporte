import type { Coordenada } from './types.ts'

/**
 * Contorno de bairro direto do OpenStreetMap (Nominatim), chamado pelo navegador.
 * Em Guarapari, por exemplo, quase todos os bairros têm o limite oficial cadastrado; quando
 * o bairro só existe como ponto no OSM, não há contorno e o usuário desenha à mão.
 * Política do Nominatim: no máximo 1 busca por segundo, por isso só busca a cada clique.
 */

export interface BairroOsm {
  nome: string
  cidade: string | null
  poligono: Coordenada[]
}

/** Limite de vértices guardados: suficiente para o desenho e leve para o trigger do banco. */
const MAXIMO_VERTICES = 60

interface RespostaNominatim {
  name?: string
  addresstype?: string
  address?: Record<string, string>
  geojson?: { type: string; coordinates: unknown }
}

const TIPOS_BAIRRO = new Set(['suburb', 'neighbourhood', 'quarter', 'city_district', 'borough'])

async function consultar(caminho: string, parametros: Record<string, string>): Promise<RespostaNominatim[]> {
  const url = new URL(`https://nominatim.openstreetmap.org/${caminho}`)
  url.search = new URLSearchParams({ format: 'jsonv2', polygon_geojson: '1', addressdetails: '1', ...parametros }).toString()
  const resposta = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } })
  if (!resposta.ok) return []
  const corpo = await resposta.json()
  return Array.isArray(corpo) ? corpo : corpo?.geojson ? [corpo] : []
}

/** Bairro em volta do ponto clicado (busca reversa no nível de bairro). */
export async function bairroNoPonto([lat, lng]: Coordenada): Promise<BairroOsm | null> {
  try {
    const [resultado] = await consultar('reverse', { lat: String(lat), lon: String(lng), zoom: '14' })
    return resultado ? converter(resultado) : null
  } catch {
    return null
  }
}

/** Bairro pelo nome, ex.: "Praia do Morro, Guarapari". */
export async function bairroPorNome(texto: string): Promise<BairroOsm | null> {
  try {
    const resultados = await consultar('search', { q: texto, limit: '5', countrycodes: 'br' })
    for (const resultado of resultados) {
      const bairro = converter(resultado)
      if (bairro) return bairro
    }
    return null
  } catch {
    return null
  }
}

function converter(resultado: RespostaNominatim): BairroOsm | null {
  const { geojson } = resultado
  if (!geojson || !TIPOS_BAIRRO.has(resultado.addresstype ?? '')) return null
  // GeoJSON é [lon, lat]; pega o anel externo (do maior pedaço, se for MultiPolygon).
  let aneis: [number, number][][] = []
  if (geojson.type === 'Polygon') aneis = [(geojson.coordinates as [number, number][][])[0]]
  else if (geojson.type === 'MultiPolygon') aneis = (geojson.coordinates as [number, number][][][]).map((p) => p[0])
  if (aneis.length === 0) return null
  const anel = aneis.reduce((maior, atual) => (atual.length > maior.length ? atual : maior))
  const pontos: Coordenada[] = anel.slice(0, -1).map(([lon, lat]) => [lat, lon])
  return {
    nome: resultado.name ?? '',
    cidade: resultado.address?.city ?? resultado.address?.town ?? null,
    poligono: simplificar(pontos, MAXIMO_VERTICES),
  }
}

/** Douglas-Peucker: tira vértices quase alinhados até caber no limite, sem deformar o contorno. */
export function simplificar(pontos: Coordenada[], maximo: number): Coordenada[] {
  let tolerancia = 0.00008
  let resultado = pontos
  while (resultado.length > maximo) {
    resultado = douglasPeucker(pontos, tolerancia)
    tolerancia *= 1.5
  }
  return resultado.map(([lat, lng]) => [arredondar(lat), arredondar(lng)])
}

function douglasPeucker(pontos: Coordenada[], tolerancia: number): Coordenada[] {
  if (pontos.length < 3) return pontos
  const [a, b] = [pontos[0], pontos[pontos.length - 1]]
  let indice = 0
  let maior = 0
  for (let i = 1; i < pontos.length - 1; i++) {
    const d = distanciaAteReta(pontos[i], a, b)
    if (d > maior) [indice, maior] = [i, d]
  }
  if (maior <= tolerancia) return [a, b]
  return [...douglasPeucker(pontos.slice(0, indice + 1), tolerancia).slice(0, -1), ...douglasPeucker(pontos.slice(indice), tolerancia)]
}

function distanciaAteReta([y0, x0]: Coordenada, [y1, x1]: Coordenada, [y2, x2]: Coordenada) {
  const comprimento = Math.hypot(x2 - x1, y2 - y1) || 1e-12
  return Math.abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1) / comprimento
}

const arredondar = (valor: number) => Math.round(valor * 1e6) / 1e6
