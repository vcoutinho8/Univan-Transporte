import { useRef } from 'react'

import Icone from '../../shared/components/Icon.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { dataIso, somarDias } from '../../shared/utils/formatar.ts'
import { descreverSemana, diasDaSemana, partesDoDia } from './semana.ts'
import { servicoViagem } from './tripService.ts'
import type { DiaDoCalendario } from './types.ts'

interface Propriedades {
  data: string
  aoEscolher: (data: string) => void
  /** Muda quando as viagens mudam (ex.: depois de gerar), para recarregar as contagens. */
  versao: number
}

/** Rótulo pequeno embaixo do número do dia: feriado, sem rota, quantidade de viagens. */
function situacaoDoDia(
  dia: DiaDoCalendario | undefined,
  futuro: boolean,
): { texto: string; tom: 'feriado' | 'vazio' | 'ok' | 'pendente' } {
  if (!dia) return { texto: '', tom: 'vazio' }
  if (dia.feriado_geral) return { texto: 'Feriado', tom: 'feriado' }
  if (dia.viagens > 0) return { texto: `${dia.viagens} viag.`, tom: 'ok' }
  if (dia.rotas === 0) return { texto: 'Sem rota', tom: 'vazio' }
  if (futuro) return { texto: 'Futura', tom: 'vazio' }
  return { texto: 'Sincronizando', tom: 'pendente' }
}

/**
 * Faixa da semana (segunda a domingo): cada dia mostra o dia da semana por extenso curto, o número
 * e a situação (viagens geradas, feriado, sem rota). Setas trocam de semana; o calendário escolhe
 * qualquer data.
 */
export default function FaixaSemana({ data, aoEscolher, versao }: Propriedades) {
  const dias = diasDaSemana(data)
  const hoje = dataIso()
  const limiteGeracao = diasDaSemana(hoje)[6]
  const calendario = useRequisicao(() => servicoViagem.calendario(dias[0], dias[6]), [dias[0], versao])
  const porData = new Map((calendario.dados ?? []).map((d) => [d.data, d]))
  const seletor = useRef<HTMLInputElement>(null)

  const botaoSeta = 'grid h-10 w-10 shrink-0 place-items-center rounded-xl text-marinho transition-colors hover:bg-fundo'

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-500">
          Semana de <span className="text-marinho">{descreverSemana(data)}</span>
        </p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => aoEscolher(somarDias(data, -7))} aria-label="Semana anterior" className="grid h-9 w-9 place-items-center rounded-lg text-marinho hover:bg-fundo sm:hidden">
            <Icone nome="seta" className="h-4 w-4 rotate-180" />
          </button>
          <button type="button" onClick={() => aoEscolher(somarDias(data, 7))} aria-label="Próxima semana" className="grid h-9 w-9 place-items-center rounded-lg text-marinho hover:bg-fundo sm:hidden">
            <Icone nome="seta" className="h-4 w-4" />
          </button>
          {data !== hoje && (
            <button
              type="button"
              onClick={() => aoEscolher(hoje)}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-laranja hover:bg-laranja/10"
            >
              Hoje
            </button>
          )}
          <label className="relative grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-marinho hover:bg-fundo" title="Escolher data">
            <Icone nome="viagem" className="h-4 w-4" />
            <span className="sr-only">Escolher data</span>
            <input
              ref={seletor}
              type="date"
              value={data}
              onChange={(e) => e.target.value && aoEscolher(e.target.value)}
              onClick={() => seletor.current?.showPicker?.()}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>
      </div>

      <div className="flex items-stretch gap-1 sm:gap-2">
        <button type="button" onClick={() => aoEscolher(somarDias(data, -7))} aria-label="Semana anterior" className={`${botaoSeta} hidden sm:grid`}>
          <Icone nome="seta" className="h-4 w-4 rotate-180" />
        </button>
        <div className="grid flex-1 grid-cols-7 gap-1 sm:gap-2">
          {dias.map((dia) => {
            const partes = partesDoDia(dia)
            const situacao = situacaoDoDia(porData.get(dia), dia > limiteGeracao)
            const ativo = dia === data
            const feriados = porData.get(dia)?.feriados ?? []
            return (
              <button
                key={dia}
                type="button"
                onClick={() => aoEscolher(dia)}
                aria-pressed={ativo}
                title={feriados.join(' · ') || undefined}
                className={`relative flex flex-col items-center rounded-2xl px-0.5 py-2 transition-all sm:py-2.5 ${
                  ativo
                    ? 'bg-marinho text-white shadow-md shadow-marinho/20'
                    : partes.fimDeSemana || situacao.tom === 'feriado'
                      ? 'bg-fundo/70 text-slate-400 hover:bg-fundo'
                      : 'bg-white text-marinho ring-1 ring-slate-200 hover:ring-laranja/60'
                }`}
              >
                <span className={`text-[11px] font-bold uppercase sm:text-xs ${ativo ? 'text-white/80' : ''}`}>{partes.semana}</span>
                <span className="text-lg leading-tight font-extrabold tabular-nums sm:text-xl">{partes.dia}</span>
                {/* Celular: bolinha colorida. Telas maiores: texto. */}
                <span
                  className={`mt-1 h-1.5 w-1.5 rounded-full sm:hidden ${
                    ativo
                      ? 'bg-white/80'
                      : { feriado: 'bg-red-500', ok: 'bg-emerald-500', pendente: 'bg-laranja', vazio: 'bg-transparent' }[situacao.tom]
                  }`}
                />
                <span
                  className={`mt-0.5 hidden max-w-full truncate text-[11px] font-semibold sm:block ${
                    ativo
                      ? 'text-white/80'
                      : situacao.tom === 'feriado'
                        ? 'text-red-500'
                        : situacao.tom === 'ok'
                          ? 'text-emerald-600'
                          : situacao.tom === 'pendente'
                            ? 'text-laranja'
                            : 'text-slate-400'
                  }`}
                >
                  {situacao.texto || ' '}
                </span>
                {dia === hoje && !ativo && <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-laranja" />}
              </button>
            )
          })}
        </div>
        <button type="button" onClick={() => aoEscolher(somarDias(data, 7))} aria-label="Próxima semana" className={`${botaoSeta} hidden sm:grid`}>
          <Icone nome="seta" className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-slate-500 sm:hidden">
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Com viagens</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Feriado</span>
      </p>
    </div>
  )
}