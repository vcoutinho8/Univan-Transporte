import { useCallback, useEffect, useState } from 'react'

import { requisitar } from '../services/api.ts'
import { EVENTO_SESSAO, gravarSessao, lerSessao, type Sessao, type UsuarioSessao } from './sessao.ts'

interface RespostaLogin {
  token: string
  expira_em_minutos: number
  usuario: UsuarioSessao
  aviso_assinatura?: string | null
}

/** Sessão atual e as ações de entrar e sair. Todas as telas enxergam a mesma sessão. */
export function useSessao() {
  const [sessao, setSessao] = useState<Sessao | null>(lerSessao)

  useEffect(() => {
    const atualizar = () => setSessao(lerSessao())
    window.addEventListener(EVENTO_SESSAO, atualizar)
    window.addEventListener('storage', atualizar) // outra aba entrou ou saiu
    // Expira sozinha: confere a cada minuto.
    const relogio = window.setInterval(atualizar, 60_000)
    return () => {
      window.removeEventListener(EVENTO_SESSAO, atualizar)
      window.removeEventListener('storage', atualizar)
      window.clearInterval(relogio)
    }
  }, [])

  const entrar = useCallback(async (usuario: string, senha: string) => {
    const resposta = await requisitar<RespostaLogin>('/auth/login', { metodo: 'POST', corpo: { usuario, senha } })
    const nova: Sessao = {
      token: resposta.token,
      usuario: resposta.usuario,
      expiraEm: Date.now() + resposta.expira_em_minutos * 60_000,
      avisoAssinatura: resposta.aviso_assinatura ?? null,
    }
    gravarSessao(nova)
    return nova
  }, [])

  const sair = useCallback(() => gravarSessao(null), [])

  /** Atualiza os dados de quem está logado (ex.: nome trocado, senha padrão já trocada). */
  const atualizarUsuario = useCallback((parcial: Partial<UsuarioSessao>) => {
    const atual = lerSessao()
    if (atual) gravarSessao({ ...atual, usuario: { ...atual.usuario, ...parcial } })
  }, [])

  return { sessao, usuario: sessao?.usuario ?? null, entrar, sair, atualizarUsuario }
}
