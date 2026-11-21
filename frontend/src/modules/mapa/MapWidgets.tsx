/** Pecinhas de interface repetidas nos painéis das abas do mapa. */

export function BotaoLista(props: { ativo: boolean; cor: string; titulo: string; detalhe: string; aoClicar: () => void }) {
  return (
    <button
      onClick={props.aoClicar}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-all duration-200 ${
        props.ativo ? 'bg-marinho text-white shadow-md shadow-marinho/20' : 'hover:translate-x-0.5 hover:bg-fundo'
      }`}
    >
      <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/70" style={{ background: props.cor }} />
      <span className="min-w-0">
        <span className={`block truncate text-sm font-bold ${props.ativo ? 'text-white' : 'text-marinho'}`}>{props.titulo}</span>
        <span className={`block truncate text-xs ${props.ativo ? 'text-white/70' : 'text-slate-500'}`}>{props.detalhe}</span>
      </span>
    </button>
  )
}

export function Alternador({ rotulo, ligado, aoMudar }: { rotulo: string; ligado: boolean; aoMudar: (valor: boolean) => void }) {
  return (
    // `relative`: a caixa escondida (sr-only, posição absoluta) fica presa ao rótulo; sem isso ela
    // "escapava" do painel com rolagem e esticava a página.
    <label className="relative flex cursor-pointer items-center justify-between gap-3 font-semibold text-marinho">
      {rotulo}
      <input type="checkbox" className="peer sr-only" checked={ligado} onChange={(e) => aoMudar(e.target.checked)} />
      <span className="relative h-5 w-9 shrink-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-laranja peer-focus-visible:ring-2 peer-focus-visible:ring-laranja/40 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
    </label>
  )
}

export function NumeroResumo({ rotulo, valor, alerta = false }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${alerta ? 'bg-amber-50' : 'bg-fundo'}`}>
      <p className={`text-2xl font-extrabold tabular-nums ${alerta ? 'text-amber-700' : 'text-marinho'}`}>{valor}</p>
      <p className={`text-xs font-semibold ${alerta ? 'text-amber-700' : 'text-slate-500'}`}>{rotulo}</p>
    </div>
  )
}

/** Abas em "pílula" (turno, modo de desenho...). */
export function Segmentos<T extends string>({
  opcoes,
  atual,
  aoMudar,
}: {
  opcoes: { valor: T; rotulo: string }[]
  atual: T
  aoMudar: (valor: T) => void
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-fundo p-1 text-xs font-bold">
      {opcoes.map((opcao) => (
        <button
          key={opcao.valor}
          type="button"
          onClick={() => aoMudar(opcao.valor)}
          className={`flex-1 rounded-lg px-2 py-1.5 transition-all ${
            opcao.valor === atual ? 'bg-white text-laranja shadow-sm' : 'text-slate-500 hover:text-marinho'
          }`}
        >
          {opcao.rotulo}
        </button>
      ))}
    </div>
  )
}
