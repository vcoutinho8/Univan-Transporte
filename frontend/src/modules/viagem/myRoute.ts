import type { Coordenada } from '../area/types.ts'
import { estaABordo } from './tripFlow.ts'
import type { ChamadaDaJornada, Jornada } from './types.ts'

/** Uma parada que falta na jornada do motorista: a casa de um passageiro ou uma parada da faculdade. */
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

/** Distância em linha reta (haversine), em km. */
export function distanciaKm([lat1, lng1]: Coordenada, [lat2, lng2]: Coordenada): number {
  const rad = Math.PI / 180
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

/**
 * Melhor ordem dos `pontos` saindo de `inicio` e terminando em `fim` (os dois opcionais e fixos):
 * vizinho mais próximo + 2-opt, a mesma ideia do cálculo da API (aqui em linha reta, para a volta).
 * Devolve os índices de `pontos` na ordem.
 */
export function melhorOrdem(pontos: Coordenada[], inicio: Coordenada | null, fim: Coordenada | null): number[] {
  const restantes = pontos.map((_, i) => i)
  if (restantes.length <= 1) return restantes
  const ordem: number[] = []
  let atual = inicio
  while (restantes.length) {
    let melhor = 0
    if (atual) {
      let menor = Infinity
      restantes.forEach((indice, i) => {
        const d = distanciaKm(atual!, pontos[indice])
        if (d < menor) [menor, melhor] = [d, i]
      })
    }
    const [proximo] = restantes.splice(melhor, 1)
    ordem.push(proximo)
    atual = pontos[proximo]
  }
  const custo = (seq: number[]) => {
    const caminho = [...(inicio ? [inicio] : []), ...seq.map((i) => pontos[i]), ...(fim ? [fim] : [])]
    return caminho.slice(1).reduce((soma, p, i) => soma + distanciaKm(caminho[i], p), 0)
  }
  let atualCusto = custo(ordem)
  let melhorou = true
  while (melhorou) {
    melhorou = false
    for (let i = 0; i < ordem.length - 1; i++) {
      for (let j = i + 1; j < ordem.length; j++) {
        const candidata = [...ordem.slice(0, i), ...ordem.slice(i, j + 1).reverse(), ...ordem.slice(j + 1)]
        const valor = custo(candidata)
        if (valor + 1e-9 < atualCusto) {
          ordem.splice(0, ordem.length, ...candidata)
          atualCusto = valor
          melhorou = true
        }
      }
    }
  }
  return ordem
}

/**
 * Paradas que faltam, na ordem em que o motorista passa:
 * - Ida: as casas de quem falta buscar (na ordem da fila, que já é a otimizada) e, depois, as paradas
 *   das faculdades de quem está (ou vai estar) a bordo.
 * - Volta: as paradas das faculdades onde ainda tem gente para embarcar e, depois, as casas de quem
 *   vai descer, na melhor ordem até a casa do motorista.
 * Cada passageiro desce na parada que escolheu (ex.: Biopráticas); sem escolha, na principal.
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
    const grupos = new Map<string, ChamadaDaJornada[]>()
    for (const c of chamadas) {
      const chave = `${c.instituicao.id}-${c.estudante.parada?.id ?? 0}`
      grupos.set(chave, [...(grupos.get(chave) ?? []), c])
    }
    return [...grupos.entries()].map(([chave, lista]) => {
      const parada = lista[0].estudante.parada
      return {
        chave: `faculdade-${acao}-${chave}`,
        tipo: 'faculdade' as const,
        titulo: parada ? `${lista[0].instituicao.nome} · ${parada.nome}` : lista[0].instituicao.nome,
        detalhe: `${lista.length} passageiro(s) para ${acao === 'buscar' ? 'embarcar' : 'descer'}`,
        ponto: parada ? [parada.latitude, parada.longitude] : pontosFaculdade.get(lista[0].instituicao.id) ?? null,
        acao,
        passageiros: lista,
      }
    })
  }

  if (jornada.sentido === 'ida') {
    return [...pendentes.map((c) => casa(c, 'buscar')), ...faculdades([...aBordo, ...pendentes], 'deixar')]
  }
  const embarques = faculdades(pendentes, 'buscar')
  const entregas = [...aBordo, ...pendentes].map((c) => casa(c, 'deixar'))
  // Volta: melhor ordem das casas, da última faculdade até a casa do motorista.
  const comPonto = entregas.filter((p) => p.ponto)
  const semPonto = entregas.filter((p) => !p.ponto)
  const inicio = [...embarques].reverse().find((p) => p.ponto)?.ponto ?? null
  const ordem = melhorOrdem(
    comPonto.map((p) => p.ponto!),
    inicio,
    jornada.partida ?? null,
  )
  return [...embarques, ...ordem.map((i) => comPonto[i]), ...semPonto]
}

/** Link do Google Maps com a rota de carro até o ponto (abre o app no celular). */
export const linkNavegacao = ([lat, lng]: Coordenada) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
