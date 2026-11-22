import L from 'leaflet'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Marker, Polyline, useMap, useMapEvents } from 'react-leaflet'

import Icone from '../../shared/components/Icon.tsx'
import type { Coordenada } from '../area/types.ts'
import { LinhaDirecional, MapaBase } from '../mapa/MapLayers.tsx'
import { iconeInstituicao } from '../mapa/mapUtils.ts'
import { formatarMetros, instrucao, linhaRestante, metrosEntre, rumoEntre, useRotaNavegacao, type Manobra } from '../mapa/navigationService.ts'
import type { ParadaRestante } from './myRoute.ts'

/** Ângulo da seta de cada manobra (0 = em frente). */
const ANGULO: Record<string, number> = {
  left: -90,
  right: 90,
  'slight left': -45,
  'slight right': 45,
  'sharp left': -135,
  'sharp right': 135,
  uturn: 180,
  straight: 0,
}

/** Seta grande da manobra (ou bandeira na chegada). */
function SetaManobra({ manobra, className = 'h-10 w-10' }: { manobra: Manobra; className?: string }) {
  if (manobra.tipo === 'arrive') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
      </svg>
    )
  }
  if (manobra.tipo.includes('roundabout') || manobra.tipo === 'rotary') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="13" r="4" />
        <path d="M12 21v-4M16 13h4M12 9V3M9 6l3-3 3 3" />
      </svg>
    )
  }
  const angulo = ANGULO[manobra.modificador ?? 'straight'] ?? 0
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${angulo}deg)` }}>
      <path d="M12 21V5M5 11l7-7 7 7" />
    </svg>
  )
}

/** Posição do motorista: seta apontando para onde ele vai (ou bolinha, sem direção). */
function iconeVan(rumo: number | null) {
  const html =
    rumo === null
      ? '<div class="nav-posicao"></div>'
      : `<div class="nav-seta" style="transform:rotate(${rumo}deg)"><svg viewBox="0 0 24 24"><path d="M12 2l7 19-7-4-7 4z"/></svg></div>`
  return L.divIcon({ className: '', html, iconSize: [36, 36], iconAnchor: [18, 18] })
}

/** Balão da próxima manobra, preso no ponto da curva: seta + nome da rua. */
function iconeBalao(m: Manobra) {
  const angulo = ANGULO[m.modificador ?? 'straight'] ?? 0
  const seta =
    m.tipo === 'arrive'
      ? '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'
      : `<g style="transform:rotate(${angulo}deg);transform-origin:12px 12px"><path d="M12 21V5M5 11l7-7 7 7"/></g>`
  const rua = (m.rua || (m.tipo === 'arrive' ? 'Parada' : 'Siga')).replace(/[&<>"']/g, '')
  return L.divIcon({
    className: '',
    html: `<div class="nav-balao"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${seta}</svg><span>${rua}</span></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

function iconeDestino() {
  return L.divIcon({ className: '', html: '<div class="pino pino-proxima"><span>●</span></div>', iconSize: [34, 34], iconAnchor: [17, 41] })
}

/** Mapa colado no motorista, mais perto que o normal; arrastar o mapa solta o acompanhamento. */
function Acompanhar({ posicao, ativo, aoArrastar }: { posicao: Coordenada; ativo: boolean; aoArrastar: () => void }) {
  const mapa = useMap()
  useMapEvents({ dragstart: aoArrastar })
  useEffect(() => {
    if (ativo) mapa.setView(posicao, Math.max(mapa.getZoom(), 17), { animate: true })
  }, [mapa, posicao, ativo])
  return null
}

/** Remede o mapa quando a caixa dele muda de tamanho (entrar/sair do 3D). */
function Remedir({ chave }: { chave: boolean }) {
  const mapa = useMap()
  useEffect(() => {
    mapa.invalidateSize()
  }, [mapa, chave])
  return null
}

/**
 * Visão 3D (como Uber/Waze): o mapa deitado em perspectiva e girado para a frente da van ficar
 * para cima. A caixa do mapa é maior que a tela, para o "horizonte" ter ruas carregadas, e a van
 * fica a ~65% da altura. Pinos e balões giram de volta (--giro) para não ficarem tortos.
 * shortcut: CSS 3D sobre o Leaflet, sem prédios; se quiser 3D de verdade, trocar por MapLibre GL.
 */
function estiloMapa3d(inclinado: boolean, giro: number): CSSProperties {
  if (!inclinado) return { inset: 0 }
  return {
    left: '-70%',
    width: '240%',
    top: '-65%',
    height: '260%',
    transform: `perspective(1000px) rotateX(50deg) rotate(${-giro}deg)`,
    transition: 'transform 0.8s ease-out',
    ['--giro' as string]: `${giro}deg`,
  }
}

/** "800 metros" / "1,2 quilômetros", para a voz. */
const metrosFalados = (m: number) => formatarMetros(m).replace(' km', ' quilômetros').replace(' m', ' metros')

/** O que o motorista faz na parada, em uma frase ("Hora de buscar Ana", "Desembarque na UVV"). */
function oQueFazer(p: ParadaRestante): string {
  if (p.tipo === 'faculdade') return `${p.acao === 'buscar' ? 'Embarque' : 'Desembarque'} na ${p.titulo}`
  return `Hora de ${p.acao === 'buscar' ? 'buscar' : 'deixar'} ${p.titulo}`
}

/** Fala em português (se o aparelho tiver voz). */
function falar(texto: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const fala = new SpeechSynthesisUtterance(texto)
  fala.lang = 'pt-BR'
  fala.rate = 1.05
  window.speechSynthesis.speak(fala)
}

interface Propriedades {
  posicao: Coordenada | null
  rumo: number | null
  erroGps: string | null
  parada: ParadaRestante
  /** Quantas paradas faltam depois desta. */
  restantes: number
  /** Abre o registro da parada (Embarcou, Desceu...). Sem ele, a viagem ainda não começou. */
  aoRegistrar?: () => void
  aoSair: () => void
  /** Emergência: encerrar a viagem agora (a tela pede o motivo antes). */
  aoEncerrar?: () => void
}

/**
 * Navegação dentro do site, em tela cheia (como Waze/Google Maps, mas sem sair do UniVan):
 * instrução da próxima manobra no topo, mapa seguindo a van e, embaixo, a parada com os botões
 * de registro. A rota é refeita conforme a van anda; registrando a parada, segue para a próxima.
 */
export default function ModoNavegacao({ posicao, rumo, erroGps, parada, restantes, aoRegistrar, aoSair, aoEncerrar }: Propriedades) {
  const destino = parada.ponto
  const { rota } = useRotaNavegacao(posicao, destino)
  const [voz, setVoz] = useState(() => localStorage.getItem('univan.vozNavegacao') !== '0')
  const [seguir, setSeguir] = useState(true)
  const [tresD, setTresD] = useState(() => localStorage.getItem('univan.nav3d') !== '0')
  const inclinado = tresD && seguir && posicao !== null
  // Giro acumulado: de 350° para 10° gira 20°, não 340° para trás.
  const giro = useRef(0)
  const rumoVan = rumo ?? rota?.rumoInicial ?? null
  if (rumoVan !== null) giro.current += ((((rumoVan - giro.current) % 360) + 540) % 360) - 180
  const distanciaReta = posicao && destino ? metrosEntre(posicao, destino) : null
  // Mesmo raio da tela "Minha rota": só perto assim o registro da parada libera.
  const chegou = distanciaReta !== null && distanciaReta <= 80
  const linha = rota ? (posicao ? linhaRestante(rota.linha, posicao) : rota.linha) : null

  // Tela sempre acesa enquanto navega (se o aparelho permitir).
  useEffect(() => {
    let trava: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock
      ?.request('screen')
      .then((t) => (trava = t))
      .catch(() => undefined)
    return () => {
      void trava?.release()
      window.speechSynthesis?.cancel()
    }
  }, [])

  // Voz: diz para onde vai ao começar cada parada, cada manobra nova (e de novo perto dela) e,
  // na chegada, o que fazer ali.
  const texto = rota ? instrucao(rota.proxima) : null
  const avisado = useRef<{ parada: string; texto: string; perto: boolean } | null>(null)
  useEffect(() => {
    if (!voz) return
    if (chegou) {
      if (avisado.current?.texto !== 'chegou' || avisado.current.parada !== parada.chave) {
        falar(`Você chegou. ${oQueFazer(parada)}.`)
        avisado.current = { parada: parada.chave, texto: 'chegou', perto: true }
      }
      return
    }
    if (!rota || !texto) return
    const perto = rota.distanciaAteManobraM <= 150
    if (avisado.current?.parada !== parada.chave) {
      falar(`Próxima parada: ${oQueFazer(parada).replace(/^Hora de /, '')}, a ${metrosFalados(rota.distanciaM)}. ${texto}.`)
      avisado.current = { parada: parada.chave, texto, perto }
    } else if (avisado.current.texto !== texto) {
      falar(`Em ${metrosFalados(rota.distanciaAteManobraM)}, ${texto}`)
      avisado.current = { parada: parada.chave, texto, perto }
    } else if (perto && !avisado.current.perto) {
      falar(texto)
      avisado.current = { parada: parada.chave, texto, perto: true }
    }
  }, [voz, texto, rota, chegou, parada])

  const chegada = useMemo(() => {
    if (!rota) return null
    const quando = new Date(Date.now() + rota.duracaoS * 1000)
    return `${String(quando.getHours()).padStart(2, '0')}:${String(quando.getMinutes()).padStart(2, '0')}`
  }, [rota])

  const centro = posicao ?? destino

  // Portal no <body>: a animação de entrada da página (transform) prenderia o "fixed" dentro dela.
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex h-dvh flex-col bg-marinho">
      {/* Instrução da próxima manobra */}
      <div className={`relative z-10 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-white shadow-lg ${chegou ? 'bg-emerald-600' : 'bg-marinho'}`}>
        {chegou ? (
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15">
              <Icone nome="ok" className="h-8 w-8" />
            </span>
            <div className="min-w-0">
              <p className="text-2xl leading-tight font-extrabold">Você chegou</p>
              <p className="truncate text-sm text-white/80">{parada.titulo}</p>
            </div>
          </div>
        ) : rota ? (
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-laranja shadow-lg shadow-black/20">
              <SetaManobra manobra={rota.proxima} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-3xl leading-none font-extrabold tabular-nums">{formatarMetros(rota.distanciaAteManobraM)}</p>
              <p className="mt-1 text-base leading-snug font-semibold text-white/90">{instrucao(rota.proxima)}</p>
            </div>
          </div>
        ) : posicao && destino && distanciaReta !== null ? (
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-laranja/80">
              <svg
                viewBox="0 0 24 24"
                className="h-9 w-9"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transform: `rotate(${rumoEntre(posicao, destino) - (rumo ?? 0)}deg)` }}
              >
                <path d="M12 21V5M5 11l7-7 7 7" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-3xl leading-none font-extrabold tabular-nums">{formatarMetros(distanciaReta)}</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-white/80">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white/70" />
                Em linha reta até {parada.titulo} · buscando as ruas
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 animate-pulse place-items-center rounded-2xl bg-white/10">
              <Icone nome="navegar" className="h-7 w-7" />
            </span>
            <p className="text-base font-semibold text-white/80">{erroGps ?? 'Aguardando o GPS do celular...'}</p>
          </div>
        )}
        {rota?.seguinte && !chegou && rota.proxima.tipo !== 'arrive' && (
          <p className="mt-2 flex items-center gap-2 text-xs text-white/60">
            Depois:
            <SetaManobra manobra={rota.seguinte} className="h-4 w-4" />
            {instrucao(rota.seguinte)}
          </p>
        )}
      </div>

      {/* Mapa */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#dfe6ec]">
        {centro && (
          <div className={`absolute ${inclinado ? 'nav-3d' : ''}`} style={estiloMapa3d(inclinado, giro.current)}>
            <MapaBase className="h-full" zoom={17} seguindo>
              <Remedir chave={inclinado} />
              {posicao && <Acompanhar posicao={posicao} ativo={seguir} aoArrastar={() => setSeguir(false)} />}
              {rota ? (
                <>
                  {/* Linha azul grossa de GPS, com contorno branco */}
                  <Polyline positions={linha!} pathOptions={{ color: '#ffffff', weight: 12, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }} />
                  <Polyline positions={linha!} pathOptions={{ color: '#1d4ed8', weight: 7, opacity: 1, lineCap: 'round', lineJoin: 'round' }} />
                  {rota.proxima.local && !chegou && (
                    <Marker position={rota.proxima.local} icon={iconeBalao(rota.proxima)} interactive={false} zIndexOffset={1500} />
                  )}
                </>
              ) : (
                posicao && destino && <LinhaDirecional pontos={[posicao, destino]} cor="#1d4ed8" tracejada mostrarSetas={false} opacidade={0.6} />
              )}
              {destino &&
                (parada.tipo === 'faculdade' ? (
                  <Marker position={destino} icon={iconeInstituicao('#f2600c')} />
                ) : (
                  <Marker position={destino} icon={iconeDestino()} />
                ))}
              {/* Seta da van: direção do GPS; parado (sem direção), o rumo da rota */}
              {posicao && <Marker position={posicao} icon={iconeVan(rumoVan)} zIndexOffset={2000} />}
            </MapaBase>
          </div>
        )}
        {/* Horizonte do 3D: esmaece o fundo distante, como nos apps de corrida */}
        {inclinado && <div className="pointer-events-none absolute inset-x-0 top-0 z-[300] h-1/4 bg-gradient-to-b from-[#dfe6ec] to-transparent" />}
        <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2">
          {aoEncerrar && (
            <button
              onClick={aoEncerrar}
              aria-label="Emergência: encerrar a viagem"
              title="Emergência: encerrar a viagem"
              className="grid h-11 w-11 place-items-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30"
            >
              <Icone nome="alerta" className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={() => {
              setTresD(!tresD)
              localStorage.setItem('univan.nav3d', tresD ? '0' : '1')
            }}
            aria-label={tresD ? 'Ver mapa plano' : 'Ver mapa em 3D'}
            className={`grid h-11 w-11 place-items-center rounded-full text-xs font-extrabold shadow-lg ${tresD ? 'bg-white text-marinho' : 'bg-slate-200 text-slate-500'}`}
          >
            {tresD ? '3D' : '2D'}
          </button>
          <button
            onClick={() => {
              const nova = !voz
              setVoz(nova)
              localStorage.setItem('univan.vozNavegacao', nova ? '1' : '0')
              if (!nova) window.speechSynthesis?.cancel()
            }}
            aria-label={voz ? 'Desligar voz' : 'Ligar voz'}
            className={`grid h-11 w-11 place-items-center rounded-full shadow-lg ${voz ? 'bg-white text-marinho' : 'bg-slate-200 text-slate-400'}`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6 9H2v6h4l5 4V5z" />
              {voz ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /> : <path d="M22 9l-6 6M16 9l6 6" />}
            </svg>
          </button>
        </div>
        {posicao && (
          <button
            onClick={() => setSeguir(true)}
            aria-label="Recentralizar no veículo"
            title="Recentralizar"
            className={`absolute right-3 bottom-8 z-[400] grid h-14 w-14 place-items-center rounded-full shadow-xl transition-colors ${
              seguir ? 'bg-white text-[#1d4ed8]' : 'animate-pulse bg-[#1d4ed8] text-white'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              <circle cx="12" cy="12" r="7" />
            </svg>
          </button>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[300] h-6 bg-gradient-to-t from-black/10 to-transparent" />
      </div>

      {/* Parada de destino: compacta, para o mapa ficar grande no celular */}
      <div className="relative z-10 rounded-t-3xl bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-10px_rgba(0,0,0,0.3)] sm:px-5">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-bold tracking-widest text-laranja uppercase">
              {parada.acao === 'buscar' ? 'Buscar' : 'Deixar'} · {restantes > 0 ? `mais ${restantes} depois` : 'última parada'}
            </p>
            <p className="truncate text-base font-extrabold text-marinho sm:text-lg">{parada.titulo}</p>
            <p className="truncate text-xs text-slate-500">{parada.detalhe}</p>
          </div>
          {rota && !chegou && (
            <div className="shrink-0 text-right">
              <p className="text-2xl leading-none font-extrabold text-laranja tabular-nums">
                {Math.max(1, Math.round(rota.duracaoS / 60))} <span className="text-base">min</span>
              </p>
              <p className="mt-1 text-xs font-semibold text-marinho tabular-nums">
                {formatarMetros(rota.distanciaM)} · {chegada}
              </p>
            </div>
          )}
        </div>
        {aoRegistrar && chegou && (
          <button
            onClick={aoRegistrar}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-base font-extrabold text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-600"
          >
            <Icone nome="ok" className="h-5 w-5" />
            Registrar parada
          </button>
        )}
        <button onClick={aoSair} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold text-slate-500 hover:bg-fundo">
          <Icone nome="fechar" className="h-4 w-4" />
          Sair do GPS
        </button>
      </div>
    </div>,
    document.body,
  )
}
