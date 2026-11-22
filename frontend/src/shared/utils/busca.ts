const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const soLetrasENumeros = (texto: string) => normalizar(texto).replace(/[^a-z0-9]/g, '')

/**
 * A busca das listas: sem ligar para acento, maiúscula nem máscara. "123.456.789-01" acha o CPF
 * guardado como 12345678901, "abc1d23" acha a placa ABC-1D23 e "joao" acha "João".
 */
export function combinaBusca(campos: (string | null | undefined)[], busca: string): boolean {
  const termo = normalizar(busca.trim())
  if (!termo) return true
  const preenchidos = campos.filter((c): c is string => Boolean(c))
  if (normalizar(preenchidos.join(' | ')).includes(termo)) return true
  const compacto = soLetrasENumeros(termo)
  return compacto.length >= 3 && preenchidos.some((c) => soLetrasENumeros(c).includes(compacto))
}
