import { soDigitos } from '../../shared/utils/formatar.ts'
import type { Coordenada } from '../area/types.ts'
import type { DadosEndereco } from './types.ts'

/**
 * Serviços públicos de endereço, chamados direto do navegador (não passam pela nossa API):
 * - BrasilAPI (CEP v2): completa logradouro, bairro, cidade e UF a partir do CEP e, quando tem,
 *   já traz a coordenada. Se ela cair, a ViaCEP responde no lugar.
 * - Nominatim (OpenStreetMap): acha a latitude/longitude do endereço para o pino no mapa.
 * O Nominatim pede no máximo 1 busca por segundo; por isso a busca só roda quando o usuário
 * pede (botão) ou ao completar o CEP, nunca a cada tecla.
 */

interface RespostaViaCep {
  logradouro: string
  bairro: string
  localidade: string
  uf: string
  erro?: boolean | string
}

/** Campos que o CEP completa; `posicao` quando a BrasilAPI sabe onde fica (reserva do mapa). */
export type EnderecoDoCep = Pick<DadosEndereco, 'logradouro' | 'bairro' | 'cidade' | 'estado'> & { posicao?: Coordenada | null }

interface RespostaBrasilApi {
  state: string
  city: string
  neighborhood?: string
  street?: string
  location?: { coordinates?: { latitude?: string; longitude?: string } }
}

async function cepNaBrasilApi(numeros: string): Promise<EnderecoDoCep | null> {
  const resposta = await fetch(`https://brasilapi.com.br/api/cep/v2/${numeros}`, { signal: AbortSignal.timeout(6000) })
  if (!resposta.ok) return null
  const d: RespostaBrasilApi = await resposta.json()
  const { latitude, longitude } = d.location?.coordinates ?? {}
  return {
    logradouro: d.street ?? '',
    bairro: d.neighborhood ?? '',
    cidade: d.city,
    estado: d.state,
    posicao: latitude && longitude ? [Number(latitude), Number(longitude)] : null,
  }
}

async function cepNaViaCep(numeros: string): Promise<EnderecoDoCep | null> {
  const resposta = await fetch(`https://viacep.com.br/ws/${numeros}/json/`, { signal: AbortSignal.timeout(6000) })
  if (!resposta.ok) return null
  const dados: RespostaViaCep = await resposta.json()
  if (dados.erro) return null
  return { logradouro: dados.logradouro, bairro: dados.bairro, cidade: dados.localidade, estado: dados.uf }
}

/** BrasilAPI primeiro (mais precisa e com coordenada); fora do ar ou sem o CEP, a ViaCEP. */
export async function buscarCep(cep: string): Promise<EnderecoDoCep | null> {
  const numeros = soDigitos(cep)
  if (numeros.length !== 8) return null
  for (const fonte of [cepNaBrasilApi, cepNaViaCep]) {
    try {
      const achado = await fonte(numeros)
      if (achado) return achado
    } catch {
      // fora do ar ou demorou: tenta a próxima
    }
  }
  return null
}

async function consultarNominatim(parametros: Record<string, string>): Promise<Coordenada | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.search = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'br', ...parametros }).toString()
  const resposta = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } })
  if (!resposta.ok) return null
  const lista: { lat: string; lon: string }[] = await resposta.json()
  return lista.length ? [Number(lista[0].lat), Number(lista[0].lon)] : null
}

/** Procura a coordenada do endereço; se não achar a rua com número, tenta só a rua. */
export async function localizarEndereco(endereco: Partial<DadosEndereco>): Promise<Coordenada | null> {
  if (!endereco.logradouro || !endereco.cidade) return null
  const base = { city: endereco.cidade, state: endereco.estado ?? '', country: 'Brasil' }
  try {
    const comNumero = endereco.numero ? `${endereco.numero} ${endereco.logradouro}` : endereco.logradouro
    return (
      (await consultarNominatim({ ...base, street: comNumero })) ??
      (endereco.numero ? await consultarNominatim({ ...base, street: endereco.logradouro }) : null)
    )
  } catch {
    return null
  }
}

/** O que o OpenStreetMap sabe do ponto (pode faltar CEP ou número): para atualizar o formulário. */
export async function enderecoParcialDoPonto([lat, lng]: Coordenada): Promise<Partial<DadosEndereco> | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.search = new URLSearchParams({ format: 'jsonv2', lat: String(lat), lon: String(lng), zoom: '18', addressdetails: '1' }).toString()
    const resposta = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } })
    if (!resposta.ok) return null
    const { address: a } = (await resposta.json()) as { address?: Record<string, string> }
    if (!a) return null
    const cep = (a.postcode ?? '').replace(/\D/g, '')
    const uf = (a['ISO3166-2-lvl4'] ?? '').replace('BR-', '')
    const parcial: Partial<DadosEndereco> = {
      logradouro: a.road ?? a.pedestrian ?? a.residential,
      bairro: a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district,
      cidade: a.city ?? a.town ?? a.village ?? a.municipality,
      numero: a.house_number,
      ...(cep.length === 8 ? { cep } : {}),
      ...(uf.length === 2 ? { estado: uf } : {}),
    }
    return Object.fromEntries(Object.entries(parcial).filter(([, v]) => v)) as Partial<DadosEndereco>
  } catch {
    return null
  }
}

/**
 * Endereço do ponto marcado no mapa (geocodificação reversa do OpenStreetMap).
 * Devolve null se não achar a rua ou o CEP (aí o endereço é preenchido no cadastro).
 */
export async function enderecoDoPonto([lat, lng]: Coordenada): Promise<DadosEndereco | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.search = new URLSearchParams({ format: 'jsonv2', lat: String(lat), lon: String(lng), zoom: '18', addressdetails: '1' }).toString()
    const resposta = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } })
    if (!resposta.ok) return null
    const { address: a } = (await resposta.json()) as { address?: Record<string, string> }
    if (!a) return null
    const cep = (a.postcode ?? '').replace(/\D/g, '')
    const uf = (a['ISO3166-2-lvl4'] ?? '').replace('BR-', '')
    const logradouro = a.road ?? a.pedestrian ?? a.residential
    const bairro = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district
    const cidade = a.city ?? a.town ?? a.village ?? a.municipality
    if (cep.length !== 8 || !logradouro || !cidade || uf.length !== 2) return null
    return {
      cep,
      logradouro,
      numero: a.house_number ?? null,
      complemento: null,
      bairro: bairro ?? 'Centro',
      cidade,
      estado: uf,
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
    }
  } catch {
    return null
  }
}
