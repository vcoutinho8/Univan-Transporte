import L from 'leaflet'
import { Marker, useMapEvents } from 'react-leaflet'

import type { Area, Coordenada } from '../area/types.ts'
import { CamadaAreas, Enquadrar, MapaBase } from './MapLayers.tsx'

interface Propriedades {
  posicao: Coordenada | null
  aoMudar: (posicao: Coordenada) => void
  areas: Area[]
  /** Muda quando a posição vem de fora (busca do endereço): o mapa voa até o pino. */
  chaveCentralizar: string
}

const ICONE_SELECAO = L.divIcon({
  className: '',
  html: '<div class="pino"><span>●</span></div>',
  iconSize: [34, 34],
  iconAnchor: [17, 41],
})

/** Mini mapa do cadastro: clique no mapa ou arraste o pino para marcar onde o passageiro mora. */
export default function SeletorLocalizacao({ posicao, aoMudar, areas, chaveCentralizar }: Propriedades) {
  return (
    <MapaBase className="h-64" zoom={13} rolagem={false}>
      <CamadaAreas areas={areas} discretas />
      <CliqueNoMapa aoClicar={aoMudar} />
      {posicao && (
        <>
          <Enquadrar pontos={[posicao]} chave={chaveCentralizar} />
          <Marker
            position={posicao}
            icon={ICONE_SELECAO}
            draggable
            eventHandlers={{
              dragend: (evento) => {
                const { lat, lng } = (evento.target as L.Marker).getLatLng()
                aoMudar([arredondar(lat), arredondar(lng)])
              },
            }}
          />
        </>
      )}
    </MapaBase>
  )
}

function CliqueNoMapa({ aoClicar }: { aoClicar: (posicao: Coordenada) => void }) {
  useMapEvents({ click: (evento) => aoClicar([arredondar(evento.latlng.lat), arredondar(evento.latlng.lng)]) })
  return null
}

/** O banco guarda 6 casas decimais (~10 cm). */
const arredondar = (valor: number) => Math.round(valor * 1e6) / 1e6
