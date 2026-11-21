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
