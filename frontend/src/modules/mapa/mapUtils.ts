import L from 'leaflet'

import { iniciais } from '../../shared/utils/formatar.ts'
import type { Area, Coordenada } from '../area/types.ts'
import type { Estudante } from '../estudante/types.ts'

/** Centro de Guarapari/ES: enquadramento inicial quando ainda não há nada no mapa. */
export const CENTRO_PADRAO: Coordenada = [-20.6716, -40.4997]

/**
 * Camada de fundo do mapa: OpenStreetMap. A política de uso do servidor público do OSM não
 * cobre uso comercial pesado; em produção, troque pela URL de um provedor contratado.
 */
export const CAMADA_FUNDO = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  atribuicao: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}

/** Uma cor por motorista, para as áreas e a rota dele se distinguirem no mapa. */
const CORES = ['#F2600C', '#1B3C59', '#0EA5E9', '#10B981', '#8B5CF6', '#E11D48', '#CA8A04', '#14B8A6', '#DB2777', '#4F46E5']

export function corDoMotorista(idMotorista: number | null | undefined): string {
  return idMotorista ? CORES[(idMotorista - 1) % CORES.length] : '#94A3B8'
}

export function coordenadaDo(estudante: Estudante): Coordenada | null {
  const { latitude, longitude } = estudante.endereco
  return latitude !== null && longitude !== null ? [latitude, longitude] : null
}

/**
 * Ponto dentro do polígono (ray casting), a mesma conta do trigger do banco. Serve só para
 * mostrar uma prévia da área no formulário: quem decide a área de verdade é o banco ao salvar.
 */
export function pontoNoPoligono([lat, lng]: Coordenada, poligono: Coordenada[]): boolean {
  let dentro = false
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [yi, xi] = poligono[i]
    const [yj, xj] = poligono[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}

export function areaDoPonto(ponto: Coordenada, areas: Area[]): Area | null {
  return [...areas].sort((a, b) => a.id - b.id).find((area) => pontoNoPoligono(ponto, area.poligono)) ?? null
}

/** Ordem de embarque: pelo horário previsto; quem não tem horário vai para o fim. */
export function ordenarPorEmbarque(estudantes: Estudante[]): Estudante[] {
  return [...estudantes].sort((a, b) =>
    (a.horario_embarque ?? '99').localeCompare(b.horario_embarque ?? '99'),
  )
}

// ---------------------------------------------------------------- Ícones dos pinos

/** O ícone do Leaflet é HTML em texto: nada digitado pelo usuário entra sem escapar. */
const escaparHtml = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export type VariantePino = 'normal' | 'sem-area' | 'apagado'

/** Gota laranja com as iniciais (ou o número da parada, quando a rota está aberta). */
export function iconePassageiro(estudante: Estudante, variante: VariantePino = 'normal', numero?: number) {
  const classe = variante === 'normal' ? '' : ` pino-${variante}`
  const texto = numero !== undefined ? String(numero) : escaparHtml(iniciais(estudante.nome))
  return L.divIcon({
    className: '',
    html: `<div class="pino${classe}"><span>${texto}</span></div>`,
    iconSize: [34, 34],
    // A ponta da gota fica ~24px abaixo do centro (diagonal do quadrado girado).
    iconAnchor: [17, 41],
    popupAnchor: [0, -38],
    tooltipAnchor: [0, -40],
  })
}

const SVG_ESCOLA =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 2 9 2 12 0v-5"/></svg>'

/** Pino da faculdade; `cor` pinta o pino com a cor do destino na viagem (padrão: marinho). */
export function iconeInstituicao(cor?: string) {
  const estilo = cor && /^#[0-9a-f]{6}$/i.test(cor) ? ` style="background:${cor}"` : ''
  return L.divIcon({
    className: '',
    html: `<div class="pino pino-instituicao"${estilo}>${SVG_ESCOLA}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
    tooltipAnchor: [0, -18],
  })
}

export const ICONE_INSTITUICAO = iconeInstituicao()
