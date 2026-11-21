import { describe, expect, it } from 'vitest'

import type { Turno } from '../estudante/types.ts'
import { agruparJornadas, contarPorTurno, statusDaJornada, turnoDaHora, turnoInicial } from './tripGrouping.ts'
import type { Sentido, StatusViagem, Viagem } from './types.ts'

const CARLOS = { id: 1, nome: 'Carlos' }
const ANA = { id: 7, nome: 'Ana' }

function umaViagem(
  id: number,
  turno: Turno,
  extra: { sentido?: Sentido; motorista?: Viagem['motorista']; horario?: string; status?: StatusViagem; total?: number } = {},
): Viagem {
  const total = extra.total ?? 2
  return {
    id,
    data: '2026-11-23',
    sentido: extra.sentido ?? 'ida',
    status: extra.status ?? 'agendada',
    horario_previsto: extra.horario ?? '18:00:00',
    horario_saida: null,
    horario_chegada: null,
    rota: { id, nome: `Rota ${id}`, turno, instituicao: { id, nome: `Faculdade ${id}` } },
    motorista: extra.motorista ?? CARLOS,
    veiculo: { id: 1, placa: 'QJA1B23', modelo: 'Sprinter', capacidade: 20 },
    substituicao: false,
    passageiros: { total, pendente: total, presente: 0, ausente: 0, nao_vai: 0 },
  }
}

describe('turnos', () => {
  it('turno pela hora e turno inicial', () => {
    expect(turnoDaHora(6)).toBe('manha')
    expect(turnoDaHora(18)).toBe('noite')
    const viagens = [umaViagem(1, 'manha'), umaViagem(2, 'noite')]
    expect(turnoInicial(viagens, 19)).toBe('noite')
    expect(turnoInicial(viagens, 14)).toBe('manha')
    expect(contarPorTurno(viagens)).toEqual({ manha: 1, tarde: 0, noite: 1 })
    // Mesmo motorista e sentido com dois destinos = uma viagem; a volta é outra.
    const doCarlos = [umaViagem(1, 'noite'), umaViagem(2, 'noite'), umaViagem(3, 'noite', { sentido: 'volta' })]
    expect(contarPorTurno(doCarlos).noite).toBe(2)
  })
})

describe('statusDaJornada', () => {
  it('em andamento manda; todas canceladas = cancelada; nada agendado = concluída', () => {
    expect(statusDaJornada([{ status: 'agendada' }, { status: 'em_andamento' }])).toBe('em_andamento')
    expect(statusDaJornada([{ status: 'cancelada' }, { status: 'cancelada' }])).toBe('cancelada')
    expect(statusDaJornada([{ status: 'concluida' }, { status: 'cancelada' }])).toBe('concluida')
    expect(statusDaJornada([{ status: 'agendada' }, { status: 'cancelada' }])).toBe('agendada')
  })
})

describe('agruparJornadas', () => {
  const viagens = [
    umaViagem(1, 'noite', { horario: '18:00:00', total: 4 }),
    umaViagem(2, 'noite', { horario: '17:30:00', total: 1 }),
    umaViagem(3, 'noite', { motorista: ANA, horario: '17:30:00' }),
    umaViagem(4, 'noite', { sentido: 'volta', horario: '22:00:00' }),
    umaViagem(5, 'manha'),
  ]

  it('uma jornada por motorista e sentido, só do turno pedido', () => {
    const { ida, volta } = agruparJornadas(viagens, 'noite')
    expect(ida.map((j) => j.motorista.nome)).toEqual(['Ana', 'Carlos']) // mesmo horário: pelo nome
    expect(volta).toHaveLength(1)
    const carlos = ida[1]
    expect(carlos.viagens.map((v) => v.id)).toEqual([1, 2])
    expect(carlos.horario_previsto).toBe('17:30:00') // a saída mais cedo
    expect(carlos.passageiros.total).toBe(5)
    expect(carlos.veiculos).toHaveLength(1)
    expect(carlos.chave).toEqual({ data: '2026-11-23', fk_motorista: 1, turno: 'noite', sentido: 'ida' })
  })
})
