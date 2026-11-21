import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'

import Botao from '../../shared/components/Button.tsx'
import Icone from '../../shared/components/Icon.tsx'
import Modal from '../../shared/components/Modal.tsx'
import { useAviso } from '../../shared/components/NoticeModal.tsx'
import CabecalhoPagina from '../../shared/components/PageHeader.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { ErroApi } from '../../shared/services/api.ts'
import { dataIso, formatarData, somarDias } from '../../shared/utils/formatar.ts'
import { partesDoDia } from '../viagem/semana.ts'
import {
  diasAte,
  diasDoCalendario,
  inicioDoMes,
  intervalo,
  nomeDoMes,
  posicaoNaFaixa,
  somarMeses,
} from './calendario.ts'
import FormularioDiaSemAula from './NoClassDayForm.tsx'
import { servicoDiaSemAula } from './noClassDayService.ts'
import type { DadosPeriodoSemAula, DiaSemAula, PeriodoSemAula } from './types.ts'

const SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

type Faixa = { inicio: string; fim: string }

function descreverPeriodo(p: Faixa): string {
  return p.inicio === p.fim ? formatarData(p.inicio) : `${formatarData(p.inicio)} a ${formatarData(p.fim)}`
}

/** Bloco de data da lista lateral: dia grande e mês curto. */
function BlocoData({ iso, geral }: { iso: string; geral: boolean }) {
  const { dia, mes, semana } = partesDoDia(iso)
  return (
    <span
      className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl ${
        geral ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-100' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
      }`}
    >
      <span className="text-[10px] font-bold uppercase">{semana}</span>
      <span className="text-xl leading-none font-extrabold tabular-nums">{dia}</span>
      <span className="text-[10px] font-semibold uppercase">{mes}</span>
    </span>
  )
}

/**
 * Calendário (dias sem aula: feriados, recessos, férias acadêmicas). Arraste sobre os dias para
 * marcar um período, ou clique num dia só; ao soltar, o formulário abre com as datas.
 * Nesses dias, "Gerar viagens do dia" não cria viagens para quem está sem aula.
 */
export default function PaginaCalendario() {
  const hoje = dataIso()
  const [mes, setMes] = useState(inicioDoMes(hoje))
  const [arraste, setArraste] = useState<{ origem: string; atual: string } | null>(null)
  const [escolhida, setEscolhida] = useState<Faixa | null>(null)
  const [remover, setRemover] = useState<PeriodoSemAula | null>(null)
  const avisos = useAviso()
  const grade = useRef<HTMLDivElement>(null)

  const dias = diasDoCalendario(mes)
  const marcados = useRequisicao(() => servicoDiaSemAula.listar(dias[0], dias[41]), [dias[0]])
  const doMes = useRequisicao(() => servicoDiaSemAula.periodos(mes, somarDias(somarMeses(mes, 1), -1)), [mes])
  const proximos = useRequisicao(() => servicoDiaSemAula.periodos(hoje, somarDias(hoje, 365)), [hoje])

  const porData = useMemo(() => {
    const mapa = new Map<string, DiaSemAula[]>()
    for (const d of marcados.dados ?? []) mapa.set(d.data, [...(mapa.get(d.data) ?? []), d])
    return mapa
  }, [marcados.dados])

  // A faixa desenhada: a do arraste em andamento ou a que já foi escolhida (formulário aberto).
  const faixa: Faixa | null = arraste ? intervalo(arraste.origem, arraste.atual) : escolhida

  // Soltar fora do calendário também encerra o arraste.
  useEffect(() => {
    if (!arraste) return
    const soltar = () => {
      setEscolhida(intervalo(arraste.origem, arraste.atual))
      setArraste(null)
    }
    window.addEventListener('pointerup', soltar)
    return () => window.removeEventListener('pointerup', soltar)
  }, [arraste])

  /** Dia sob o ponteiro (funciona com mouse e com o dedo, que não dispara "entrar" nos elementos). */
  function diaSobPonteiro(evento: PointerEvent) {
    const alvo = document.elementFromPoint(evento.clientX, evento.clientY)?.closest<HTMLElement>('[data-dia]')
    return alvo?.dataset.dia ?? null
  }

  function comecar(evento: PointerEvent<HTMLDivElement>) {
    const dia = diaSobPonteiro(evento)
    if (!dia) return
    // No toque, o navegador "prende" o ponteiro no primeiro elemento; soltamos para seguir o dedo.
    ;(evento.target as HTMLElement).releasePointerCapture?.(evento.pointerId)
    setArraste({ origem: dia, atual: dia })
  }

  function mover(evento: PointerEvent<HTMLDivElement>) {
    if (!arraste) return
    const dia = diaSobPonteiro(evento)
    if (dia && dia !== arraste.atual) setArraste({ ...arraste, atual: dia })
  }

  async function recarregar() {
    await Promise.all([marcados.recarregar(), doMes.recarregar(), proximos.recarregar()])
  }

  async function salvar(dados: DadosPeriodoSemAula) {
    const resultado = await servicoDiaSemAula.cadastrar(dados)
    setEscolhida(null)
    await recarregar()
    const itens = [
      resultado.ja_existiam > 0 && `${resultado.ja_existiam} dia(s) já estavam cadastrados e não foram duplicados.`,
      resultado.viagens_geradas > 0 &&
        `Já existem ${resultado.viagens_geradas} rota(s) de viagem geradas nesses dias. Elas continuam valendo: cancele-as na tela de Viagens se não forem acontecer.`,
    ].filter((i): i is string => Boolean(i))
    avisos.mostrar({
      tipo: resultado.viagens_geradas > 0 ? 'aviso' : 'sucesso',
      titulo: 'Calendário atualizado',
      descricao: `${dados.motivo} · ${descreverPeriodo({ inicio: dados.data_inicio, fim: dados.data_fim })}`,
      itens,
    })
  }

  async function confirmarRemocao(periodo: PeriodoSemAula) {
    setRemover(null)
    try {
      await servicoDiaSemAula.remover(periodo.ids)
      await recarregar()
      avisos.mostrar({
        tipo: 'sucesso',
        titulo: 'Voltou a ter aula',
        descricao: `${periodo.motivo} (${descreverPeriodo(periodo)}) foi removido. Gere as viagens desses dias na tela de Viagens.`,
      })
    } catch (e) {
      avisos.erro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado.', 'Não foi possível remover')
    }
  }

  // Números do mês
  const datasDoMes = new Set((marcados.dados ?? []).filter((d) => d.data.slice(0, 7) === mes.slice(0, 7)).map((d) => d.data))
  const uteisDoMes = [...datasDoMes].filter((d) => !partesDoDia(d).fimDeSemana).length
  const proximo = proximos.dados?.find((p) => p.fim >= hoje)

  return (
    <>
      <CabecalhoPagina
        titulo="Calendário"
        descricao="Feriados, recessos e férias acadêmicas. Arraste sobre os dias para marcar um período sem aula."
      />

      {/* Números do mês */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
          <p className="text-xs font-semibold text-slate-500">Dias sem aula no mês</p>
          <p className="mt-1 text-2xl font-extrabold text-marinho tabular-nums">{datasDoMes.size}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
          <p className="text-xs font-semibold text-slate-500">Dias úteis sem viagem</p>
          <p className="mt-1 text-2xl font-extrabold text-marinho tabular-nums">{uteisDoMes}</p>
        </div>
        <div className="rounded-2xl bg-marinho p-4 text-white shadow-sm">
          <p className="text-xs font-semibold text-white/70">Próximo dia sem aula</p>
          {proximo ? (
            <p className="mt-1 truncate text-lg font-extrabold">
              {proximo.motivo}
              <span className="ml-2 text-sm font-semibold text-white/70">
                {diasAte(proximo.inicio, hoje) <= 0 ? 'hoje' : `em ${diasAte(proximo.inicio, hoje)} dia(s)`}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-lg font-extrabold">Nenhum nos próximos 12 meses</p>
          )}
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_22rem]">
        {/* Calendário */}
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-6">
          <header className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-marinho">{nomeDoMes(mes)}</h2>
              <p className="text-xs text-slate-500">Clique num dia ou arraste para marcar um período.</p>
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-fundo p-1">
              <button type="button" onClick={() => setMes(somarMeses(mes, -1))} aria-label="Mês anterior" className="grid h-9 w-9 place-items-center rounded-lg text-marinho hover:bg-white">
                <Icone nome="seta" className="h-4 w-4 rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => setMes(inicioDoMes(hoje))}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${inicioDoMes(hoje) === mes ? 'text-slate-400' : 'text-laranja hover:bg-white'}`}
              >
                Hoje
              </button>
              <button type="button" onClick={() => setMes(somarMeses(mes, 1))} aria-label="Próximo mês" className="grid h-9 w-9 place-items-center rounded-lg text-marinho hover:bg-white">
                <Icone nome="seta" className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="grid grid-cols-7 pb-2 text-center text-[11px] font-bold tracking-wide text-slate-400 uppercase">
            {SEMANA.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          {/* Grade: arrastar com mouse ou dedo seleciona o período */}
          <div
            ref={grade}
            onPointerDown={comecar}
            onPointerMove={mover}
            className="grid touch-none grid-cols-7 gap-y-1.5 select-none"
          >
            {dias.map((dia) => {
              const noMes = dia.slice(0, 7) === mes.slice(0, 7)
              const registros = porData.get(dia) ?? []
              const geral = registros.find((r) => r.fk_instituicao === null)
              const posicao = posicaoNaFaixa(dia, faixa)
              const { dia: numero, fimDeSemana } = partesDoDia(dia)
              const ehHoje = dia === hoje
              return (
                <div
                  key={dia}
                  data-dia={dia}
                  title={registros.map((r) => (r.instituicao ? `${r.instituicao.nome}: ${r.motivo}` : r.motivo)).join(' · ') || undefined}
                  className={`relative h-16 cursor-pointer px-0.5 transition-colors sm:h-24 ${
                    posicao
                      ? `bg-laranja/15 ${posicao.abreLinha ? 'rounded-l-2xl' : ''} ${posicao.fechaLinha ? 'rounded-r-2xl' : ''}`
                      : ''
                  }`}
                >
                  <div
                    className={`flex h-full flex-col rounded-2xl p-1 sm:p-2 ${
                      posicao?.ponta
                        ? 'bg-laranja text-white shadow-md shadow-laranja/30'
                        : posicao
                          ? ''
                          : geral
                            ? 'bg-rose-50'
                            : registros.length
                              ? 'bg-amber-50/80'
                              : 'hover:bg-fundo'
                    }`}
                  >
                    <span
                      className={`grid h-7 w-7 place-items-center rounded-full text-sm font-bold tabular-nums ${
                        posicao?.ponta
                          ? 'text-white'
                          : ehHoje
                            ? 'bg-marinho text-white'
                            : !noMes
                              ? 'text-slate-300'
                              : geral
                                ? 'text-rose-600'
                                : fimDeSemana
                                  ? 'text-slate-400'
                                  : 'text-marinho'
                      }`}
                    >
                      {numero}
                    </span>
                    {registros.length > 0 && !posicao?.ponta && (
                      <span
                        className={`mt-auto hidden truncate rounded-md px-1.5 py-0.5 text-[10px] font-bold sm:block ${
                          geral ? 'bg-rose-500 text-white' : 'bg-amber-400 text-amber-950'
                        }`}
                      >
                        {geral ? geral.motivo : registros.length === 1 ? registros[0].motivo : `${registros.length} faculdades`}
                      </span>
                    )}
                    {registros.length > 0 && !posicao?.ponta && (
                      <span className={`mx-auto mt-auto h-1.5 w-1.5 rounded-full sm:hidden ${geral ? 'bg-rose-500' : 'bg-amber-400'}`} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-rose-500" /> Sem aula em todas</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-400" /> Sem aula em algumas</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-marinho" /> Hoje</span>
            {arraste && (
              <span className="ml-auto font-bold text-laranja">
                {descreverPeriodo(intervalo(arraste.origem, arraste.atual))}
              </span>
            )}
          </div>
        </section>

        {/* Lista do mês */}
        <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
          <h2 className="border-b border-slate-100 px-5 py-4 font-bold text-marinho">Sem aula em {nomeDoMes(mes).toLowerCase()}</h2>
          {doMes.dados && doMes.dados.length === 0 && (
            <div className="px-6 py-10 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                <Icone nome="ok" className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm font-semibold text-marinho">Mês inteiro com aula</p>
              <p className="mt-1 text-xs text-slate-500">Arraste no calendário para marcar férias ou feriados.</p>
            </div>
          )}
          <ul className="divide-y divide-slate-100">
            {doMes.dados?.map((p) => (
              <li key={p.ids[0]} className="group flex items-center gap-3 px-4 py-3">
                <BlocoData iso={p.inicio} geral={!p.instituicao} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-marinho">{p.motivo}</p>
                  <p className="text-xs text-slate-500">
                    {p.inicio === p.fim ? 'Um dia' : `Até ${formatarData(p.fim).slice(0, 5)} · ${p.dias} dias`}
                  </p>
                  <p className="truncate text-xs text-slate-400">{p.instituicao ? p.instituicao.nome : 'Todas as instituições'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setRemover(p)}
                  aria-label={`Remover ${p.motivo}`}
                  title="Remover"
                  className="rounded-lg p-2 text-slate-300 transition-colors group-hover:text-slate-400 hover:bg-red-50 hover:!text-red-500"
                >
                  <Icone nome="fechar" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {escolhida && !arraste && (
        <FormularioDiaSemAula
          key={`${escolhida.inicio}-${escolhida.fim}`}
          inicio={escolhida.inicio}
          fim={escolhida.fim}
          aoSalvar={salvar}
          aoCancelar={() => setEscolhida(null)}
        />
      )}
      {remover && (
        <Modal
          titulo="Remover este período?"
          descricao={`${remover.motivo} · ${descreverPeriodo(remover)}. Esses dias voltam a ter aula e viagens.`}
          icone="alerta"
          tom="vermelho"
          aoFechar={() => setRemover(null)}
          acoes={
            <>
              <Botao variante="secundario" onClick={() => setRemover(null)}>
                Manter
              </Botao>
              <Botao variante="perigo" onClick={() => void confirmarRemocao(remover)}>
                Remover
              </Botao>
            </>
          }
        />
      )}
      {avisos.modal}
    </>
  )
}
