import { dataIso, somarDias } from '../../shared/utils/formatar.ts'
import { inicioDaSemana } from '../viagem/semana.ts'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/** "2026-11-21" → "2026-11-01". */
export const inicioDoMes = (iso: string) => `${iso.slice(0, 7)}-01`

/** Primeiro dia do mês seguinte (+1) ou anterior (-1). */
export function somarMeses(iso: string, meses: number): string {
  const [ano, mes] = iso.split('-').map(Number)
  return dataIso(new Date(ano, mes - 1 + meses, 1))
}

/** "2026-11-01" → "Novembro de 2026". */
export function nomeDoMes(iso: string): string {
  const [ano, mes] = iso.split('-').map(Number)
  return `${MESES[mes - 1]} de ${ano}`
}

/**
 * As 6 semanas (42 dias, de segunda a domingo) que aparecem no calendário do mês, incluindo o
 * fim do mês anterior e o começo do próximo para completar as linhas.
 */
export function diasDoCalendario(mes: string): string[] {
  const primeiro = inicioDaSemana(inicioDoMes(mes))
  return Array.from({ length: 42 }, (_, i) => somarDias(primeiro, i))
}

/** Seleção de período por dois cliques: o 1º marca o início; o 2º, o fim (ou recomeça). */
export function proximaSelecao(atual: { inicio: string; fim: string | null } | null, dia: string) {
  if (!atual || atual.fim !== null) return { inicio: dia, fim: null }
  return dia < atual.inicio ? { inicio: dia, fim: atual.inicio } : { inicio: atual.inicio, fim: dia }
}

/** Quantos dias corridos vão de início a fim (inclusive). */
export function diasNoPeriodo(inicio: string, fim: string): number {
  return Math.round((Date.parse(fim) - Date.parse(inicio)) / 86_400_000) + 1
}

/** Dois dias em qualquer ordem → período do menor ao maior (arrastar para trás também vale). */
export function intervalo(a: string, b: string): { inicio: string; fim: string } {
  return a <= b ? { inicio: a, fim: b } : { inicio: b, fim: a }
}

/**
 * Posição do dia na faixa selecionada, para desenhar a seleção como uma faixa contínua:
 * arredonda no começo e no fim do período e também nas quebras de linha (segunda e domingo).
 */
export function posicaoNaFaixa(dia: string, faixa: { inicio: string; fim: string } | null) {
  if (!faixa || dia < faixa.inicio || dia > faixa.fim) return null
  const [ano, mes, d] = dia.split('-').map(Number)
  const semana = new Date(ano, mes - 1, d).getDay() // 0 = domingo
  return {
    abreLinha: dia === faixa.inicio || semana === 1,
    fechaLinha: dia === faixa.fim || semana === 0,
    ponta: dia === faixa.inicio || dia === faixa.fim,
  }
}

/** Dias corridos de hoje até a data (0 = hoje). */
export function diasAte(iso: string, hoje: string): number {
  return Math.round((Date.parse(iso) - Date.parse(hoje)) / 86_400_000)
}
