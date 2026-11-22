import L from 'leaflet'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'

import { formatarHorario, nomeCurto } from '../../shared/utils/formatar.ts'
import type { Area, Coordenada } from '../area/types.ts'
import { ROTULOS_TURNO, type Estudante } from '../estudante/types.ts'
import type { Instituicao } from '../instituicao/types.ts'
import { CAMADA_FUNDO, CENTRO_PADRAO, corDoMotorista, iconeInstituicao, iconePassageiro, ICONE_INSTITUICAO, type VariantePino } from './mapUtils.ts'

/** Peças do mapa (Leaflet) reaproveitadas no painel, na tela Mapa e no cadastro de passageiro. */

interface PropriedadesMapaBase {
  children?: ReactNode
  className?: string
  zoom?: number
  /** Zoom pela rodinha do mouse (desligado nos mapas pequenos, para não atrapalhar a rolagem). */
  rolagem?: boolean
  /**
   * Mapa que anda sozinho (seguindo a van): desenha as linhas numa área bem maior que a tela,
   * senão elas somem nas bordas a cada passo até o Leaflet redesenhar.
   */
  seguindo?: boolean
}

export function MapaBase({ children, className = 'h-96', zoom = 13, rolagem = true, seguindo = false }: PropriedadesMapaBase) {
  const desenho = useMemo(() => (seguindo ? L.svg({ padding: 1.5 }) : undefined), [seguindo])
  return (
    <MapContainer
      center={CENTRO_PADRAO}
      zoom={zoom}
      zoomSnap={0.25}
      scrollWheelZoom={rolagem}
      renderer={desenho}
      zoomControl={!seguindo}
      className={`z-0 ${className}`}
    >
      <TileLayer url={CAMADA_FUNDO.url} attribution={CAMADA_FUNDO.atribuicao} className="mapa-suave" />
      {children}
    </MapContainer>
  )
}

/** Enquadra os pontos com um voo suave sempre que a `chave` muda. */
export function Enquadrar({ pontos, chave, zoomMaximo = 16 }: { pontos: Coordenada[]; chave: string; zoomMaximo?: number }) {
  const mapa = useMap()
  useEffect(() => {
    if (pontos.length === 0) return
    // Espera a tela terminar de surgir e remede o contêiner; senão o enquadramento sai errado.
    const temporizador = window.setTimeout(() => {
      mapa.invalidateSize()
      if (pontos.length === 1) mapa.flyTo(pontos[0], zoomMaximo, { duration: 0.8 })
      else mapa.flyToBounds(L.latLngBounds(pontos), { padding: [48, 48], maxZoom: zoomMaximo, duration: 0.8 })
    }, 350)
    return () => window.clearTimeout(temporizador)
    // Só a chave decide quando reenquadrar; `pontos` muda de referência a cada render.
  }, [chave, mapa])
  return null
}

interface PropriedadesAreas {
  areas: Area[]
  /** Se informado, só as áreas deste motorista ficam em destaque; as outras ficam apagadas. */
  idMotoristaDestaque?: number | null
  mostrarNomes?: boolean
  /** Áreas mais claras (fundo do seletor de localização). */
  discretas?: boolean
  /** Se informado, clicar na área chama esta função (em vez de abrir o balão). */
  aoClicar?: (area: Area) => void
  /** false: a área não captura cliques (eles vão para o mapa, ex.: enquanto se desenha). */
  interativas?: boolean
}

export function CamadaAreas({
  areas,
  idMotoristaDestaque = null,
  mostrarNomes = true,
  discretas = false,
  aoClicar,
  interativas = true,
}: PropriedadesAreas) {
  return areas.map((area) => {
    const cor = corDoMotorista(area.fk_motorista)
    const apagada = idMotoristaDestaque !== null && area.fk_motorista !== idMotoristaDestaque
    const destacada = idMotoristaDestaque !== null && !apagada
    return (
      <Polygon
        // A key inclui o estado: o react-leaflet não atualiza o estilo de um polígono já desenhado.
        key={`${area.id}-${apagada}-${destacada}-${discretas}-${interativas}-${area.poligono.length}-${area.nome}`}
        positions={area.poligono}
        interactive={interativas}
        eventHandlers={aoClicar ? { click: () => aoClicar(area) } : undefined}
        pathOptions={{
          color: cor,
          weight: destacada ? 3 : 1.5,
          opacity: apagada ? 0.25 : 0.9,
          fillColor: cor,
          fillOpacity: apagada ? 0.03 : destacada ? 0.28 : discretas ? 0.08 : 0.16,
          dashArray: discretas ? '4 4' : undefined,
        }}
      >
        {mostrarNomes && !apagada && (
          <Tooltip permanent direction="center" className="etiqueta-area">
            <span style={{ color: cor }}>{area.nome}</span>
          </Tooltip>
        )}
        {!discretas && !aoClicar && interativas && (
          <Popup>
            <p className="font-bold text-marinho">{area.nome}</p>
            <p className="text-slate-500">Motorista: {area.motorista?.nome ?? 'sem motorista'}</p>
          </Popup>
        )}
      </Polygon>
    )
  })
}

interface PropriedadesMarcador {
  estudante: Estudante
  posicao: Coordenada
  variante?: VariantePino
  numero?: number
  mostrarNome?: boolean
  /** Nome do motorista da área, mostrado no balão. */
  motorista?: string | null
  /** Recebe o marcador do Leaflet (para abrir o balão de fora, ao clicar na lista). */
  aoMontar?: (marcador: L.Marker | null) => void
}

export function MarcadorPassageiro({ estudante, posicao, variante = 'normal', numero, mostrarNome = true, motorista, aoMontar }: PropriedadesMarcador) {
  const { endereco } = estudante
  return (
    <Marker
      position={posicao}
      icon={iconePassageiro(estudante, variante, numero)}
      zIndexOffset={variante === 'apagado' ? -500 : 0}
      ref={aoMontar}
    >
      {mostrarNome && variante !== 'apagado' && (
        <Tooltip permanent direction="top" className="etiqueta-nome">
          {nomeCurto(estudante.nome, estudante.apelido)}
        </Tooltip>
      )}
      <Popup>
        <p className="text-sm font-extrabold text-marinho">{estudante.nome}</p>
        {estudante.apelido && <p className="text-xs text-slate-500">"{estudante.apelido}"</p>}
        <p className="mt-2 text-slate-600">
          {estudante.instituicao.nome}
          <br />
          {ROTULOS_TURNO[estudante.turno]} · embarque {formatarHorario(estudante.horario_embarque)}
        </p>
        <p className="mt-2 text-slate-600">
          {endereco.logradouro}
          {endereco.numero ? `, ${endereco.numero}` : ''} · {endereco.bairro}
        </p>
        <p className="mt-2 text-xs font-semibold">
          {estudante.area ? (
            <span className="text-emerald-700">
              Área {estudante.area.nome}
              {motorista ? ` · ${motorista}` : ''}
            </span>
          ) : (
            <span className="text-amber-700">Fora das áreas atendidas</span>
          )}
        </p>
      </Popup>
    </Marker>
  )
}

/**
 * Faculdade no mapa, no ponto de parada (onde a van para na rua). No modo de ajuste o pino pode ser
 * arrastado; quando o ponto foi ajustado, uma linha tracejada liga a parada ao endereço da faculdade.
 */
export function MarcadorInstituicao({
  instituicao,
  cor,
  ajustavel = false,
  aoMover,
}: {
  instituicao: Instituicao
  cor?: string
  ajustavel?: boolean
  aoMover?: (ponto: [number, number]) => void
}) {
  const ponto = instituicao.ponto_parada
  if (!ponto) return null
  const { latitude, longitude } = instituicao.endereco
  const ajustado = instituicao.parada_latitude !== null && latitude !== null && longitude !== null
  return (
    <>
      {ajustavel && ajustado && (
        <>
          <Polyline positions={[[latitude, longitude], ponto]} pathOptions={{ color: '#64748b', weight: 2, dashArray: '4 6' }} />
          <CircleMarker center={[latitude, longitude]} radius={5} pathOptions={{ color: '#64748b', fillColor: '#ffffff', fillOpacity: 1, weight: 2 }}>
            <Tooltip direction="top">Endereço de {instituicao.nome}</Tooltip>
          </CircleMarker>
        </>
      )}
    <Marker
      position={ponto}
      icon={cor ? iconeInstituicao(cor) : ICONE_INSTITUICAO}
      draggable={ajustavel}
      eventHandlers={
        ajustavel && aoMover
          ? {
              dragend: (evento) => {
                const { lat, lng } = (evento.target as L.Marker).getLatLng()
                aoMover([Number(lat.toFixed(6)), Number(lng.toFixed(6))])
              },
            }
          : undefined
      }
    >
      <Tooltip direction="top" className="etiqueta-nome">
        {ajustavel ? `${instituicao.nome} · arraste até a rua` : instituicao.nome}
      </Tooltip>
      <Popup>
        <p className="font-bold text-marinho">{instituicao.nome}</p>
        <p className="text-slate-500">
          {instituicao.endereco.logradouro}, {instituicao.endereco.numero} · {instituicao.endereco.cidade}
        </p>
        {instituicao.parada_latitude !== null && <p className="mt-1 text-xs text-slate-400">Parada ajustada na rua</p>}
      </Popup>
    </Marker>
    </>
  )
}

// ---------------------------------------------------------------- Trajeto com setas direcionais

interface SetaTrajeto {
  posicao: Coordenada
  angulo: number
}

/** Calcula o ângulo em graus (0° = norte, sentido horário) entre duas coordenadas. */
function calcularAzimute([lat1, lng1]: Coordenada, [lat2, lng2]: Coordenada): number {
  const rad = Math.PI / 180
  const dLng = (lng2 - lng1) * rad
  const y = Math.sin(dLng) * Math.cos(lat2 * rad)
  const x =
    Math.cos(lat1 * rad) * Math.sin(lat2 * rad) -
    Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/**
 * Posiciona setas a cada `espacamentoPx` pixels na tela, recalculando conforme o zoom e
 * filtrando apenas a área visível do mapa para manter alta legibilidade em qualquer escala.
 */
function calcularSetasVisiveis(mapa: L.Map, linha: Coordenada[], espacamentoPx = 110): SetaTrajeto[] {
  if (linha.length < 2) return []
  const limites = mapa.getBounds().pad(0.25)
  const resultado: SetaTrajeto[] = []
  let acumuladoPx = espacamentoPx * 0.45

  for (let i = 0; i < linha.length - 1; i++) {
    const a = linha[i]
    const b = linha[i + 1]
    const p1 = mapa.latLngToLayerPoint(a)
    const p2 = mapa.latLngToLayerPoint(b)
    const comprimentoPx = p1.distanceTo(p2)
    if (comprimentoPx === 0) continue

    const angulo = calcularAzimute(a, b)
    let restante = comprimentoPx
    let progresso = 0

    while (acumuladoPx + restante >= espacamentoPx && resultado.length < 60) {
      const falta = espacamentoPx - acumuladoPx
      progresso += falta / comprimentoPx
      const lat = a[0] + (b[0] - a[0]) * progresso
      const lng = a[1] + (b[1] - a[1]) * progresso

      if (limites.contains([lat, lng])) {
        resultado.push({ posicao: [lat, lng], angulo })
      }
      restante -= falta
      acumuladoPx = 0
    }
    acumuladoPx += restante
  }

  return resultado
}

function criarIconeSeta(cor: string, angulo: number) {
  return L.divIcon({
    className: '',
    html: `<div style="transform:rotate(${angulo.toFixed(1)}deg);width:22px;height:22px;display:grid;place-items:center;pointer-events:none;">
      <svg viewBox="0 0 24 24" width="19" height="19" style="filter:drop-shadow(0 1.5px 2px rgba(0,0,0,0.5));">
        <path d="M12 2.5L21 20L12 16L3 20Z" fill="${cor}" stroke="#FFFFFF" stroke-width="2.4" stroke-linejoin="round" />
      </svg>
    </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

interface PropriedadesLinhaDirecional {
  pontos: Coordenada[]
  cor: string
  corSeta?: string
  tracejada?: boolean
  opacidade?: number
  mostrarSetas?: boolean
}

/** Desenha um trajeto no mapa com contorno branco e setas adaptadas ao zoom do usuário. */
export function LinhaDirecional({
  pontos,
  cor,
  corSeta = '#1B3C59',
  tracejada = false,
  opacidade = 0.95,
  mostrarSetas = true,
}: PropriedadesLinhaDirecional) {
  const mapa = useMap()
  const [visao, setVisao] = useState(0)

  useMapEvents({
    zoomend: () => setVisao((v) => v + 1),
    moveend: () => setVisao((v) => v + 1),
  })

  const setas = useMemo(
    () => (mostrarSetas ? calcularSetasVisiveis(mapa, pontos, 110) : []),
    // `visao` força recálculo sempre que o usuário dá zoom ou arrasta o mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapa, pontos, mostrarSetas, visao],
  )

  if (pontos.length < 2) return null

  return (
    <>
      <Polyline
        positions={pontos}
        pathOptions={{ color: '#FFFFFF', weight: 9, opacity: opacidade * 0.9 }}
        interactive={false}
      />
      <Polyline
        positions={pontos}
        pathOptions={{
          color: cor,
          weight: 5,
          opacity: opacidade,
          dashArray: tracejada ? '8 10' : undefined,
        }}
        interactive={false}
      />
      {setas.map((seta, idx) => (
        <Marker
          key={`${idx}-${seta.posicao[0].toFixed(5)}-${seta.posicao[1].toFixed(5)}`}
          position={seta.posicao}
          icon={criarIconeSeta(corSeta, seta.angulo)}
          interactive={false}
          zIndexOffset={400}
        />
      ))}
    </>
  )
}