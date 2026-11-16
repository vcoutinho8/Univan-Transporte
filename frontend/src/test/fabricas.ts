/** Dados de exemplo para os testes, no formato que a API devolve. */
import type { Area, Coordenada } from '../modules/area/types.ts'
import type { Estudante } from '../modules/estudante/types.ts'
import type { Instituicao } from '../modules/instituicao/types.ts'
import type { Rota } from '../modules/rota/types.ts'

export function umEstudante(dados: Partial<Estudante> & { ponto?: Coordenada | null } = {}): Estudante {
  const { ponto = [-20.669, -40.4955], ...resto } = dados
  return {
    id: 1,
    nome: 'Larissa Coutinho',
    apelido: null,
    cpf: '12345678909',
    celular: '27998880021',
    email: null,
    fk_instituicao: 1,
    curso: 'Medicina',
    turno: 'noite',
    horario_embarque: '17:20:00',
    valor_mensal: 550,
    dia_vencimento: 10,
    status: 'ativo',
    fk_area: 1,
    instituicao: { id: 1, nome: 'UVV' },
    area: { id: 1, nome: 'Centro' },
    endereco: {
      id: 1,
      cep: '29200180',
      logradouro: 'Rua Getúlio Vargas',
      numero: '310',
      complemento: null,
      bairro: 'Centro',
      cidade: 'Guarapari',
      estado: 'ES',
      latitude: ponto?.[0] ?? null,
      longitude: ponto?.[1] ?? null,
    },
    ...resto,
  }
}

/** Quadrado simples ao redor do centro de Guarapari. */
export const QUADRADO_CENTRO: Coordenada[] = [
  [-20.66, -40.51],
  [-20.66, -40.49],
  [-20.68, -40.49],
  [-20.68, -40.51],
]

export function umaArea(dados: Partial<Area> = {}): Area {
  return {
    id: 1,
    nome: 'Centro',
    status: 'ativo',
    fk_motorista: 1,
    motorista: { id: 1, nome: 'Carlos' },
    poligono: QUADRADO_CENTRO,
    ...dados,
  }
}

export function umaRota(dados: Partial<Rota> = {}): Rota {
  return {
    id: 1,
    nome: 'Centro → UVV (noite)',
    fk_motorista: 1,
    fk_instituicao: 1,
    turno: 'noite',
    horario_ida: '17:30:00',
    horario_volta: '22:30:00',
    status: 'ativo',
    motorista: { id: 1, nome: 'Carlos' },
    instituicao: { id: 1, nome: 'UVV' },
    dias: [1, 2, 3, 4, 5],
    total_passageiros: 0,
    ...dados,
  }
}

export function umaInstituicao(id: number, nome: string, ponto: Coordenada): Instituicao {
  return {
    id,
    nome,
    endereco: {
      id: 100 + id,
      cep: '29102920',
      logradouro: 'Av. Comissário José Dantas de Melo',
      numero: null,
      complemento: null,
      bairro: 'Boa Vista',
      cidade: 'Vila Velha',
      estado: 'ES',
      latitude: ponto[0],
      longitude: ponto[1],
    },
  }
}
