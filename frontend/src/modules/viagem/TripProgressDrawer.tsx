import { useEffect, useState, type ReactNode } from 'react'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Gaveta from '../../shared/components/Drawer.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { ErroApi } from '../../shared/services/api.ts'
import { formatarCelular, formatarHoraDe, formatarHorario, soDigitos } from '../../shared/utils/formatar.ts'
import { ROTULOS_TURNO } from '../estudante/types.ts'
import { ModalEncerrarAntes } from './TripModals.tsx'
import { enderecoCurto, estaABordo, jornadaTerminou, paradasDeDesembarque, progresso, proximoPassageiro } from './tripFlow.ts'
import { servicoViagem } from './tripService.ts'
import type { ChamadaDaJornada, ChaveJornada, FaseJornada, Jornada } from './types.ts'

interface Propriedades {
  chave: ChaveJornada
  motorista: string
  /** Chamado a cada registro, para a lista de viagens acompanhar. */
  aoAtualizar: () => void
  /** Jornada encerrada: a tela mostra o "Viagem concluída". */
  aoConcluir: (jornada: Jornada) => void
  aoFechar: () => void
}

const ETAPAS: { fase: FaseJornada; rotulo: string }[] = [
  { fase: 'embarque', rotulo: 'Embarque' },
  { fase: 'a_caminho', rotulo: 'A caminho' },
  { fase: 'concluida', rotulo: 'Concluída' },
]

/** Indicador das etapas no topo: Embarque → A caminho → Concluída. */
function Etapas({ fase }: { fase: FaseJornada }) {
  const atual = ETAPAS.findIndex((e) => e.fase === fase)
  return (
    <ol className="flex items-center gap-2">
      {ETAPAS.map((etapa, i) => (
        <li key={etapa.fase} className="flex flex-1 items-center gap-2">
          <span
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
              i < atual ? 'bg-emerald-500 text-white' : i === atual ? 'bg-laranja text-white' : 'bg-slate-100 text-slate-400'
            }`}
          >
            {i < atual ? <Icone nome="ok" className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span className={`text-xs font-semibold ${i === atual ? 'text-marinho' : 'text-slate-400'}`}>{etapa.rotulo}</span>
          {i < ETAPAS.length - 1 && <span className={`h-px flex-1 ${i < atual ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
        </li>
      ))}
    </ol>
  )
}

/** Uma pessoa numa lista (fila do embarque ou parada do desembarque). */
function LinhaPassageiro({
  chamada,
  detalhe,
  destaque,
  acao,
}: {
  chamada: ChamadaDaJornada
  detalhe: string
  destaque?: 'ok' | 'falta' | 'pendente'
  acao?: ReactNode
}) {
  const cor = { ok: 'bg-emerald-500 text-white', falta: 'bg-red-500 text-white', pendente: 'bg-slate-100 text-slate-400' }[destaque ?? 'pendente']
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${cor}`}>
        <Icone nome={destaque === 'ok' ? 'ok' : destaque === 'falta' ? 'fechar' : 'pino'} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-marinho">{chamada.estudante.nome}</p>
        <p className="truncate text-xs text-slate-500">{detalhe}</p>
      </div>
      {acao}
    </li>
  )
}

const botaoPequeno = 'shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50'

/**
 * Painel do motorista durante a jornada (feito para o celular):
 * 1. Embarque: o passageiro da vez em destaque, com "Embarcou" e "Não embarcou"; a fila anda sozinha.
 * 2. A caminho: com todos registrados, mostra as paradas (na ida, cada faculdade; na volta, cada
 *    casa) para confirmar o desembarque de quem está a bordo.
 * 3. Concluída: quando ninguém mais está pendente nem a bordo, a jornada conclui sozinha.
 * Quem avisou que não vai (aviso prévio) não aparece.
 */
export default function GavetaJornada({ chave, motorista, aoAtualizar, aoConcluir, aoFechar }: Propriedades) {
  const [jornada, setJornada] = useState<Jornada | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [confirmarEncerrar, setConfirmarEncerrar] = useState(false)

  useEffect(() => {
    servicoViagem
      .jornada(chave)
      .then(setJornada)
      .catch((e) => setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro ao carregar a viagem.'))
  }, [chave])

  const ida = chave.sentido === 'ida'
  const fila = jornada?.fila ?? []
  const fase = jornada?.fase ?? 'embarque'
  const emAndamento = jornada?.status === 'em_andamento'
  const atual = proximoPassageiro(fila) as ChamadaDaJornada | null
  const { atendidos, total } = progresso(fila)
  const aBordo = fila.filter(estaABordo)
  const embarcados = fila.filter((c) => c.status === 'presente')
  const paradas = paradasDeDesembarque(fila, chave.sentido)

  async function concluir() {
    const concluida = await servicoViagem.concluirJornada(chave)
    aoAtualizar()
    aoConcluir(concluida)
  }

  /** Executa um registro, recarrega a jornada e conclui sozinho quando não sobrar ninguém. */
  async function registrar(acao: () => Promise<unknown>) {
    setSalvando(true)
    setErro(null)
    try {
      await acao()
      const nova = await servicoViagem.jornada(chave)
      setJornada(nova)
      aoAtualizar()
      if (nova.status === 'em_andamento' && jornadaTerminou(nova.fila)) await concluir()
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado.')
    } finally {
      setSalvando(false)
    }
  }

  async function encerrar() {
    setConfirmarEncerrar(false)
    setSalvando(true)
    try {
      await concluir()
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado.')
      setSalvando(false)
    }
  }

  const desfazer = (c: ChamadaDaJornada) => (
    <button
      type="button"
      disabled={salvando || !emAndamento}
      onClick={() => void registrar(() => servicoViagem.desfazer(c.fk_viagem, c.estudante.id))}
      className={`${botaoPequeno} text-slate-400 hover:text-laranja`}
    >
      Desfazer
    </button>
  )

  return (
    <Gaveta
      titulo={fase === 'a_caminho' ? 'A caminho dos destinos' : ida ? 'Buscando passageiros' : 'Embarque na faculdade'}
      descricao={`${motorista} · ${ida ? 'Ida' : 'Volta'} da ${ROTULOS_TURNO[chave.turno].toLowerCase()}`}
      aoFechar={aoFechar}
      largura="max-w-lg"
    >
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
        {erro && <Alerta mensagem={erro} aoFechar={() => setErro(null)} />}
        {!jornada && !erro && <p className="py-8 text-center text-sm text-slate-500">Carregando passageiros...</p>}

        {jornada && (
          <>
            <Etapas fase={fase} />
            {jornada.passageiros.nao_vai > 0 && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {jornada.passageiros.nao_vai} passageiro(s) avisaram que não vão hoje e não aparecem aqui.
              </p>
            )}

            {/* ------------------------------------------------ 1. Embarque */}
            {fase === 'embarque' && (
              <>
                <div>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-marinho">
                      {atendidos} de {total} registrados
                    </span>
                    <span className="text-slate-500">Saiu às {formatarHoraDe(jornada.horario_saida)}</span>
                  </div>
                  <div className="mt-2 h-2.5 rounded-full bg-fundo">
                    <div className="h-2.5 rounded-full bg-laranja transition-all duration-500" style={{ width: `${total ? (100 * atendidos) / total : 100}%` }} />
                  </div>
                </div>

                {atual && (
                  <div className="rounded-2xl border-2 border-laranja/40 bg-laranja/5 p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold tracking-wide text-laranja uppercase">{ida ? 'Buscar agora' : 'Embarque agora'}</p>
                      <span className="truncate rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-marinho ring-1 ring-slate-200">
                        {atual.instituicao.nome}
                      </span>
                    </div>
                    <p className="mt-1 text-xl font-extrabold text-marinho">{atual.estudante.nome}</p>
                    {ida && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                        <Icone nome="pino" className="h-4 w-4 shrink-0 text-laranja" />
                        {enderecoCurto(atual)}
                      </p>
                    )}
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <Icone nome="relogio" className="h-4 w-4" />
                        {formatarHorario(atual.horario_previsto)}
                      </span>
                      <a href={`tel:${soDigitos(atual.estudante.celular)}`} className="py-1 font-semibold text-marinho underline-offset-2 hover:underline">
                        {formatarCelular(atual.estudante.celular)}
                      </a>
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Botao
                        variante="perigo"
                        className="py-3 text-base"
                        disabled={salvando}
                        onClick={() => void registrar(() => servicoViagem.falta(atual.fk_viagem, atual.estudante.id))}
                      >
                        Não embarcou
                      </Botao>
                      <Botao
                        className="py-3 text-base"
                        disabled={salvando}
                        onClick={() => void registrar(() => servicoViagem.embarque(atual.fk_viagem, atual.estudante.id))}
                      >
                        <Icone nome="ok" className="h-5 w-5" />
                        Embarcou
                      </Botao>
                    </div>
                  </div>
                )}

                <ul className="divide-y divide-slate-100">
                  {fila.map((c) =>
                    c === atual ? null : (
                      <LinhaPassageiro
                        key={`${c.fk_viagem}-${c.estudante.id}`}
                        chamada={c}
                        destaque={c.status === 'presente' ? 'ok' : c.status === 'ausente' ? 'falta' : 'pendente'}
                        detalhe={
                          c.status === 'presente'
                            ? `Embarcou às ${formatarHoraDe(c.horario_embarque)} · ${c.instituicao.nome}`
                            : c.status === 'ausente'
                              ? `Não embarcou · ${c.instituicao.nome}`
                              : `Previsto ${formatarHorario(c.horario_previsto)} · ${c.instituicao.nome}`
                        }
                        acao={c.status !== 'pendente' ? desfazer(c) : undefined}
                      />
                    ),
                  )}
                </ul>
              </>
            )}

            {/* ------------------------------------------------ 2. A caminho / desembarque */}
            {fase === 'a_caminho' && (
              <>
                <div className="rounded-2xl bg-marinho p-4 text-white">
                  <p className="text-xs font-semibold tracking-wide text-white/70 uppercase">A bordo agora</p>
                  <p className="mt-1 text-3xl font-extrabold tabular-nums">
                    {aBordo.length}
                    <span className="text-base font-semibold text-white/60"> de {embarcados.length} embarcados</span>
                  </p>
                  <p className="mt-1 text-sm text-white/80">
                    {ida
                      ? 'Confirme em cada faculdade que todos desceram.'
                      : 'Confirme cada passageiro deixado em casa.'}
                  </p>
                </div>

                {paradas.map((parada) => {
                  const pendentesNaParada = parada.passageiros.filter(estaABordo)
                  const concluida = pendentesNaParada.length === 0
                  return (
                    <section
                      key={parada.chave}
                      className={`rounded-2xl ring-1 ${concluida ? 'bg-emerald-50/60 ring-emerald-200' : 'bg-white ring-slate-200'}`}
                    >
                      <header className="flex items-center gap-3 px-4 pt-3">
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${concluida ? 'bg-emerald-500 text-white' : 'bg-laranja/10 text-laranja'}`}>
                          <Icone nome={concluida ? 'ok' : ida ? 'escola' : 'pino'} className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold text-marinho">{parada.titulo}</p>
                          <p className="truncate text-xs text-slate-500">
                            {ida
                              ? concluida
                                ? 'Todos desceram'
                                : `${pendentesNaParada.length} para descer aqui`
                              : enderecoCurto(parada.passageiros[0])}
                          </p>
                        </div>
                        {!ida && !concluida && (
                          <Botao
                            className="shrink-0 py-2.5"
                            disabled={salvando}
                            onClick={() =>
                              void registrar(() => servicoViagem.desembarque(parada.fk_viagem, parada.passageiros[0].estudante.id))
                            }
                          >
                            Deixei em casa
                          </Botao>
                        )}
                        {!ida && concluida && desfazer(parada.passageiros[0])}
                      </header>

                      {ida && (
                        <>
                          <ul className="divide-y divide-slate-100 px-4 pb-1">
                            {parada.passageiros.map((c) => (
                              <LinhaPassageiro
                                key={c.estudante.id}
                                chamada={c}
                                destaque={estaABordo(c) ? 'pendente' : 'ok'}
                                detalhe={estaABordo(c) ? 'A bordo' : `Desceu às ${formatarHoraDe(c.horario_desembarque)}`}
                                acao={
                                  estaABordo(c) ? (
                                    <button
                                      type="button"
                                      disabled={salvando}
                                      onClick={() => void registrar(() => servicoViagem.desembarque(c.fk_viagem, c.estudante.id))}
                                      className={`${botaoPequeno} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
                                    >
                                      Desceu
                                    </button>
                                  ) : (
                                    desfazer(c)
                                  )
                                }
                              />
                            ))}
                          </ul>
                          {!concluida && (
                            <div className="px-4 pb-4">
                              <Botao
                                className="w-full py-3 text-base"
                                disabled={salvando}
                                onClick={() => void registrar(() => servicoViagem.desembarcarTodos(parada.fk_viagem))}
                              >
                                <Icone nome="ok" className="h-5 w-5" />
                                Todos desceram aqui
                              </Botao>
                            </div>
                          )}
                        </>
                      )}
                      {!ida && <div className="pb-3" />}
                    </section>
                  )
                })}

                {/* Resumo do embarque, para conferir ou desfazer */}
                <details className="rounded-2xl bg-fundo/60 px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-marinho">
                    Embarque: {embarcados.length} embarcaram · {fila.filter((c) => c.status === 'ausente').length} não embarcaram
                  </summary>
                  <ul className="mt-2 divide-y divide-slate-200/70">
                    {fila.map((c) => (
                      <LinhaPassageiro
                        key={`${c.fk_viagem}-${c.estudante.id}`}
                        chamada={c}
                        destaque={c.status === 'presente' ? 'ok' : 'falta'}
                        detalhe={c.status === 'presente' ? `Embarcou às ${formatarHoraDe(c.horario_embarque)}` : 'Não embarcou'}
                        acao={c.status === 'ausente' || !c.horario_desembarque ? desfazer(c) : undefined}
                      />
                    ))}
                  </ul>
                </details>
              </>
            )}

            {/* ------------------------------------------------ Concluída (ao reabrir) */}
            {(fase === 'concluida' || fase === 'cancelada') && (
              <ul className="divide-y divide-slate-100">
                {fila.map((c) => (
                  <LinhaPassageiro
                    key={`${c.fk_viagem}-${c.estudante.id}`}
                    chamada={c}
                    destaque={c.status === 'presente' ? 'ok' : 'falta'}
                    detalhe={
                      c.status === 'presente'
                        ? `Embarcou ${formatarHoraDe(c.horario_embarque)} · desceu ${formatarHoraDe(c.horario_desembarque)} · ${c.instituicao.nome}`
                        : `Não embarcou · ${c.instituicao.nome}`
                    }
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {jornada && emAndamento && (
        <footer className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 sm:px-6">
          <span className="text-xs text-slate-500">
            {fase === 'embarque' ? `${total - atendidos} ainda na fila` : `${aBordo.length} a bordo`}
          </span>
          <Botao variante="secundario" onClick={() => setConfirmarEncerrar(true)} disabled={salvando}>
            Encerrar viagem
          </Botao>
        </footer>
      )}

      {confirmarEncerrar && (
        <ModalEncerrarAntes
          pendentes={total - atendidos}
          aBordo={aBordo.length}
          aoConfirmar={() => void encerrar()}
          aoFechar={() => setConfirmarEncerrar(false)}
        />
      )}
    </Gaveta>
  )
}
