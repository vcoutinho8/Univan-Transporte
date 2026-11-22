/** Sessão do usuário: token e dados de quem entrou, guardados no navegador (localStorage). */

export type Perfil = 'admin' | 'auxiliar' | 'motorista' | 'univan'

export interface UsuarioSessao {
  id: number
  nome: string
  login: string
  perfil: Perfil
  fk_empresa: number
  fk_motorista: number | null
  /** Entrou com a senha padrão (123456): precisa criar a dele antes de usar o sistema. */
  trocar_senha?: boolean
}

export interface Sessao {
  token: string
  usuario: UsuarioSessao
  /** Momento (ms) em que a sessão expira; depois disso o usuário entra de novo. */
  expiraEm: number
  /** Assinatura do app em atraso (só o gestor recebe): a faixa de aviso no topo. */
  avisoAssinatura?: string | null
}

const CHAVE = 'univan.sessao'
/** Disparado quando a sessão muda (entrar, sair ou expirar), para a tela reagir. */
export const EVENTO_SESSAO = 'univan:sessao'

export function lerSessao(): Sessao | null {
  try {
    const sessao = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as Sessao | null
    if (!sessao?.token || !sessao.usuario || sessao.expiraEm < Date.now()) return null
    return sessao
  } catch {
    return null
  }
}

export function gravarSessao(sessao: Sessao | null): void {
  if (sessao) localStorage.setItem(CHAVE, JSON.stringify(sessao))
  else localStorage.removeItem(CHAVE)
  window.dispatchEvent(new Event(EVENTO_SESSAO))
}

/** Duas iniciais para o avatar ("Paula Auxiliar" → "PA"). */
export function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (partes[0][0] + ultima).toUpperCase()
}
