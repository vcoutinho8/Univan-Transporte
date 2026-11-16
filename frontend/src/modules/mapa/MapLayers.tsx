import L from 'leaflet'
import { useEffect, type ReactNode } from 'react'
import { MapContainer, Marker, Polygon, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'

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
}

export function MapaBase({ children, className = 'h-96', zoom = 13, rolagem = true }: PropriedadesMapaBase) {
  return (
    <MapContainer center={CENTRO_PADRAO} zoom={zoom} zoomSnap={0.25} scrollWheelZoom={rolagem} className={`z-0 ${className}`}>
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

export function MarcadorInstituicao({ instituicao, cor }: { instituicao: Instituicao; cor?: string }) {
  const { latitude, longitude } = instituicao.endereco
  if (latitude === null || longitude === null) return null
  return (
    <Marker position={[latitude, longitude]} icon={cor ? iconeInstituicao(cor) : ICONE_INSTITUICAO}>
      <Tooltip direction="top" className="etiqueta-nome">
        {instituicao.nome}
      </Tooltip>
      <Popup>
        <p className="font-bold text-marinho">{instituicao.nome}</p>
        <p className="text-slate-500">
          {instituicao.endereco.logradouro}, {instituicao.endereco.numero} · {instituicao.endereco.cidade}
        </p>
      </Popup>
    </Marker>
  )
}
