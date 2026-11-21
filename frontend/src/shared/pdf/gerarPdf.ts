import { createElement } from 'react'

import type { DadosPdf } from './types.ts'

/**
 * Gera o PDF no próprio navegador (biblioteca @react-pdf/renderer).
 *
 * A biblioteca é grande, então só é carregada no primeiro PDF pedido (import dinâmico): quem
 * nunca gera um PDF não baixa nada a mais.
 */
export async function criarPdf(dados: DadosPdf): Promise<Blob> {
  const [{ pdf }, { default: DocumentoRelatorio }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./ReportDocument.tsx'),
  ])
  const documento = createElement(DocumentoRelatorio, { dados: { logo: await carregarLogo(), ...dados } })
  // O tipo de `pdf()` espera o elemento <Document>; o componente devolve exatamente isso.
  return pdf(documento as Parameters<typeof pdf>[0]).toBlob()
}

/**
 * Logo como data URL: o gerador não depende de buscar a imagem por conta própria (se a busca
 * falhar, o PDF sai sem logo em vez de dar erro).
 */
async function carregarLogo(): Promise<string | undefined> {
  try {
    const resposta = await fetch('/univan-logo.png')
    if (!resposta.ok) return undefined
    const imagem = await resposta.blob()
    return await new Promise<string>((resolver, rejeitar) => {
      const leitor = new FileReader()
      leitor.onload = () => resolver(String(leitor.result))
      leitor.onerror = rejeitar
      leitor.readAsDataURL(imagem)
    })
  } catch {
    return undefined
  }
}

/** Baixa um arquivo já gerado com o nome informado. */
export function baixarArquivo(arquivo: Blob, nome: string): void {
  const url = URL.createObjectURL(arquivo)
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
