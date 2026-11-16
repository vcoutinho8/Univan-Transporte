import { soDigitos } from '../../shared/utils/formatar.ts'
import type { Coordenada } from '../area/types.ts'
import type { DadosEndereco } from './types.ts'

/**
 * Serviços públicos de endereço, chamados direto do navegador (não passam pela nossa API):
 * - ViaCEP: completa logradouro, bairro, cidade e UF a partir do CEP.
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

/** Campos que o ViaCEP completa. */
export type EnderecoDoCep = Pick<DadosEndereco, 'logradouro' | 'bairro' | 'cidade' | 'estado'>

export async function buscarCep(cep: string): Promise<EnderecoDoCep | null> {
  const numeros = soDigitos(cep)
  if (numeros.length !== 8) return null
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${numeros}/json/`)
    if (!resposta.ok) return null
    const dados: RespostaViaCep = await resposta.json()
    if (dados.erro) return null
    return { logradouro: dados.logradouro, bairro: dados.bairro, cidade: dados.localidade, estado: dados.uf }
  } catch {
    return null
  }
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
