import { somarDias } from '../../shared/utils/formatar.ts'

/** Segunda-feira da semana de uma data AAAA-MM-DD. */
export function inicioDaSemana(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const diaSemana = new Date(ano, mes - 1, dia).getDay() // 0 = domingo
  return somarDias(iso, -((diaSemana + 6) % 7))
}

/** Os 7 dias (segunda a domingo) da semana da data. */
export function diasDaSemana(iso: string): string[] {
  const segunda = inicioDaSemana(iso)
  return Array.from({ length: 7 }, (_, i) => somarDias(segunda, i))
}

const CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "2026-11-23" → { semana: 'Seg', dia: 23, mes: 'nov', fimDeSemana: false }. */
export function partesDoDia(iso: string) {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const diaSemana = new Date(ano, mes - 1, dia).getDay()
  return { semana: CURTOS[diaSemana], dia, mes: MESES[mes - 1], fimDeSemana: diaSemana === 0 || diaSemana === 6 }
}

/** "23 a 29 de nov. de 2026" ou "30 de nov. a 6 de dez. de 2026". */
export function descreverSemana(iso: string): string {
  const dias = diasDaSemana(iso)
  const a = partesDoDia(dias[0])
  const b = partesDoDia(dias[6])
  const ano = dias[6].slice(0, 4)
  return a.mes === b.mes ? `${a.dia} a ${b.dia} de ${b.mes}. de ${ano}` : `${a.dia} de ${a.mes}. a ${b.dia} de ${b.mes}. de ${ano}`
}
