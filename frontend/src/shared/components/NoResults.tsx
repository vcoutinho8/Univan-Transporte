import Botao from './Button.tsx'
import EstadoVazio from './EmptyState.tsx'
import type { NomeIcone } from './Icon.tsx'

interface Propriedades {
  /** "Nenhum passageiro encontrado" */
  titulo: string
  /** Filtros ativos, já em texto: ["Turno: Noite", 'Busca: "ana"']. */
  filtros: string[]
  /** Se informado, mostra o botão "Limpar filtros". */
  aoLimpar?: () => void
  /** Frase de ajuda; sem filtros ativos, explica que não há registros. */
  dica?: string
  /** Ícone da ilustração (padrão: lupa). */
  icone?: NomeIcone
}

/**
 * Aviso padrão de "nada encontrado": usado em todas as listas com filtro (passageiros, motoristas,
 * veículos, viagens, rotas). Mostra quais filtros causaram o resultado vazio e oferece limpar.
 */
export default function AvisoSemResultado({ titulo, filtros, aoLimpar, dica, icone = 'busca' }: Propriedades) {
  return (
    <EstadoVazio
      icone={icone}
      tom={filtros.length > 0 ? 'ambar' : 'laranja'}
      titulo={titulo}
      descricao={
        dica ??
        (filtros.length > 0
          ? 'Nenhum registro atende a todos os filtros abaixo. Tire algum filtro para ampliar a busca.'
          : 'Ainda não há registros aqui.')
      }
    >
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
    </EstadoVazio>
  )
}
