import Botao from './Button.tsx'
import Icone from './Icon.tsx'

interface Propriedades {
  /** "Nenhum passageiro encontrado" */
  titulo: string
  /** Filtros ativos, já em texto: ["Turno: Noite", 'Busca: "ana"']. */
  filtros: string[]
  /** Se informado, mostra o botão "Limpar filtros". */
  aoLimpar?: () => void
  /** Frase de ajuda; sem filtros ativos, explica que não há registros. */
  dica?: string
}

/**
 * Aviso padrão de "nada encontrado": usado em todas as listas com filtro (passageiros, motoristas,
 * veículos, viagens, rotas). Mostra quais filtros causaram o resultado vazio e oferece limpar.
 */
export default function AvisoSemResultado({ titulo, filtros, aoLimpar, dica }: Propriedades) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-500 ring-1 ring-amber-100">
        <Icone nome="busca" className="h-6 w-6" />
      </span>
      <p className="mt-4 font-bold text-marinho">{titulo}</p>
      <p className="mt-1 max-w-md text-sm text-slate-500">
        {dica ??
          (filtros.length > 0
            ? 'Nenhum registro atende a todos os filtros abaixo. Tire algum filtro para ampliar a busca.'
            : 'Ainda não há registros aqui.')}
      </p>
      {filtros.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {filtros.map((f) => (
            <span key={f} className="rounded-full bg-fundo px-2.5 py-1 text-xs font-semibold text-slate-600">
              {f}
            </span>
          ))}
        </div>
      )}
      {aoLimpar && filtros.length > 0 && (
        <Botao variante="secundario" className="mt-4" onClick={aoLimpar}>
          Limpar filtros
        </Botao>
      )}
    </div>
  )
}
