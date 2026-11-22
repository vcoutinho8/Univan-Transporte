/** Situação da CNH de um motorista, só para destacar na tela (quem decide é a API). */
export type SituacaoCnh = 'valida' | 'vencendo' | 'vencida'

/** Quantos dias antes do vencimento a tela começa a avisar. */
export const DIAS_AVISO_CNH = 60

const MS_POR_DIA = 86_400_000

/**
 * Dias de hoje até a validade (AAAA-MM-DD). Zero = vence hoje; negativo = já venceu.
 * Compara só datas, no calendário local, para a hora do dia não mudar o resultado.
 */
export function diasParaVencer(validade: string, hoje: Date = new Date()): number {
  const [ano, mes, dia] = validade.split('-').map(Number)
  const alvo = Date.UTC(ano, mes - 1, dia)
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.round((alvo - base) / MS_POR_DIA)
}

/** Igual à regra da API: a CNH vale até o último dia da validade, inclusive. */
export function situacaoCnh(validade: string, hoje: Date = new Date()): SituacaoCnh {
  const dias = diasParaVencer(validade, hoje)
  if (dias < 0) return 'vencida'
  return dias <= DIAS_AVISO_CNH ? 'vencendo' : 'valida'
}

function repetido(numero: string): boolean {
  return numero.split('').every((c) => c === numero[0])
}

/** Confere os dois dígitos verificadores do CPF (módulo 11). */
export function cpfValido(cpfEntrada: string): boolean {
  const cpf = cpfEntrada.replace(/\D/g, '')
  if (cpf.length !== 11 || repetido(cpf)) return false

  for (const tamanho of [9, 10]) {
    let soma = 0
    for (let i = 0; i < tamanho; i++) {
      soma += Number(cpf[i]) * (tamanho + 1 - i)
    }
    const resto = ((soma * 10) % 11) % 10
    if (resto !== Number(cpf[tamanho])) return false
  }
  return true
}

/**
 * Confere os dois dígitos verificadores da CNH (número de registro, 11 dígitos).
 * Regra idêntica à do backend (app.shared.documentos.cnh_valida).
 */
export function cnhValida(cnhEntrada: string): boolean {
  const cnh = cnhEntrada.replace(/\D/g, '')
  if (cnh.length !== 11 || repetido(cnh)) return false

  let primeiro = 0
  for (let i = 0; i < 9; i++) {
    primeiro += Number(cnh[i]) * (9 - i)
  }
  primeiro = primeiro % 11
  let desconto = 0
  if (primeiro >= 10) {
    primeiro = 0
    desconto = 2
  }

  let segundo = 0
  for (let i = 0; i < 9; i++) {
    segundo += Number(cnh[i]) * (i + 1)
  }
  segundo = (segundo % 11) - desconto
  if (segundo < 0) {
    segundo += 11
  }
  if (segundo >= 10) {
    segundo = 0
  }

  return cnh[9] === String(primeiro) && cnh[10] === String(segundo)
}
