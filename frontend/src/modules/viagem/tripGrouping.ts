import type { Turno } from '../estudante/types.ts'
import type { ChaveJornada, ContagemPassageiros, Sentido, StatusViagem, Viagem } from './types.ts'

export const ORDEM_TURNOS: Turno[] = ['manha', 'tarde', 'noite']

/** Turno do relógio: manhã até 11h59, tarde até 17h59, noite depois. */
export function turnoDaHora(hora: number): Turno {
  if (hora < 12) return 'manha'
  if (hora < 18) return 'tarde'
  return 'noite'
}

/**
 * Turno que a tela abre selecionado: o do horário atual, se tiver viagem; senão o primeiro
 * turno do dia que tiver; sem nenhuma viagem, o do horário atual.
 */
export function turnoInicial(viagens: Viagem[], hora: number): Turno {
  const agora = turnoDaHora(hora)
  if (viagens.some((v) => v.rota.turno === agora)) return agora
  return ORDEM_TURNOS.find((t) => viagens.some((v) => v.rota.turno === t)) ?? agora
}

/** Viagens por turno, contadas como no cartão: uma por motorista e sentido (não uma por destino). */
export function contarPorTurno(viagens: Viagem[]): Record<Turno, number> {
  const contagem = { manha: 0, tarde: 0, noite: 0 }
  const vistas = new Set<string>()
  for (const v of viagens) {
    const chave = `${v.rota.turno}|${v.motorista.id}|${v.sentido}`
    if (vistas.has(chave)) continue
    vistas.add(chave)
    contagem[v.rota.turno] += 1
  }
  return contagem
}

/** Resumo de uma jornada para o cartão do motorista (montado da lista de viagens do dia). */
export interface ResumoJornada {
  chave: ChaveJornada
  motorista: Viagem['motorista']
  viagens: Viagem[]
  status: StatusViagem
  /** O mais cedo entre as rotas ativas. */
  horario_previsto: string | null
  /** Placas usadas (normalmente uma; mais de uma quando houve troca em alguma rota). */
  veiculos: Viagem['veiculo'][]
  passageiros: ContagemPassageiros
}

/** Mesma regra da API (jornada_servico.status_da_jornada). */
export function statusDaJornada(viagens: Pick<Viagem, 'status'>[]): StatusViagem {
  const situacoes = new Set(viagens.map((v) => v.status))
  if (situacoes.has('em_andamento')) return 'em_andamento'
  if (situacoes.size === 1 && situacoes.has('cancelada')) return 'cancelada'
  if (!situacoes.has('agendada')) return 'concluida'
  return 'agendada'
}

/**
 * Jornadas de um turno, separadas em ida e volta: uma por motorista, juntando as rotas dele.
 * Em cada sentido, as jornadas vêm na ordem de saída (e pelo nome do motorista no empate).
 */
export function agruparJornadas(viagens: Viagem[], turno: Turno): Record<Sentido, ResumoJornada[]> {
  const resultado: Record<Sentido, ResumoJornada[]> = { ida: [], volta: [] }
  const mapa = new Map<string, Viagem[]>()
  for (const v of viagens) {
    if (v.rota.turno !== turno) continue
    const chave = `${v.sentido}|${v.motorista.id}`
    mapa.set(chave, [...(mapa.get(chave) ?? []), v])
  }
  for (const doMotorista of mapa.values()) {
    const primeira = doMotorista[0]
    const ativas = doMotorista.filter((v) => v.status !== 'cancelada')
    const previstos = ativas.map((v) => v.horario_previsto).filter((h): h is string => Boolean(h)).sort()
    const passageiros = { total: 0, pendente: 0, presente: 0, ausente: 0, nao_vai: 0 }
    for (const v of doMotorista) for (const campo of Object.keys(passageiros) as (keyof ContagemPassageiros)[]) passageiros[campo] += v.passageiros[campo]
    resultado[primeira.sentido].push({
      chave: { data: primeira.data, fk_motorista: primeira.motorista.id, turno, sentido: primeira.sentido },
      motorista: primeira.motorista,
      viagens: doMotorista,
      status: statusDaJornada(doMotorista),
      horario_previsto: previstos[0] ?? null,
      veiculos: [...new Map(doMotorista.map((v) => [v.veiculo.id, v.veiculo])).values()],
      passageiros,
    })
  }
  const ordem = (a: ResumoJornada, b: ResumoJornada) =>
    (a.horario_previsto ?? '99').localeCompare(b.horario_previsto ?? '99') || a.motorista.nome.localeCompare(b.motorista.nome, 'pt-BR')
  resultado.ida.sort(ordem)
  resultado.volta.sort(ordem)
  return resultado
}
