import type { ReactNode } from 'react'

interface Propriedades {
  titulo?: string
  acoes?: ReactNode
  children: ReactNode
  className?: string
  /** Remove o espaçamento interno (útil para tabelas que vão até a borda). */
  semEspaco?: boolean
  /**
   * Em telas grandes, ocupa a altura que sobra abaixo do título da página: o conteúdo (ex.: a
   * tabela) rola por dentro e o rodapé (paginação) fica sempre visível, sem rolar a página.
   */
  preencherTela?: boolean
}

/** Cartão branco arredondado: o "bloco" básico de todas as telas do painel. */
export default function Cartao({ titulo, acoes, children, className = '', semEspaco = false, preencherTela = false }: Propriedades) {
  return (
    <section
      className={`rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 ${
        preencherTela ? 'flex flex-col lg:h-[calc(100dvh-8.5rem)] lg:min-h-[24rem]' : ''
      } ${className}`}
    >
      {(titulo || acoes) && (
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
          {titulo && <h2 className="text-base font-bold text-marinho">{titulo}</h2>}
          {acoes}
        </header>
      )}
      <div className={`${semEspaco ? '' : 'px-5 pb-5'} ${preencherTela ? 'flex min-h-0 flex-1 flex-col' : ''}`}>{children}</div>
    </section>
  )
}
