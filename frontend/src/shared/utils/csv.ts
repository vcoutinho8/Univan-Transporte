/**
 * Exportação de tabelas para CSV no formato que o Excel em português abre direto:
 * separador ";" e BOM UTF-8 (sem o BOM, os acentos aparecem quebrados).
 */

type Celula = string | number | null | undefined

function escapar(valor: Celula): string {
  if (valor === null || valor === undefined) return ''
  const texto = String(valor)
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

export function montarCsv(cabecalho: string[], linhas: Celula[][]): string {
  return [cabecalho, ...linhas].map((linha) => linha.map(escapar).join(';')).join('\r\n')
}

/** Baixa o CSV no navegador com o nome informado. */
export function baixarCsv(nomeArquivo: string, cabecalho: string[], linhas: Celula[][]): void {
  const conteudo = new Blob(['﻿' + montarCsv(cabecalho, linhas)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(conteudo)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  link.click()
  URL.revokeObjectURL(url)
}
