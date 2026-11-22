import L from 'leaflet'
import EstadoVazio from '../../shared/components/EmptyState.tsx'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CircleMarker, Marker, Tooltip, useMap } from 'react-leaflet'
import { Link, useSearchParams } from 'react-router-dom'

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
import { linhaRestante } from '../mapa/navigationService.ts'
import { useTrajeto } from '../mapa/routingService.ts'
import { distanciaKm, paradasRestantes, type ParadaRestante } from './myRoute.ts'
import ModoNavegacao from './NavigationMode.tsx'
import { useSimulador } from './simulacao.ts'
import { estaABordo, jornadaTerminou, progresso } from './tripFlow.ts'
import { agruparJornadas, foraDoHorario, jornadasDoTurno, ORDEM_TURNOS, travaDaJornada, type ResumoJornada } from './tripGrouping.ts'
import { ModalEmergencia, ModalIniciarJornada, ModalJornadaConcluida } from './TripModals.tsx'
import GavetaJornada from './TripProgressDrawer.tsx'
import { servicoViagem } from './tripService.ts'
import type { ChamadaDaJornada, Jornada } from './types.ts'

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

/** GPS do celular (se o motorista permitir). Sem permissão, a tela funciona sem ele. */
function usePosicao(ligado: boolean): { posicao: Coordenada | null; rumo: number | null; erro: string | null } {
  const [posicao, setPosicao] = useState<Coordenada | null>(null)
  const [rumo, setRumo] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    if (!ligado) return
    if (!('geolocation' in navigator)) {
      setErro('Este aparelho não tem GPS disponível.')
      return
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPosicao([Number(p.coords.latitude.toFixed(6)), Number(p.coords.longitude.toFixed(6))])
        // Direção só vem com o carro andando; parado, fica a última.
        if (p.coords.heading !== null && !Number.isNaN(p.coords.heading) && (p.coords.speed ?? 0) > 1) setRumo(p.coords.heading)
        setErro(null)
      },
      (e) => setErro(e.code === e.PERMISSION_DENIED ? 'Localização bloqueada: libere nas permissões do navegador.' : 'Sem sinal de GPS agora.'),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [ligado])
  return { posicao, rumo, erro }
}

/** Mapa acompanhando o motorista (como no app de navegação). */
function SeguirPosicao({ posicao }: { posicao: Coordenada }) {
  const mapa = useMap()
  useEffect(() => {
    mapa.flyTo(posicao, Math.max(mapa.getZoom(), 16), { duration: 0.6 })
  }, [mapa, posicao])
  return null
}

/** "350 m" / "1,2 km". */
const formatarDistancia = (km: number) => (km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(1).replace('.', ',')} km`)

/** Perto assim da parada, considera que chegou. */
const RAIO_CHEGADA_KM = 0.08

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

  // Relógio do aparelho (a cada 30 s): o turno destrava sozinho quando chega a hora.
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  const trava = (j: ResumoJornada) => travaDaJornada(jornadas, j, agora)
  // Só o turno da hora aparece (de manhã, só a manhã); fora de qualquer turno, avisa o próximo.
  const doTurno = jornadasDoTurno(jornadas, agora)
  const proximoTurno = doTurno.length ? null : jornadas.find((j) => j.status === 'agendada' && foraDoHorario(jornadas, j, agora)?.startsWith('Abre'))

  // ?jornada=manha-ida&iniciar=1 (vindo de "Viagens"): abre nela, já com o popup de iniciar.
  const [busca, setBusca] = useSearchParams()
  const [escolhida, setEscolhida] = useState<string | null>(() => busca.get('jornada'))
  const atual =
    doTurno.find((j) => chaveTexto(j) === escolhida && !trava(j)) ?? jornadaPadrao(doTurno.filter((j) => !trava(j))) ?? jornadaPadrao(doTurno)
  const travaAtual = atual ? trava(atual) : null

  const [jornada, setJornada] = useState<Jornada | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<'nada' | 'iniciar' | 'embarque' | 'concluida'>('nada')
  const [concluida, setConcluida] = useState<Jornada | null>(null)
  const [usarGps, setUsarGps] = useState(false)
  // Simulador (só em desenvolvimento): substitui o GPS por uma van andando pelas ruas.
  const [simulando, setSimulando] = useState(false)
  const [velocidadeSim, setVelocidadeSim] = useState(40)
  const gps = usePosicao(usarGps && !simulando)
  // Navegação dentro do site, em tela cheia.
  const [navegando, setNavegando] = useState(false)
  const [confirmarEncerrar, setConfirmarEncerrar] = useState(false)
  // Seguindo o motorista no mapa (desliga para ver a rota inteira).
  const [seguir, setSeguir] = useState(true)
  const [registrando, setRegistrando] = useState(false)
  // Celular: gaveta recolhida = mapa na tela toda, com a rota inteira (toque ou arraste no tracinho).
  const [mapaCheio, setMapaCheio] = useState(false)
  const toqueInicio = useRef<number | null>(null)
  function alternarMapa(cheio: boolean) {
    setMapaCheio(cheio)
    setSeguir(!cheio)
  }

  useEffect(() => {
    if (busca.get('iniciar') !== '1' || !atual) return
    if (atual.status === 'agendada' && !travaDaJornada(jornadas, atual, new Date())) setAberto('iniciar')
    setBusca({}, { replace: true })
  }, [busca, atual, jornadas, setBusca])

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

  const emAndamento = jornada?.status === 'em_andamento'
  useEffect(() => {
    if (emAndamento) setUsarGps(true)
  }, [emAndamento])

  const pontosFaculdade = useMemo(
    () => new Map((instituicoes.dados ?? []).map((i) => [i.id, i.ponto_parada] as const)),
    [instituicoes.dados],
  )
  const paradas = useMemo(() => (jornada ? paradasRestantes(jornada, pontosFaculdade) : []), [jornada, pontosFaculdade])
  const comPonto = paradas.filter((p): p is ParadaRestante & { ponto: Coordenada } => p.ponto !== null)
  const proxima = paradas[0] ?? null
  // Ida ainda não iniciada sai da casa do motorista; a volta termina nela.
  const partida = (jornada?.partida ?? null) as Coordenada | null
  const voltarPraCasa = partida && jornada?.sentido === 'volta' && jornada.status !== 'concluida'
  // A simulação da ida sai de casa; a da volta, da primeira parada (a faculdade).
  const sim = useSimulador(
    simulando,
    (jornada?.sentido === 'ida' ? partida : null) ?? comPonto[0]?.ponto ?? null,
    proxima?.ponto ?? (voltarPraCasa ? partida : null),
    velocidadeSim,
  )
  const { posicao, rumo, erro: erroGps } = simulando ? { ...sim, erro: null } : gps
  const sairDeCasa = !posicao && partida && jornada?.sentido === 'ida' && jornada.status === 'agendada'
  // O traçado parte de onde a van estava há 40 m: o GPS muda a cada segundo e refazer a rota a
  // cada leitura fazia a linha piscar ("Traçando...") sem parar.
  const ancora = useRef<Coordenada | null>(null)
  if (!posicao) ancora.current = null
  else if (!ancora.current || distanciaKm(ancora.current, posicao) >= 0.04) ancora.current = posicao
  const origemRota = ancora.current
  const pontosRota = [
    ...(origemRota ? [origemRota] : sairDeCasa ? [partida!] : []),
    ...comPonto.map((p) => p.ponto),
    ...(voltarPraCasa ? [partida!] : []),
  ]
  // Em partes, para ser rápido: primeiro só o trecho até a próxima parada (pedido pequeno, em
  // destaque); o resto da viagem vem depois, mais claro.
  const trechoProximo = pontosRota.slice(0, 2)
  const restoDaViagem = pontosRota.slice(1)
  const { trajeto, carregando: tracando } = useTrajeto(trechoProximo, true)
  const { trajeto: trajetoResto } = useTrajeto(restoDaViagem, true)
  const { atendidos, total } = progresso(jornada?.fila ?? [])

  // Distância até a próxima parada e "você chegou".
  const distanciaProxima = posicao && proxima?.ponto ? distanciaKm(posicao, proxima.ponto) : null
  const chegou = distanciaProxima !== null && distanciaProxima <= RAIO_CHEGADA_KM
  const chaveProxima = proxima?.chave
  useEffect(() => {
    if (chegou && 'vibrate' in navigator) navigator.vibrate?.([120, 60, 120])
  }, [chegou, chaveProxima])
  // Popup da parada: abre sozinho ao chegar (uma vez por parada) ou pelo botão "Registrar".
  const [popupFechadoEm, setPopupFechadoEm] = useState<string | null>(null)
  const [registroManual, setRegistroManual] = useState(false)
  useEffect(() => setRegistroManual(false), [chaveProxima])
  // Registro por proximidade: só libera perto da parada (sem localização no mapa, libera sempre).
  const podeRegistrar = chegou || (proxima !== null && !proxima.ponto)
  const popupParada =
    emAndamento && proxima !== null && ((registroManual && podeRegistrar) || (chegou && popupFechadoEm !== chaveProxima))

  async function iniciar() {
    if (!chave) return
    await servicoViagem.iniciarJornada(chave)
    // Iniciou: liga o GPS (o celular pede permissão agora) e o mapa passa a seguir o motorista.
    setUsarGps(true)
    setSeguir(true)
    setAberto('nada')
    setNavegando(true)
    await Promise.all([viagens.recarregar(), carregarJornada()])
  }

  /** Registra embarque/falta/desembarque direto do card; conclui sozinho quando não sobra ninguém. */
  async function registrar(acoes: (() => Promise<unknown>)[]) {
    if (!chave) return
    setRegistrando(true)
    setErro(null)
    try {
      for (const acao of acoes) await acao()
      const nova = await servicoViagem.jornada(chave)
      setJornada(nova)
      void viagens.recarregar()
      if (nova.status === 'em_andamento' && jornadaTerminou(nova.fila)) {
        const fim = await servicoViagem.concluirJornada(chave)
        setJornada(fim)
        setConcluida(fim)
        setNavegando(false)
        setAberto('concluida')
        void viagens.recarregar()
      }
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Não foi possível registrar.')
    } finally {
      setRegistrando(false)
    }
  }

  /** Emergência: encerra antes de registrar todos (pendentes viram "não embarcou") e guarda o motivo. */
  async function encerrarViagem(motivo: string) {
    if (!chave) return
    setConfirmarEncerrar(false)
    setRegistrando(true)
    try {
      const fim = await servicoViagem.concluirJornada(chave, motivo)
      setJornada(fim)
      setConcluida(fim)
      setNavegando(false)
      setAberto('concluida')
      void viagens.recarregar()
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Não foi possível encerrar a viagem.')
    } finally {
      setRegistrando(false)
    }
  }

  const embarcou = (c: ChamadaDaJornada) => () => servicoViagem.embarque(c.fk_viagem, c.estudante.id)
  const faltou = (c: ChamadaDaJornada) => () => servicoViagem.falta(c.fk_viagem, c.estudante.id)
  const desceu = (c: ChamadaDaJornada) => () => servicoViagem.desembarque(c.fk_viagem, c.estudante.id)

  const saudacao = agora.getHours() < 12 ? 'Bom dia' : agora.getHours() < 18 ? 'Boa tarde' : 'Boa noite'
  const primeiroNome = usuario?.nome.split(' ')[0] ?? ''
  const ida = atual?.chave.sentido === 'ida'
  const acoesDaParada = proxima && (
    <AcoesDaParada
      parada={proxima}
      ida={ida}
      ocupado={registrando || !podeRegistrar}
      aoRegistrar={(acoes) => void registrar(acoes)}
      embarcou={embarcou}
      faltou={faltou}
      desceu={desceu}
    />
  )

  // Turnos do dia: só o da hora do aparelho fica liberado. No celular ficam por cima do mapa.
  const chipsTurnos = doTurno.length > 1 && (
    // Centralizados no celular; se não couberem, rolam para o lado sem cortar o primeiro.
    <div className="[scrollbar-width:none] overflow-x-auto px-3 pb-1 lg:px-0">
      <div className="mx-auto flex w-max gap-2 lg:mx-0">
      {doTurno.map((j) => {
        const ativa = atual && chaveTexto(j) === chaveTexto(atual)
        const motivo = trava(j)
        return (
          <button
            key={chaveTexto(j)}
            onClick={() => setEscolhida(chaveTexto(j))}
            disabled={motivo !== null}
            title={motivo ?? undefined}
            className={`flex shrink-0 items-center gap-2 rounded-2xl px-3 py-1.5 text-left text-sm font-bold shadow-md transition-colors ${
              ativa ? 'bg-marinho text-white' : motivo ? 'cursor-not-allowed bg-white/85 text-slate-400' : 'bg-white text-marinho hover:ring-2 hover:ring-laranja/50'
            }`}
          >
            {motivo && <Icone nome="cadeado" className="h-3.5 w-3.5" />}
            {j.status === 'em_andamento' && <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />}
            {j.status === 'concluida' && <Icone nome="ok" className="h-3.5 w-3.5" />}
            <span className="leading-tight">
              {ROTULOS_TURNO[j.chave.turno]} · {j.chave.sentido === 'ida' ? 'Ida' : 'Volta'}
              <span className={`block text-[11px] font-semibold ${ativa ? 'text-white/70' : 'text-slate-400'}`}>{motivo ?? formatarHorario(j.horario_previsto)}</span>
            </span>
          </button>
        )
      })}
      </div>
    </div>
  )
  const linhaProxima = trajeto ? (posicao ? linhaRestante(trajeto.linha, posicao) : trajeto.linha) : null

  return (
    // No celular a tela vai de ponta a ponta (mapa grande, cards por cima, como app de corrida).
    <div className="-mx-4 -mt-5 sm:-mx-6 lg:mx-0 lg:mt-0 lg:space-y-4">
      {/* Cabeçalho (computador) */}
      <div className="hidden items-end justify-between gap-3 lg:flex">
        <div>
          <p className="text-sm font-semibold text-slate-500">
            {diaDaSemana(hoje).replace(/^./, (c) => c.toUpperCase())}, {formatarData(hoje)}
          </p>
          <h1 className="text-2xl font-extrabold text-marinho">
            {saudacao}, {primeiroNome}
          </h1>
        </div>
        <Link to="/chamadas" className="flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-bold text-laranja shadow-sm ring-1 ring-slate-200/70 hover:ring-laranja/50">
          <Icone nome="chamada" className="h-4 w-4" />
          Quem não vai
        </Link>
      </div>
      <div className="hidden lg:block">{chipsTurnos}</div>

      {viagens.carregando && !viagens.dados ? (
        <div className="h-[70dvh] animate-pulse bg-white lg:rounded-2xl" />
      ) : viagens.erro ? (
        <p className="m-4 rounded-2xl bg-red-50 p-5 text-sm font-semibold text-red-700 lg:m-0">{viagens.erro}</p>
      ) : !atual ? (
        <div className="m-4 grid min-h-[60dvh] place-items-center rounded-2xl bg-white ring-1 ring-slate-200/70 lg:m-0">
          <EstadoVazio
            icone="van"
            tom="laranja"
            titulo={`${saudacao}, ${primeiroNome}`}
            descricao={
              proximoTurno
                ? `Nenhuma viagem neste horário. A próxima é a ${ROTULOS_TURNO[proximoTurno.chave.turno].toLowerCase()} (${proximoTurno.chave.sentido}), que ${foraDoHorario(jornadas, proximoTurno, agora)!.toLowerCase()}.`
                : jornadas.length
                  ? 'Suas viagens de hoje já terminaram. Bom descanso!'
                  : 'Nenhuma viagem sua hoje. Quando houver, a rota aparece aqui com o mapa, a ordem das paradas e a navegação.'
            }
          />
        </div>
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-4">
          {/* Mapa */}
          <div className="relative overflow-hidden bg-white lg:sticky lg:top-6 lg:self-start lg:rounded-2xl lg:shadow-sm lg:ring-1 lg:ring-slate-200/70">
            {/* A altura fica no invólucro: o Leaflet só lê a classe do mapa quando ele é criado. */}
            <div className={`${mapaCheio ? 'h-[calc(100dvh-8.5rem)]' : 'h-[58dvh]'} transition-[height] duration-300 lg:h-[calc(100dvh-13rem)] lg:min-h-[480px]`}>
            <MapaBase className="h-full" zoom={13} seguindo>
              {posicao && seguir && emAndamento ? (
                <SeguirPosicao posicao={posicao} />
              ) : (
                <Enquadrar pontos={pontosRota} chave={`${chaveJson}|${comPonto.length}|${posicao ? 1 : 0}|${seguir}|${mapaCheio}`} />
              )}
              {pontosRota.length > 1 && (
                <>
                  {restoDaViagem.length > 1 && (
                    <LinhaDirecional pontos={trajetoResto?.linha ?? restoDaViagem} cor="#f59e6b" tracejada={!trajetoResto} opacidade={0.55} mostrarSetas={false} />
                  )}
                  <LinhaDirecional pontos={linhaProxima ?? trechoProximo} cor="#f2600c" tracejada={!linhaProxima} />
                </>
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
            </div>
            {/* Topo do mapa: turnos (celular) e o resumo do trajeto */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[400] bg-gradient-to-b from-marinho-escuro/35 to-transparent pt-[max(0.75rem,env(safe-area-inset-top))] pb-8 lg:bg-none lg:pt-3">
              <div className="pointer-events-auto lg:hidden">{chipsTurnos}</div>
              {!chegou && (trajeto || tracando) && (
                <span className="mt-2 ml-3 inline-block rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-marinho shadow lg:mt-0">
                  {trajeto ? `${trajeto.distanciaKm.toFixed(1).replace('.', ',')} km · ${Math.max(1, Math.round(trajeto.duracaoMin))} min até a próxima` : 'Traçando...'}
                </span>
              )}
            </div>
            <div className="absolute right-3 bottom-9 z-[400] flex flex-col items-end gap-2 lg:bottom-3">
              {erroGps && <span className="max-w-60 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 shadow">{erroGps}</span>}
              {posicao && emAndamento && (
                <button
                  onClick={() => setSeguir(!seguir)}
                  aria-label={seguir ? 'Ver rota inteira' : 'Seguir minha posição'}
                  title={seguir ? 'Ver rota inteira' : 'Seguir minha posição'}
                  className="grid h-11 w-11 place-items-center rounded-full bg-white text-marinho shadow-lg"
                >
                  <Icone nome={seguir ? 'rota' : 'navegar'} className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={() => setUsarGps(!usarGps)}
                className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold shadow-lg ${usarGps ? 'bg-sky-500 text-white' : 'bg-white text-marinho'}`}
              >
                {usarGps && posicao ? <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> : <Icone nome="pino" className="h-4 w-4" />}
                {usarGps ? (posicao ? 'GPS ligado' : 'Buscando GPS...') : 'Ligar GPS'}
              </button>
            </div>
          </div>

          {/* Gaveta (celular) / coluna (computador): uma ação principal por vez */}
          <aside className="relative z-10 -mt-6 flex flex-col gap-3 rounded-t-3xl bg-fundo px-4 pt-3 pb-4 shadow-[0_-12px_30px_-12px_rgba(16,45,64,0.35)] lg:mt-0 lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none">
            {/* Tracinho: toque ou arraste para baixo = mapa inteiro; para cima = volta a gaveta */}
            <button
              type="button"
              onClick={() => alternarMapa(!mapaCheio)}
              onTouchStart={(e) => (toqueInicio.current = e.touches[0].clientY)}
              onTouchEnd={(e) => {
                const inicio = toqueInicio.current
                toqueInicio.current = null
                if (inicio === null) return
                const arrasto = e.changedTouches[0].clientY - inicio
                if (Math.abs(arrasto) < 30) return // toque simples: o onClick resolve
                e.preventDefault()
                alternarMapa(arrasto > 0)
              }}
              aria-label={mapaCheio ? 'Mostrar a viagem' : 'Ver o mapa inteiro'}
              aria-expanded={!mapaCheio}
              className="-mx-4 -mt-3 flex touch-none flex-col items-center gap-2 px-4 pt-3 pb-1 lg:hidden"
            >
              <span className="h-1.5 w-12 rounded-full bg-slate-300" />
              <span className="w-full text-left text-sm font-bold text-slate-500">
                {mapaCheio ? (
                  <span className="flex items-center justify-between">
                    <span className="text-marinho">
                      {proxima && emAndamento ? `Próxima: ${proxima.titulo}` : `${ROTULOS_TURNO[atual.chave.turno]} · ${ida ? 'Ida' : 'Volta'}`}
                    </span>
                    <span className="text-xs text-laranja">Ver viagem ↑</span>
                  </span>
                ) : (
                  <>
                    {saudacao}, <span className="text-marinho">{primeiroNome}</span> · {formatarData(hoje)}
                  </>
                )}
              </span>
            </button>
            <div className={`flex flex-col gap-3 ${mapaCheio ? 'hidden lg:flex' : ''}`}>
            {erro && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{erro}</p>}

            {atual.status === 'agendada' && (
              <section className="rounded-2xl bg-marinho p-5 text-white shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold tracking-widest text-white/60 uppercase">
                      {ROTULOS_TURNO[atual.chave.turno]} · {ida ? 'Ida' : 'Volta'}
                    </p>
                    <p className="mt-1 text-4xl font-extrabold tabular-nums">{formatarHorario(atual.horario_previsto)}</p>
                    <p className="text-xs text-white/60">saída prevista</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold tabular-nums">{total} passageiro(s)</p>
                    <p className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold tabular-nums">{atual.viagens.length} destino(s)</p>
                  </div>
                </div>
                <p className="mt-3 truncate text-xs text-white/60">{atual.veiculos.map((v) => `${v.placa} · ${v.modelo}`).join(' / ')}</p>
                {atual.passageiros.nao_vai > 0 && <p className="mt-1 text-xs font-semibold text-amber-300">{atual.passageiros.nao_vai} avisaram que não vão</p>}
                {travaAtual ? (
                  <p className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-white/10 py-4 text-sm font-bold text-white/70">
                    <Icone nome="cadeado" className="h-4 w-4" />
                    {travaAtual}
                  </p>
                ) : (
                  <Botao onClick={() => setAberto('iniciar')} className="mt-4 w-full py-4 text-base">
                    <Icone nome="van" className="h-5 w-5" />
                    {ida ? 'Iniciar ida' : 'Iniciar volta'}
                  </Botao>
                )}
              </section>
            )}

            {/* Próxima parada (viagem em andamento) */}
            {emAndamento && proxima && (
              <section className={`rounded-2xl bg-white p-4 shadow-sm ring-2 transition-colors ${chegou ? 'ring-emerald-400' : 'ring-transparent'}`}>
                <div className="flex items-center gap-3">
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${chegou ? 'bg-emerald-100 text-emerald-600' : 'bg-laranja/10 text-laranja'}`}>
                    <Icone nome={proxima.tipo === 'faculdade' ? 'escola' : 'passageiros'} className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[11px] font-bold tracking-widest uppercase ${chegou ? 'text-emerald-600' : 'text-laranja'}`}>
                      {chegou ? 'Você chegou' : `Próxima · ${proxima.acao === 'buscar' ? 'buscar' : 'deixar'}`}
                    </p>
                    <p className="truncate text-lg leading-tight font-extrabold text-marinho">{proxima.titulo}</p>
                    <p className="truncate text-xs text-slate-500">{proxima.detalhe}</p>
                  </div>
                  {distanciaProxima !== null && !chegou && (
                    <span className="shrink-0 rounded-full bg-fundo px-2.5 py-1 text-xs font-extrabold text-marinho tabular-nums">{formatarDistancia(distanciaProxima)}</span>
                  )}
                </div>
                {!proxima.ponto && (
                  <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-700">Endereço sem localização no mapa: confira com o administrador.</p>
                )}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {proxima.ponto && (
                    <button
                      onClick={() => {
                        setUsarGps(true)
                        setNavegando(true)
                      }}
                      className={`flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold shadow-lg ${
                        chegou ? 'bg-white text-sky-700 ring-1 ring-sky-200' : 'bg-sky-600 text-white shadow-sky-600/25 hover:bg-sky-700'
                      }`}
                    >
                      <Icone nome="navegar" className="h-4 w-4" />
                      Navegar
                    </button>
                  )}
                  <button
                    onClick={() => setRegistroManual(true)}
                    disabled={!podeRegistrar}
                    title={podeRegistrar ? undefined : 'Libera quando você chegar na parada'}
                    className={`flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold ${proxima.ponto ? '' : 'col-span-2'} ${
                      podeRegistrar ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-600' : 'bg-fundo text-slate-400'
                    }`}
                  >
                    <Icone nome={podeRegistrar ? 'ok' : 'cadeado'} className="h-4 w-4" />
                    Registrar
                  </button>
                </div>
                {!podeRegistrar && <p className="mt-2 text-center text-[11px] text-slate-400">O registro libera quando você chegar na parada.</p>}
              </section>
            )}

            {/* Andamento da viagem e emergência */}
            {emAndamento && (
              <section className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
                <button onClick={() => setAberto('embarque')} className="min-w-0 flex-1 rounded-xl px-1 py-1 text-left hover:bg-fundo">
                  <span className="flex justify-between text-xs font-bold text-slate-500">
                    <span>
                      {ROTULOS_TURNO[atual.chave.turno]} · {ida ? 'Ida' : 'Volta'} · registrados
                    </span>
                    <span className="text-marinho tabular-nums">
                      {atendidos}/{total}
                    </span>
                  </span>
                  <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-fundo">
                    <span className="block h-full rounded-full bg-laranja transition-all" style={{ width: `${total ? (atendidos / total) * 100 : 0}%` }} />
                  </span>
                  <span className="mt-1 block text-[11px] font-semibold text-slate-400">Toque para ver a lista completa</span>
                </button>
                <button
                  onClick={() => setConfirmarEncerrar(true)}
                  aria-label="Emergência: encerrar a viagem"
                  title="Emergência: encerrar a viagem"
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-red-50 text-red-500 ring-1 ring-red-100 hover:bg-red-100"
                >
                  <Icone nome="alerta" className="h-5 w-5" />
                </button>
              </section>
            )}

            {jornada && !proxima && atual.status !== 'agendada' && (
              <section className="rounded-2xl bg-white p-5 text-center shadow-sm">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                  <Icone nome="ok" className="h-6 w-6" />
                </span>
                <p className="mt-2 font-extrabold text-marinho">{atual.status === 'concluida' ? 'Viagem concluída' : 'Nenhuma parada pendente'}</p>
                <p className="text-sm text-slate-500">
                  {atual.status === 'concluida' ? `${atendidos}/${total} passageiros registrados. Bom trabalho!` : 'Todos os passageiros foram atendidos.'}
                </p>
              </section>
            )}

            {/* Ordem das paradas */}
            {paradas.length > (emAndamento ? 1 : 0) && (
              <section className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="mb-2 px-1 text-xs font-bold tracking-widest text-slate-400 uppercase">
                  {emAndamento ? `Depois (${paradas.length - 1})` : `Paradas (${paradas.length})`}
                </p>
                <ol className="max-h-72 space-y-1 overflow-y-auto">
                  {paradas.slice(emAndamento ? 1 : 0).map((p, i) => (
                    <li key={p.chave} className="flex items-center gap-3 rounded-xl px-1 py-2">
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                          p.tipo === 'faculdade' ? 'bg-marinho text-white' : 'bg-laranja/10 text-laranja'
                        }`}
                      >
                        {p.tipo === 'faculdade' ? <Icone nome="escola" className="h-3.5 w-3.5" /> : i + (emAndamento ? 2 : 1)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-marinho">{p.titulo}</p>
                        <p className="truncate text-xs text-slate-500">{p.detalhe}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            </div>
          </aside>
        </div>
      )}

      {navegando && proxima && emAndamento && (
        <ModoNavegacao
          posicao={posicao}
          rumo={rumo}
          erroGps={erroGps}
          parada={proxima}
          restantes={paradas.length - 1}
          aoSair={() => setNavegando(false)}
          aoEncerrar={() => setConfirmarEncerrar(true)}
          aoRegistrar={() => setRegistroManual(true)}
        />
      )}
      {popupParada && proxima && (
        <PopupParada
          parada={proxima}
          chegou={chegou}
          acoes={acoesDaParada}
          aoFechar={() => {
            setRegistroManual(false)
            setPopupFechadoEm(proxima.chave)
          }}
        />
      )}
      {import.meta.env.DEV &&
        jornada &&
        // Portal: a animação de entrada da página (transform) prenderia o "fixed" dentro dela.
        createPortal(
        <div className="fixed top-1/2 left-1 z-[1040] flex -translate-y-1/2 flex-col items-stretch gap-0.5 rounded-2xl bg-slate-900/80 p-1 text-center text-[11px] font-bold text-white shadow-xl">
          <span className="px-1.5 text-[9px] tracking-widest text-white/60 uppercase">Sim</span>
          {simulando && (
            <>
              {[0, 40, 80, 200].map((v) => (
                <button
                  key={v}
                  onClick={() => setVelocidadeSim(v)}
                  className={`shrink-0 rounded-full px-2 py-1 ${velocidadeSim === v ? 'bg-laranja' : 'hover:bg-white/10'}`}
                >
                  {v === 0 ? 'Pausa' : v}
                </button>
              ))}
              <button onClick={sim.chegar} className="shrink-0 rounded-full px-2 py-1 hover:bg-white/10" title="Pular para a próxima parada">
                Chegar
              </button>
            </>
          )}
          <button
            onClick={() => setSimulando(!simulando)}
            className={`shrink-0 rounded-full px-3 py-1 ${simulando ? 'bg-red-500' : 'bg-emerald-500'}`}
          >
            {simulando ? 'Parar' : 'Simular'}
          </button>
        </div>
      ,
          document.body,
        )}
      {confirmarEncerrar && jornada && (
        <ModalEmergencia
          pendentes={jornada.fila.filter((c) => c.status === 'pendente').length}
          aBordo={jornada.fila.filter(estaABordo).length}
          aoConfirmar={(motivo) => void encerrarViagem(motivo)}
          aoFechar={() => setConfirmarEncerrar(false)}
        />
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

type Acao = (c: ChamadaDaJornada) => () => Promise<unknown>

/** Botões de registro da parada da vez, sem sair do mapa. */
function AcoesDaParada({
  parada,
  ida,
  ocupado,
  aoRegistrar,
  embarcou,
  faltou,
  desceu,
}: {
  parada: ParadaRestante
  ida: boolean
  ocupado: boolean
  aoRegistrar: (acoes: (() => Promise<unknown>)[]) => void
  embarcou: Acao
  faltou: Acao
  desceu: Acao
}) {
  const botao = 'flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-colors disabled:opacity-50'
  // Casa: buscar (ida) ou deixar (volta) uma pessoa.
  if (parada.tipo === 'passageiro') {
    const c = parada.passageiros[0]
    return parada.acao === 'buscar' ? (
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button disabled={ocupado} onClick={() => aoRegistrar([faltou(c)])} className={`${botao} bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50`}>
          Não embarcou
        </button>
        <button disabled={ocupado} onClick={() => aoRegistrar([embarcou(c)])} className={`${botao} bg-laranja text-white shadow-lg shadow-laranja/25 hover:bg-laranja-claro`}>
          <Icone nome="ok" className="h-4 w-4" />
          Embarcou
        </button>
      </div>
    ) : (
      <button
        disabled={ocupado}
        onClick={() => aoRegistrar([desceu(c)])}
        className={`${botao} mt-4 w-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-600`}
      >
        <Icone nome="ok" className="h-4 w-4" />
        Desceu em casa
      </button>
    )
  }
  // Faculdade na ida: todos que estão a bordo descem aqui.
  if (ida) {
    const aBordo = parada.passageiros.filter(estaABordo)
    return (
      <button
        disabled={ocupado || aBordo.length === 0}
        onClick={() => aoRegistrar(aBordo.map((c) => desceu(c)))}
        className={`${botao} mt-4 w-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-600`}
      >
        <Icone nome="ok" className="h-4 w-4" />
        Todos desceram aqui ({aBordo.length})
      </button>
    )
  }
  // Faculdade na volta: embarque um por um.
  const pendentes = parada.passageiros.filter((c) => c.status === 'pendente')
  return (
    <div className="mt-4 space-y-2">
      <ul className="max-h-56 space-y-1.5 overflow-y-auto">
        {pendentes.map((c) => (
          <li key={`${c.fk_viagem}-${c.estudante.id}`} className="flex items-center gap-2 rounded-xl bg-fundo/70 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-marinho">{c.estudante.apelido || c.estudante.nome}</span>
            <button disabled={ocupado} onClick={() => aoRegistrar([faltou(c)])} className="rounded-lg px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50">
              Faltou
            </button>
            <button disabled={ocupado} onClick={() => aoRegistrar([embarcou(c)])} className="rounded-lg bg-laranja px-3 py-1 text-xs font-bold text-white">
              Embarcou
            </button>
          </li>
        ))}
      </ul>
      {pendentes.length > 1 && (
        <button
          disabled={ocupado}
          onClick={() => aoRegistrar(pendentes.map((c) => embarcou(c)))}
          className={`${botao} w-full bg-laranja text-white hover:bg-laranja-claro`}
        >
          Todos embarcaram ({pendentes.length})
        </button>
      )}
    </div>
  )
}

/** Ligar e WhatsApp do passageiro, discretos embaixo das ações. */
function ContatoParada({ celular }: { celular: string }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <a href={`tel:${soDigitos(celular)}`} className="flex items-center justify-center rounded-xl bg-fundo py-2.5 text-sm font-bold text-marinho hover:bg-slate-200">
        Ligar
      </a>
      <a
        href={`https://wa.me/55${soDigitos(celular)}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center rounded-xl bg-emerald-50 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-100"
      >
        WhatsApp
      </a>
    </div>
  )
}

/**
 * Popup da parada: sobe de baixo (também por cima do GPS em tela cheia) quando a van chega, ou
 * pelo botão "Registrar". Registrando, a parada some e ele fecha sozinho.
 */
function PopupParada({ parada, chegou, acoes, aoFechar }: { parada: ParadaRestante; chegou: boolean; acoes: ReactNode; aoFechar: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[1050] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={parada.titulo}>
      <div onClick={aoFechar} className="absolute inset-0 animate-aparecer bg-marinho-escuro/40" />
      <div className="relative max-h-[88dvh] w-full max-w-md animate-surgir overflow-y-auto rounded-t-3xl bg-white px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pt-5">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
        <div className="flex items-center gap-3">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${chegou ? 'bg-emerald-100 text-emerald-600' : 'bg-laranja/10 text-laranja'}`}>
            <Icone nome={chegou ? 'ok' : parada.tipo === 'faculdade' ? 'escola' : 'passageiros'} className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className={`text-xs font-bold tracking-widest uppercase ${chegou ? 'text-emerald-600' : 'text-laranja'}`}>
              {chegou ? 'Você chegou' : 'Registrar parada'} · {parada.acao === 'buscar' ? 'buscar' : 'deixar'}
            </p>
            <p className="truncate text-xl font-extrabold text-marinho">{parada.titulo}</p>
            <p className="truncate text-sm text-slate-500">{parada.detalhe}</p>
          </div>
          <button onClick={aoFechar} aria-label="Fechar" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-fundo">
            <Icone nome="fechar" className="h-5 w-5" />
          </button>
        </div>
        {acoes}
        {parada.celular && <ContatoParada celular={parada.celular} />}
      </div>
    </div>,
    document.body,
  )
}
