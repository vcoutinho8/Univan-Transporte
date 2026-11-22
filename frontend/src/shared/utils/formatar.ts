/** Formatação de documentos, telefones e valores para exibir na tela (a API guarda só números). */

export const soDigitos = (valor: string) => valor.replace(/\D/g, '')

/** "11122233301" → "111.222.333-01" (também serve como máscara enquanto digita). */
export function formatarCpf(valor: string): string {
  const d = soDigitos(valor).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
}

/** "27998880001" → "(27) 99888-0001"; fixo com 10 dígitos → "(27) 3361-1001". */
export function formatarCelular(valor: string): string {
  const d = soDigitos(valor).slice(0, 11)
  if (d.length <= 2) return d ? `(${d}` : ''
  const ddd = d.slice(0, 2)
  const numero = d.slice(2)
  const corte = d.length === 11 ? 5 : 4
  return numero.length > corte ? `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}` : `(${ddd}) ${numero}`
}

/** "29200180" → "29200-180". */
export function formatarCep(valor: string): string {
  const d = soDigitos(valor).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const formatarMoeda = (valor: number) => MOEDA.format(valor)

/** "2028-03-15" → "15/03/2028" (sem passar por Date, para o fuso não mudar o dia). */
export function formatarData(valor: string | null): string {
  const partes = valor?.slice(0, 10).split('-')
  return partes?.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : '—'
}

/** "17:40:00" → "17:40". */
export const formatarHorario = (valor: string | null) => (valor ? valor.slice(0, 5) : '—')

/** Data local no formato da API: AAAA-MM-DD (sem passar por UTC, que muda o dia à noite). */
export function dataIso(data = new Date()): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${data.getFullYear()}-${mes}-${dia}`
}

/** Soma dias a uma data AAAA-MM-DD ("2026-11-30", 1 → "2026-12-01"). */
export function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return dataIso(new Date(ano, mes - 1, dia + dias))
}

const DIA_DA_SEMANA = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' })

/** "2026-11-23" → "segunda-feira". */
export function diaDaSemana(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return DIA_DA_SEMANA.format(new Date(ano, mes - 1, dia))
}

/** Hora de um momento da API: "2026-11-23T07:05:00" → "07:05". */
export const formatarHoraDe = (momento: string | null) => (momento ? momento.slice(11, 16) : '—')

/** Primeiro nome + inicial do último ("Ana Beatriz Souza" → "Ana S."), para etiquetas no mapa. */
export function nomeCurto(nome: string, apelido?: string | null): string {
  if (apelido) return apelido
  const partes = nome.trim().split(/\s+/)
  return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1][0]}.` : partes[0]
}

/** "Ana Beatriz Souza" → "AS". */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  const primeira = partes[0]?.[0] ?? ''
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (primeira + ultima).toUpperCase()
}

/** Máscara de Real enquanto digita: os dígitos são os centavos ("12345" → 123,45; vazio → null). */
export function lerMoeda(texto: string): number | null {
  const d = soDigitos(texto).replace(/^0+/, '').slice(0, 9)
  return d ? Number(d) / 100 : null
}

/** "11222333000181" → "11.222.333/0001-81" (também serve como máscara enquanto digita). */
export function formatarCnpj(valor: string): string {
  const d = soDigitos(valor).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

/** Confere os dígitos verificadores do CNPJ (mesma conta da API). */
export function cnpjValido(valor: string): boolean {
  const d = soDigitos(valor)
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  for (const tamanho of [12, 13]) {
    let soma = 0
    for (let i = 0; i < tamanho; i++) soma += Number(d[tamanho - 1 - i]) * (2 + (i % 8))
    const digito = 11 - (soma % 11)
    if ((digito >= 10 ? 0 : digito) !== Number(d[tamanho])) return false
  }
  return true
}
