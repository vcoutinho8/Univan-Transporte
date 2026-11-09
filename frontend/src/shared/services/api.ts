import type { RespostaErroApi } from '../types/api.ts'

/** Comunicação centralizada com a API. Todos os services usam `requisitar`. */
const URL_BASE = import.meta.env.VITE_API_URL ?? '/api'

export class ErroApi extends Error {
  status: number
  erros: RespostaErroApi['erros']

  constructor(status: number, corpo: RespostaErroApi) {
    super(corpo.mensagem)
    this.status = status
    this.erros = corpo.erros
  }

  /** Mensagem pronta para exibir, incluindo os erros de cada campo. */
  get mensagemCompleta(): string {
    if (!this.erros?.length) return this.message
    return [this.message, ...this.erros.map((e) => `${e.campo}: ${e.mensagem}`)].join('\n')
  }
}

type Parametros = Record<string, string | number | undefined | null>

export async function requisitar<T>(
  caminho: string,
  opcoes: { metodo?: string; corpo?: unknown; parametros?: Parametros } = {},
): Promise<T> {
  const url = new URL(URL_BASE + caminho, window.location.origin)
  for (const [chave, valor] of Object.entries(opcoes.parametros ?? {})) {
    if (valor !== undefined && valor !== null && valor !== '') url.searchParams.set(chave, String(valor))
  }

  let resposta: Response
  try {
    resposta = await fetch(url, {
      method: opcoes.metodo ?? 'GET',
      headers: opcoes.corpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
    })
  } catch {
    throw new ErroApi(0, { mensagem: 'Não foi possível conectar ao servidor. Verifique se a API está rodando.' })
  }

  const corpo = resposta.status === 204 ? null : await resposta.json().catch(() => null)
  if (!resposta.ok) {
    throw new ErroApi(resposta.status, corpo ?? { mensagem: 'Erro inesperado no servidor.' })
  }
  return corpo as T
}
