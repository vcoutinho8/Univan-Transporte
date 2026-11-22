import L from 'leaflet'
import EstadoVazio from '../../shared/components/EmptyState.tsx'
import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, Marker, Tooltip } from 'react-leaflet'
import { Link } from 'react-router-dom'

import { useSessao } from '../../shared/auth/useSessao.ts'
import Botao from '../../shared/components/Button.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { ErroApi } from '../../shared/services/api.ts'
import { dataIso, diaDaSemana, formatarData, formatarHorario, soDigitos } from '../../shared/utils/formatar.ts'
import type { Coordenada } from '../area/types.ts'
import { ROTULOS_TURNO } from '../estudante/types.ts'
import { servicoInstituicao } from '../instituicao/institutionService.ts'
import { Enquadrar, LinhaDirecional, MapaBase } from '../mapa/MapLayers.tsx'
import { iconeInstituicao } from '../mapa/mapUtils.ts'
import { useTrajeto } from '../mapa/routingService.ts'
import { linkNavegacao, paradasRestantes, type ParadaRestante } from './myRoute.ts'
import { progresso } from './tripFlow.ts'
import { agruparJornadas, ORDEM_TURNOS, type ResumoJornada } from './tripGrouping.ts'
import { ModalIniciarJornada, ModalJornadaConcluida } from './TripModals.tsx'
import GavetaJornada from './TripProgressDrawer.tsx'
import { servicoViagem } from './tripService.ts'
import type { Jornada } from './types.ts'

const ICONE_CASA = L.divIcon({
  className: '',
  html: '<div class="pino pino-instituicao" style="background:#0ea5e9"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg></div>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  tooltipAnchor: [0, -18],
})

const ORDEM_STATUS = { em_andamento: 0, agendada: 1, concluida: 2, cancelada: 3 } as const

/** Jornadas do motorista no dia (todas as dele), na ordem: manhã ida, manhã volta, noite ida... */
function jornadasDoDia(viagens: Parameters<typeof agruparJornadas>[0]): ResumoJornada[] {
  return ORDEM_TURNOS.flatMap((t) => {
    const { ida, volta } = agruparJornadas(viagens, t)
    return [...ida, ...volta]
  }).filter((j) => j.status !== 'cancelada')
}

/**
 * A que está rodando; senão a próxima agendada pelo horário (a primeira que ainda não passou da
 * hora, ou a primeira agendada); senão a última do dia.
 */
export function jornadaPadrao(lista: ResumoJornada[], hora = new Date().toTimeString().slice(0, 5)): ResumoJornada | null {
  const rodando = lista.find((j) => j.status === 'em_andamento')
  if (rodando) return rodando
  const agendadas = lista.filter((j) => j.status === 'agendada')
  const proxima = agendadas.find((j) => (j.horario_previsto ?? '99:99').slice(0, 5) >= hora) ?? agendadas[0]
  return proxima ?? [...lista].sort((a, b) => ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status]).at(-1) ?? null
}

const chaveTexto = (j: ResumoJornada) => `${j.chave.turno}-${j.chave.sentido}`

function iconeParada(numero: number, proxima: boolean) {
  return L.divIcon({
    className: '',
    html: `<div class="pino${proxima ? ' pino-proxima' : ''}"><span>${numero}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 41],
    tooltipAnchor: [0, -40],
  })
}

/** Posição do celular (se o motorista permitir). Sem permissão, a tela funciona sem ela. */
function usePosicao(ligado: boolean): Coordenada | null {
  const [posicao, setPosicao] = useState<Coordenada | null>(null)
  useEffect(() => {
    if (!ligado || !('geolocation' in navigator)) return
    const id = navigator.geolocation.watchPosition(
      (p) => setPosicao([Number(p.coords.latitude.toFixed(6)), Number(p.coords.longitude.toFixed(6))]),
      () => setPosicao(null),
      { enableHighAccuracy: true, maximumAge: 15_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [ligado])
  return posicao
}

/**
 * "Minha rota" (tela do motorista, como um app de corrida): o mapa com o trajeto até as paradas
 * que faltam, a próxima parada em destaque com o botão "Navegar" (abre o Google Maps) e o
 * embarque/desembarque a um toque. Mostra só as viagens do próprio motorista (a API garante).
 */
export default function PaginaMinhaRota() {
  const { usuario } = useSessao()
  const hoje = dataIso()
  const viagens = useRequisicao(() => servicoViagem.listar({ data: hoje }), [hoje])
  const instituicoes = useRequisicao(() => servicoInstituicao.listar(), [])
  const jornadas = useMemo(() => jornadasDoDia(viagens.dados ?? []), [viagens.dados])

  const [escolhida, setEscolhida] = useState<string | null>(null)
  const atual = jornadas.find((j) => chaveTexto(j) === escolhida) ?? jornadaPadrao(jornadas)

  const [jornada, setJornada] = useState<Jornada | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<'nada' | 'iniciar' | 'embarque' | 'concluida'>('nada')
  const [concluida, setConcluida] = useState<Jornada | null>(null)
  const [usarGps, setUsarGps] = useState(false)
  const posicao = usePosicao(usarGps)

  const chave = atual?.chave
  const chaveJson = chave ? JSON.stringify(chave) : ''
  async function carregarJornada() {
    if (!chave) return setJornada(null)
    try {
      setJornada(await servicoViagem.jornada(chave))
      setErro(null)
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Não foi possível carregar a viagem.')
    }
  }
  useEffect(() => {
    void carregarJornada()
    // chaveJson representa a chave (o objeto muda de referência a cada render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveJson])

  const pontosFaculdade = useMemo(
    () => new Map((instituicoes.dados ?? []).map((i) => [i.id, i.ponto_parada] as const)),
    [instituicoes.dados],
  )
  const paradas = useMemo(() => (jornada ? paradasRestantes(jornada, pontosFaculdade) : []), [jornada, pontosFaculdade])
  const comPonto = paradas.filter((p): p is ParadaRestante & { ponto: Coordenada } => p.ponto !== null)
  const proxima = paradas[0] ?? null
  // Ida ainda não iniciada sai da casa do motorista; a volta termina nela.
  const partida = (jornada?.partida ?? null) as Coordenada | null
  const sairDeCasa = !posicao && partida && jornada?.sentido === 'ida' && jornada.status === 'agendada'
  const voltarPraCasa = partida && jornada?.sentido === 'volta' && jornada.status !== 'concluida'
  const pontosRota = useMemo(
    () => [
      ...(posicao ? [posicao] : sairDeCasa ? [partida!] : []),
      ...comPonto.map((p) => p.ponto),
      ...(voltarPraCasa ? [partida!] : []),
    ],
    [posicao, comPonto, sairDeCasa, voltarPraCasa, partida],
  )
  const { trajeto, carregando: tracando } = useTrajeto(pontosRota)
  const { atendidos, total } = progresso(jornada?.fila ?? [])

  async function iniciar() {
    if (!chave) return
    await servicoViagem.iniciarJornada(chave)
    await Promise.all([viagens.recarregar(), carregarJornada()])
    setAberto('embarque')
  }

  const saudacao = new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite'
  const primeiroNome = usuario?.nome.split(' ')[0] ?? ''
  const ida = atual?.chave.sentido === 'ida'

  return (
    <div className="space-y-4">
      {/* Cabeçalho: saudação e dia */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-500">
            {diaDaSemana(hoje).replace(/^./, (c) => c.toUpperCase())}, {formatarData(hoje)}
          </p>
          <h1 className="text-2xl font-extrabold text-marinho">
            {saudacao}, {primeiroNome}
          </h1>
        </div>
        <Link to="/chamadas" className="text-sm font-semibold text-laranja hover:underline">
          Ver avisos de quem não vai
        </Link>
      </div>

      {/* Escolha da viagem do dia */}
      {jornadas.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {jornadas.map((j) => {
            const ativa = atual && chaveTexto(j) === chaveTexto(atual)
            return (
              <button
                key={chaveTexto(j)}
                onClick={() => setEscolhida(chaveTexto(j))}
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                  ativa ? 'bg-marinho text-white' : 'bg-white text-marinho ring-1 ring-slate-200 hover:ring-laranja/50'
                }`}
              >
                {j.status === 'em_andamento' && <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />}
                {j.status === 'concluida' && <Icone nome="ok" className="h-3.5 w-3.5" />}
                {ROTULOS_TURNO[j.chave.turno]} · {j.chave.sentido === 'ida' ? 'Ida' : 'Volta'}
                <span className={`font-normal ${ativa ? 'text-white/70' : 'text-slate-400'}`}>{formatarHorario(j.horario_previsto)}</span>
              </button>
            )
          })}
        </div>
      )}

      {viagens.carregando && !viagens.dados ? (
        <div className="h-[60vh] animate-pulse rounded-2xl bg-white ring-1 ring-slate-200/70" />
      ) : viagens.erro ? (
        <p className="rounded-2xl bg-red-50 p-5 text-sm font-semibold text-red-700">{viagens.erro}</p>
      ) : !atual ? (
        <div className="grid min-h-[50vh] place-items-center rounded-2xl bg-white ring-1 ring-slate-200/70">
          <EstadoVazio
            icone="van"
            tom="laranja"
            titulo="Nenhuma viagem sua hoje"
            descricao="Quando houver viagem no dia, a sua rota aparece aqui com o mapa, a ordem das paradas e a navegação."
          />
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Mapa */}
          <div className="relative self-start overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 lg:sticky lg:top-6">
            <MapaBase className="h-[36vh] min-h-64 lg:h-[calc(100dvh-13rem)] lg:min-h-[480px]" zoom={13}>
              <Enquadrar pontos={pontosRota} chave={`${chaveJson}|${comPonto.length}|${posicao ? 1 : 0}`} />
              {pontosRota.length > 1 && (
                <LinhaDirecional pontos={trajeto?.linha ?? pontosRota} cor="#f2600c" tracejada={!trajeto} />
              )}
              {comPonto.map((p, i) =>
                p.tipo === 'faculdade' ? (
                  <Marker key={p.chave} position={p.ponto} icon={iconeInstituicao(i === 0 ? '#f2600c' : undefined)} zIndexOffset={i === 0 ? 1000 : 0}>
                    <Tooltip direction="top" permanent={i === 0}>
                      {p.titulo}
                    </Tooltip>
                  </Marker>
                ) : (
                  <Marker key={p.chave} position={p.ponto} icon={iconeParada(i + 1, i === 0)} zIndexOffset={i === 0 ? 1000 : -i}>
                    <Tooltip direction="top" permanent={i === 0}>
                      {p.titulo}
                    </Tooltip>
                  </Marker>
                ),
              )}
              {partida && (sairDeCasa || voltarPraCasa) && (
                <Marker position={partida} icon={ICONE_CASA}>
                  <Tooltip direction="top">{voltarPraCasa ? 'Fim da volta: sua casa' : 'Saída: sua casa'}</Tooltip>
                </Marker>
              )}
              {posicao && (
                <CircleMarker center={posicao} radius={9} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#0ea5e9', fillOpacity: 1 }}>
                  <Tooltip direction="top">Você está aqui</Tooltip>
                </CircleMarker>
              )}
            </MapaBase>
            {/* Resumo flutuante do trajeto */}
            <div className="pointer-events-none absolute top-3 left-3 z-[400] flex flex-wrap gap-2">
              {trajeto && (
                <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-marinho shadow">
                  {trajeto.distanciaKm.toFixed(1).replace('.', ',')} km · {Math.round(trajeto.duracaoMin)} min
                </span>
              )}
              {tracando && <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-500 shadow">Traçando...</span>}
            </div>
            <button
              onClick={() => setUsarGps(!usarGps)}
              className={`absolute right-3 bottom-3 z-[400] flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold shadow-lg ${
                usarGps ? 'bg-sky-500 text-white' : 'bg-white text-marinho'
              }`}
            >
              <Icone nome="pino" className="h-4 w-4" />
              {usarGps ? (posicao ? 'Seguindo você' : 'Buscando GPS...') : 'Usar minha localização'}
            </button>
          </div>

          {/* Painel da viagem */}
          <aside className="space-y-3">
            <section className="rounded-2xl bg-marinho p-5 text-white shadow-lg">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold tracking-widest text-white/60 uppercase">
                  {ROTULOS_TURNO[atual.chave.turno]} · {ida ? 'Ida' : 'Volta'}
                </p>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold">
                  {atual.status === 'agendada' ? `Sai ${formatarHorario(atual.horario_previsto)}` : atual.status === 'em_andamento' ? 'Em andamento' : 'Concluída'}
                </span>
              </div>
              <p className="mt-2 text-sm text-white/70">{atual.veiculos.map((v) => `${v.placa} · ${v.modelo}`).join(' / ')}</p>
              <div className="mt-4">
                <div className="flex justify-between text-xs font-semibold text-white/70">
                  <span>Passageiros registrados</span>
                  <span className="tabular-nums">
                    {atendidos}/{total}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-laranja transition-all" style={{ width: `${total ? (atendidos / total) * 100 : 0}%` }} />
                </div>
                {atual.passageiros.nao_vai > 0 && (
                  <p className="mt-2 text-xs font-semibold text-amber-300">{atual.passageiros.nao_vai} avisaram que não vão (fora da fila)</p>
                )}
              </div>
              {atual.status === 'agendada' && (
                <Botao onClick={() => setAberto('iniciar')} className="mt-4 w-full py-3">
                  <Icone nome="van" className="h-4 w-4" />
                  {ida ? 'Iniciar ida' : 'Iniciar volta'}
                </Botao>
              )}
              {atual.status === 'em_andamento' && (
                <Botao onClick={() => setAberto('embarque')} className="mt-4 w-full py-3">
                  <Icone nome="chamada" className="h-4 w-4" />
                  {jornada?.fase === 'a_caminho' ? 'Confirmar desembarques' : 'Registrar embarque'}
                </Botao>
              )}
            </section>

            {erro && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{erro}</p>}

            {/* Próxima parada */}
            {proxima ? (
              <section className="rounded-2xl bg-white p-5 shadow-sm ring-2 ring-laranja/40">
                <p className="text-xs font-bold tracking-widest text-laranja uppercase">
                  Próxima parada · {proxima.acao === 'buscar' ? 'buscar' : 'deixar'}
                </p>
                <div className="mt-2 flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-laranja/10 text-laranja">
                    <Icone nome={proxima.tipo === 'faculdade' ? 'escola' : 'passageiros'} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-lg leading-tight font-extrabold text-marinho">{proxima.titulo}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{proxima.detalhe}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {proxima.ponto ? (
                    <a
                      href={linkNavegacao(proxima.ponto)}
                      target="_blank"
                      rel="noreferrer"
                      className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-bold text-white shadow-lg shadow-sky-600/25 hover:bg-sky-700"
                    >
                      <Icone nome="navegar" className="h-4 w-4" />
                      Navegar
                    </a>
                  ) : (
                    <p className="col-span-2 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-700">
                      Endereço sem localização no mapa: confira com o administrador.
                    </p>
                  )}
                  {proxima.celular && (
                    <>
                      <a
                        href={`tel:${soDigitos(proxima.celular)}`}
                        className="flex items-center justify-center gap-2 rounded-xl bg-fundo py-2.5 text-sm font-bold text-marinho hover:bg-slate-200"
                      >
                        Ligar
                      </a>
                      <a
                        href={`https://wa.me/55${soDigitos(proxima.celular)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-100"
                      >
                        WhatsApp
                      </a>
                    </>
                  )}
                </div>
              </section>
            ) : (
              jornada && (
                <section className="rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-slate-200/70">
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                    <Icone nome="ok" className="h-6 w-6" />
                  </span>
                  <p className="mt-2 font-extrabold text-marinho">Nenhuma parada pendente</p>
                  <p className="text-sm text-slate-500">
                    {atual.status === 'concluida' ? 'Viagem concluída. Bom trabalho!' : 'Todos os passageiros foram atendidos.'}
                  </p>
                </section>
              )
            )}

            {/* Demais paradas */}
            {paradas.length > 1 && (
              <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
                <p className="mb-2 px-1 text-xs font-bold tracking-widest text-slate-400 uppercase">Depois ({paradas.length - 1})</p>
                <ol className="max-h-72 space-y-1 overflow-y-auto">
                  {paradas.slice(1).map((p, i) => (
                    <li key={p.chave} className="flex items-center gap-3 rounded-xl px-1 py-2">
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                          p.tipo === 'faculdade' ? 'bg-marinho text-white' : 'bg-laranja/10 text-laranja'
                        }`}
                      >
                        {p.tipo === 'faculdade' ? <Icone nome="escola" className="h-3.5 w-3.5" /> : i + 2}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-marinho">{p.titulo}</p>
                        <p className="truncate text-xs text-slate-500">{p.detalhe}</p>
                      </div>
                      {p.ponto && (
                        <a
                          href={linkNavegacao(p.ponto)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Navegar até ${p.titulo}`}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-fundo hover:text-sky-600"
                        >
                          <Icone nome="navegar" className="h-4 w-4" />
                        </a>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </aside>
        </div>
      )}

      {aberto === 'iniciar' && atual && <ModalIniciarJornada jornada={atual} aoConfirmar={iniciar} aoFechar={() => setAberto('nada')} />}
      {aberto === 'embarque' && atual && (
        <GavetaJornada
          chave={atual.chave}
          motorista={atual.motorista.nome}
          aoAtualizar={() => void Promise.all([viagens.recarregar(), carregarJornada()])}
          aoConcluir={(fim) => {
            setConcluida(fim)
            setAberto('concluida')
          }}
          aoFechar={() => {
            setAberto('nada')
            void carregarJornada()
          }}
        />
      )}
      {aberto === 'concluida' && concluida && <ModalJornadaConcluida jornada={concluida} aoFechar={() => setAberto('nada')} />}
    </div>
  )
}
