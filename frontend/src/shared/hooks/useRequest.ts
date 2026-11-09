import { useCallback, useEffect, useState } from 'react'

import { ErroApi } from '../services/api.ts'

/** Executa uma busca na API e expõe dados, carregamento e erro (já em português). */
export function useRequisicao<T>(buscar: () => Promise<T>, dependencias: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // A busca só é refeita quando alguma das `dependencias` muda.
  const executar = useCallback(buscar, dependencias)

  const recarregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      setDados(await executar())
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado.')
    } finally {
      setCarregando(false)
    }
  }, [executar])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  return { dados, carregando, erro, recarregar }
}
