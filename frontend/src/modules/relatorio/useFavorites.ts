import { useCallback, useEffect, useState } from 'react'

/**
 * Relatórios favoritos. Enquanto o login não existe (RF1), ficam guardados neste navegador
 * (localStorage). Com usuários, basta trocar `ler`/`gravar` por chamadas à API.
 */
export const CHAVE_FAVORITOS = 'univan.relatorios.favoritos'
const EVENTO = 'univan:favoritos'

export function lerFavoritos(): string[] {
  try {
    const valor = JSON.parse(localStorage.getItem(CHAVE_FAVORITOS) ?? '[]')
    return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function gravar(ids: string[]) {
  localStorage.setItem(CHAVE_FAVORITOS, JSON.stringify(ids))
  // Avisa as outras partes da tela (catálogo e página do relatório) que a lista mudou.
  window.dispatchEvent(new Event(EVENTO))
}

export function useFavoritos() {
  const [favoritos, setFavoritos] = useState<string[]>(lerFavoritos)

  useEffect(() => {
    const atualizar = () => setFavoritos(lerFavoritos())
    window.addEventListener(EVENTO, atualizar)
    window.addEventListener('storage', atualizar) // outra aba
    return () => {
      window.removeEventListener(EVENTO, atualizar)
      window.removeEventListener('storage', atualizar)
    }
  }, [])

  const alternar = useCallback((id: string) => {
    const atuais = lerFavoritos()
    gravar(atuais.includes(id) ? atuais.filter((f) => f !== id) : [...atuais, id])
  }, [])

  return { favoritos, ehFavorito: (id: string) => favoritos.includes(id), alternar }
}
