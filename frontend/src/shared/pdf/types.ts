/** Conteúdo de um relatório em PDF. Cada relatório só monta estes dados; o layout é único. */

export interface ColunaPdf {
  titulo: string
  /** Porcentagem da largura da página; a soma das colunas deve dar 100. */
  largura: number
  alinhar?: 'left' | 'right' | 'center'
}

/** Uma linha da tabela, ou um título de grupo ocupando a linha toda. */
export type LinhaPdf = (string | number | null)[] | { grupo: string }

export interface DadosPdf {
  titulo: string
  /** Período do relatório, já formatado ("01/11/2026 a 21/11/2026"). */
  periodo: string
  /** Filtros usados ("Turno: Noite"). Vazio = o bloco de filtros não aparece. */
  filtros: { rotulo: string; valor: string }[]
  /** Indicadores em cartões no topo (Passageiros, Presenças...). */
  indicadores: { rotulo: string; valor: string }[]
  colunas: ColunaPdf[]
  linhas: LinhaPdf[]
  /** "21/11/2026 às 13:20" */
  geradoEm: string
  /** URL da logo (preenchida por criarPdf). */
  logo?: string
}
