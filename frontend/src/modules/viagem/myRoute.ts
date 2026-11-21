import type { Coordenada } from '../area/types.ts'
import { estaABordo } from './tripFlow.ts'
import type { ChamadaDaJornada, Jornada } from './types.ts'

/** Uma parada que falta na jornada do motorista: a casa de um passageiro ou uma faculdade. */
export interface ParadaRestante {
  chave: string
  tipo: 'passageiro' | 'faculdade'
  titulo: string
  detalhe: string
  /** Sem coordenada (endereço não localizado), a parada aparece na lista mas não no mapa. */
  ponto: Coordenada | null
  /** O que acontece na parada: buscar (embarque) ou deixar (desembarque). */
  acao: 'buscar' | 'deixar'
  passageiros: ChamadaDaJornada[]
  celular?: string
}

const pontoDaCasa = (c: ChamadaDaJornada): Coordenada | null => {
  const { latitude, longitude } = c.estudante.endereco
  return latitude != null && longitude != null ? [latitude, longitude] : null
}

function endereco(c: ChamadaDaJornada) {
  const { logradouro, numero, bairro } = c.estudante.endereco
  return `${logradouro}${numero ? `, ${numero}` : ''} · ${bairro}`
}

/**
 * Paradas que faltam, na ordem em que o motorista passa:
 * - Ida: as casas de quem falta buscar e, depois, as faculdades de quem está (ou vai estar) a bordo.
 * - Volta: as faculdades onde ainda tem gente para embarcar e, depois, as casas de quem vai descer.
 * A faculdade usa o ponto de parada (onde a van para na rua).
 */
export function paradasRestantes(jornada: Jornada, pontosFaculdade: Map<number, Coordenada | null>): ParadaRestante[] {
  const fila = jornada.fila.filter((c) => c.status !== 'nao_vai')
  const pendentes = fila.filter((c) => c.status === 'pendente')
  const aBordo = fila.filter(estaABordo)

  const casa = (c: ChamadaDaJornada, acao: ParadaRestante['acao']): ParadaRestante => ({
    chave: `casa-${c.fk_viagem}-${c.estudante.id}`,
    tipo: 'passageiro',
    titulo: c.estudante.apelido || c.estudante.nome,
    detalhe: endereco(c),
    ponto: pontoDaCasa(c),
    acao,
    passageiros: [c],
    celular: c.estudante.celular,
  })

  function faculdades(chamadas: ChamadaDaJornada[], acao: ParadaRestante['acao']): ParadaRestante[] {
    const porFaculdade = new Map<number, ChamadaDaJornada[]>()
    for (const c of chamadas) porFaculdade.set(c.instituicao.id, [...(porFaculdade.get(c.instituicao.id) ?? []), c])
    return [...porFaculdade.entries()].map(([id, lista]) => ({
      chave: `faculdade-${acao}-${id}`,
      tipo: 'faculdade' as const,
      titulo: lista[0].instituicao.nome,
      detalhe: `${lista.length} passageiro(s) para ${acao === 'buscar' ? 'embarcar' : 'descer'}`,
      ponto: pontosFaculdade.get(id) ?? null,
      acao,
      passageiros: lista,
    }))
  }

  if (jornada.sentido === 'ida') {
    return [...pendentes.map((c) => casa(c, 'buscar')), ...faculdades([...aBordo, ...pendentes], 'deixar')]
  }
  return [...faculdades(pendentes, 'buscar'), ...[...aBordo, ...pendentes].map((c) => casa(c, 'deixar'))]
}

/** Link do Google Maps com a rota de carro até o ponto (abre o app no celular). */
export const linkNavegacao = ([lat, lng]: Coordenada) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
