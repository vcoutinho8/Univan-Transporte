import { useEffect, useState } from 'react'

import { requisitar } from '../services/api.ts'
import { soDigitos } from '../utils/formatar.ts'

interface Verificacao {
  cpf_valido: boolean | null
  cpf_em_uso: string | null
  celular_em_uso: string | null
}

/**
 * Confere CPF e celular enquanto a pessoa digita (válido e não repetido em outro cadastro), para
 * avisar antes de salvar. `tabela` e `id`: o registro sendo editado não conta como repetido.
 */
export function useVerificacaoCadastro(cpf: string, celular: string, tabela: 'estudante' | 'motorista', id?: number) {
  const [resultado, setResultado] = useState<Verificacao | null>(null)
  const cpfDigitos = soDigitos(cpf)
  const celularDigitos = soDigitos(celular)

  useEffect(() => {
    if (cpfDigitos.length !== 11 && celularDigitos.length < 10) return setResultado(null)
    const espera = window.setTimeout(() => {
      const parametros = { cpf: cpfDigitos, celular: celularDigitos, tabela, id }
      requisitar<Verificacao>('/cadastros/verificar', { parametros })
        .then(setResultado)
        .catch(() => setResultado(null))
    }, 400)
    return () => window.clearTimeout(espera)
  }, [cpfDigitos, celularDigitos, tabela, id])

  return {
    avisoCpf:
      cpfDigitos.length !== 11 || !resultado
        ? null
        : resultado.cpf_valido === false
          ? 'CPF inválido: confira os números.'
          : resultado.cpf_em_uso
            ? `Este CPF já está cadastrado como ${resultado.cpf_em_uso}.`
            : null,
    avisoCelular:
      celularDigitos.length >= 10 && resultado?.celular_em_uso ? `Este celular já está cadastrado para um ${resultado.celular_em_uso}.` : null,
  }
}
