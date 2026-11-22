import type { Area, Coordenada } from '../area/types.ts'
import type { Estudante, Turno } from '../estudante/types.ts'
import type { Instituicao, ParadaExtra } from '../instituicao/types.ts'
import { coordenadaDo } from '../mapa/mapUtils.ts'
import type { Rota } from './types.ts'

/**
 * No banco, uma rota é motorista + faculdade + turno. Na prática o motorista faz UMA viagem
 * por turno: recolhe todo mundo dos bairros dele e passa por várias faculdades. Este arquivo
 * junta as rotas do motorista num turno nessa viagem.
 */

/**
 * Quem a rota leva: mesma regra da API (GET /api/rotas/{id}/passageiros) e da rotina
 * gerar_dia: passageiro ativo, morando num bairro ativo do motorista, mesma faculdade e turno.
 */
export function passageirosDaRota(rota: Rota, areas: Area[], estudantes: Estudante[]): Estudante[] {
  const bairros = new Set(areas.filter((a) => a.status === 'ativo' && a.fk_motorista === rota.fk_motorista).map((a) => a.id))
  return estudantes.filter(
    (e) =>
      e.status === 'ativo' &&
      e.fk_area !== null &&
      bairros.has(e.fk_area) &&
      e.fk_instituicao === rota.fk_instituicao &&
      e.turno === rota.turno,
  )
}

export interface Parada {
  estudante: Estudante
  rota: Rota
  ponto: Coordenada | null
}

export interface Destino {
  instituicao: Instituicao
  rota: Rota
  /** Parada extra (ex.: Biopráticas); vazio = a parada principal da faculdade. */
  parada: ParadaExtra | null
  ponto: Coordenada | null
  passageiros: number
}

/** Chave única do destino (a mesma rota pode ter a parada principal e paradas extras). */
export const chaveDestino = (d: Destino) => `${d.rota.id}-${d.parada?.id ?? 0}`

export interface Viagem {
  rotas: Rota[]
  /** Embarques na ordem do horário previsto. */
  paradas: Parada[]
  /** Faculdades na ordem de desembarque (a mais perto da última parada primeiro, e assim por diante). */
  destinos: Destino[]
}

export function montarViagem(
  idMotorista: number,
  turno: Turno,
  rotas: Rota[],
  areas: Area[],
  estudantes: Estudante[],
  instituicoes: Instituicao[],
): Viagem {
  const rotasDoTurno = rotas.filter((r) => r.status === 'ativo' && r.fk_motorista === idMotorista && r.turno === turno)
  const paradas: Parada[] = rotasDoTurno
    .flatMap((rota) => passageirosDaRota(rota, areas, estudantes).map((estudante) => ({ estudante, rota, ponto: coordenadaDo(estudante) })))
    .sort(
      (a, b) =>
        (a.estudante.horario_embarque ?? '99').localeCompare(b.estudante.horario_embarque ?? '99') ||
        a.estudante.nome.localeCompare(b.estudante.nome),
    )

  // Um destino por parada usada: a principal da faculdade e cada parada extra escolhida por alguém.
  const destinos: Destino[] = rotasDoTurno.flatMap((rota) => {
    const instituicao = instituicoes.find((i) => i.id === rota.fk_instituicao)
    if (!instituicao) return []
    const daRota = paradas.filter((p) => p.rota.id === rota.id)
    const grupos = new Map<number, number>()
    for (const p of daRota) {
      const id = instituicao.paradas?.some((x) => x.id === p.estudante.fk_parada) ? p.estudante.fk_parada! : 0
      grupos.set(id, (grupos.get(id) ?? 0) + 1)
    }
    return [...grupos.entries()].map(([id, total]) => {
      const parada = instituicao.paradas?.find((x) => x.id === id) ?? null
      return {
        instituicao,
        rota,
        parada,
        // A van para na rua (ponto de parada ajustado ou extra), não na localização do endereço.
        ponto: (parada ? [parada.latitude, parada.longitude] : instituicao.ponto_parada ?? null) as Coordenada | null,
        passageiros: total,
      }
    })
  })

  // Ordem de desembarque: vizinho mais próximo a partir da última parada.
  const ordenados: Destino[] = []
  let atual = [...paradas].reverse().find((p) => p.ponto)?.ponto ?? null
  const restantes = [...destinos]
  while (restantes.length) {
    let indice = 0
    if (atual) {
      let menor = Infinity
      restantes.forEach((d, i) => {
        const distancia = d.ponto ? distanciaKm(atual!, d.ponto) : Infinity
        if (distancia < menor) [menor, indice] = [distancia, i]
      })
    }
    const [proximo] = restantes.splice(indice, 1)
    ordenados.push(proximo)
    atual = proximo.ponto ?? atual
  }

  return { rotas: rotasDoTurno, paradas, destinos: ordenados }
}

/** Distância em linha reta (fórmula de haversine). */
export function distanciaKm([lat1, lng1]: Coordenada, [lat2, lng2]: Coordenada): number {
  const rad = Math.PI / 180
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

/** Cores dos destinos (faculdades) dentro de uma viagem. */
export const CORES_DESTINO = ['#0EA5E9', '#8B5CF6', '#10B981', '#E11D48', '#CA8A04', '#14B8A6', '#DB2777', '#4F46E5']

/** "17:12" + 47 minutos → "17:59". */
export function somarMinutos(horario: string, minutos: number): string {
  const [h, m] = horario.split(':').map(Number)
  const total = (h * 60 + m + Math.round(minutos)) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
