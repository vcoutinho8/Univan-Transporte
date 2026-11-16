import { describe, expect, it } from 'vitest'

import { umaArea, umaInstituicao, umaRota, umEstudante } from '../../test/fabricas.ts'
import { distanciaKm, montarViagem, passageirosDaRota, somarMinutos } from './tripUtils.ts'

describe('quem a rota leva (mesma regra do gerar_dia)', () => {
  const rota = umaRota()
  const areas = [
    umaArea({ id: 1, fk_motorista: 1 }),
    umaArea({ id: 2, fk_motorista: 2 }),
    umaArea({ id: 3, fk_motorista: 1, status: 'inativo' }),
  ]

  it('leva só ativo, do bairro do motorista, mesma faculdade e mesmo turno', () => {
    const estudantes = [
      umEstudante({ id: 1, nome: 'Certo' }),
      umEstudante({ id: 2, nome: 'Inativo', status: 'inativo' }),
      umEstudante({ id: 3, nome: 'Bairro de outro motorista', fk_area: 2 }),
      umEstudante({ id: 4, nome: 'Bairro inativo', fk_area: 3 }),
      umEstudante({ id: 5, nome: 'Sem bairro', fk_area: null }),
      umEstudante({ id: 6, nome: 'Outra faculdade', fk_instituicao: 2 }),
      umEstudante({ id: 7, nome: 'Outro turno', turno: 'manha' }),
    ]
    expect(passageirosDaRota(rota, areas, estudantes).map((e) => e.nome)).toEqual(['Certo'])
  })
})

describe('viagem do motorista num turno', () => {
  const uvv = umaInstituicao(1, 'UVV', [-20.35, -40.29])
  const multivix = umaInstituicao(2, 'Multivix', [-20.6, -40.42]) // mais perto de Guarapari
  const rotas = [
    umaRota({ id: 1, fk_instituicao: 1 }),
    umaRota({ id: 2, fk_instituicao: 2 }),
    umaRota({ id: 3, fk_instituicao: 1, turno: 'manha' }),
    umaRota({ id: 4, fk_instituicao: 1, fk_motorista: 2 }),
  ]
  const estudantes = [
    umEstudante({ id: 1, nome: 'Bruno', fk_instituicao: 1, horario_embarque: '17:30:00' }),
    umEstudante({ id: 2, nome: 'Ana', fk_instituicao: 2, horario_embarque: '17:10:00' }),
    umEstudante({ id: 3, nome: 'Caio', fk_instituicao: 1, horario_embarque: '17:10:00' }),
  ]
  const viagem = montarViagem(1, 'noite', rotas, [umaArea()], estudantes, [uvv, multivix])

  it('junta as rotas do motorista naquele turno e ignora as outras', () => {
    expect(viagem.rotas.map((r) => r.id)).toEqual([1, 2])
  })

  it('ordena os embarques por horário e, no empate, por nome', () => {
    expect(viagem.paradas.map((p) => p.estudante.nome)).toEqual(['Ana', 'Caio', 'Bruno'])
  })

  it('desembarca primeiro na faculdade mais perto e conta quem desce em cada uma', () => {
    expect(viagem.destinos.map((d) => [d.instituicao.nome, d.passageiros])).toEqual([
      ['Multivix', 1],
      ['UVV', 2],
    ])
  })

  it('não mostra faculdade sem passageiro', () => {
    const soAna = montarViagem(1, 'noite', rotas, [umaArea()], [estudantes[1]], [uvv, multivix])
    expect(soAna.destinos.map((d) => d.instituicao.nome)).toEqual(['Multivix'])
  })
})

describe('contas de tempo e distância', () => {
  it('soma minutos e vira o dia', () => {
    expect(somarMinutos('17:12', 47)).toBe('17:59')
    expect(somarMinutos('23:50', 20)).toBe('00:10')
  })

  it('calcula a distância Guarapari → Vitória em linha reta', () => {
    expect(distanciaKm([-20.6716, -40.4997], [-20.3155, -40.3128])).toBeCloseTo(44, 0)
  })
})
