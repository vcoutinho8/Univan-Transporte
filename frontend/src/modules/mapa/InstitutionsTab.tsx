import type L from 'leaflet'
import { useState } from 'react'
import { Marker, Tooltip, useMapEvents } from 'react-leaflet'

import { pode } from '../../shared/auth/permissoes.ts'
import { useSessao } from '../../shared/auth/useSessao.ts'
import Cartao from '../../shared/components/Card.tsx'
import { useAviso, useConfirmacao } from '../../shared/components/NoticeModal.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { ErroApi } from '../../shared/services/api.ts'
import type { Coordenada } from '../area/types.ts'
import { servicoInstituicao } from '../instituicao/institutionService.ts'
import type { Instituicao } from '../instituicao/types.ts'
import { PainelLateral, useDadosMapa } from './mapContext.tsx'
import { Enquadrar } from './MapLayers.tsx'
import { iconeInstituicao } from './mapUtils.ts'

const arredondar = (n: number) => Number(n.toFixed(6))

/**
 * Aba Faculdades: os pontos onde a van para em cada faculdade, separados das rotas. Arraste o
 * pino até o portão; faculdade com mais de um portão ganha paradas extras (ex.: UVV e Biopráticas).
 */
export default function AbaFaculdades() {
  const { instituicoes, carregando, recarregarInstituicoes } = useDadosMapa()
  const podeEditar = pode(useSessao().usuario?.perfil, 'cadastro.editar')
  const [foco, setFoco] = useState<number | null>(null)
  const avisos = useAviso()
  const confirmacao = useConfirmacao()
  // Muda a cada salvamento: os pinos voltam para o ponto gravado (se a API recusou, desfaz o arrasto).
  const [versao, setVersao] = useState(0)

  async function executar(acao: () => Promise<unknown>, ok: string) {
    try {
      await acao()
      avisos.mostrar({ tipo: 'sucesso', titulo: 'Pronto!', descricao: ok })
      await recarregarInstituicoes()
    } catch (e) {
      avisos.erro(e instanceof ErroApi ? e.mensagemCompleta : 'Não foi possível salvar o ponto.')
    } finally {
      setVersao((v) => v + 1)
    }
  }

  const focada = instituicoes.find((i) => i.id === foco)
  const pontos: Coordenada[] = focada
    ? [focada.ponto_parada, ...focada.paradas.map((p) => [p.latitude, p.longitude] as Coordenada)].filter((p): p is Coordenada => p !== null)
    : instituicoes.map((i) => i.ponto_parada).filter((p): p is Coordenada => p !== null)

  function aoArrastar(i: Instituicao) {
    return {
      dragend: (evento: L.LeafletEvent) => {
        const { lat, lng } = (evento.target as L.Marker).getLatLng()
        void executar(() => servicoInstituicao.ajustarParada(i.id, [arredondar(lat), arredondar(lng)]), `Ponto de parada da ${i.nome} salvo.`)
      },
    }
  }

  // Faculdade sem localização (cadastro sem coordenada): o toque no mapa marca o ponto dela.
  const semLocal = focada && !focada.ponto_parada && podeEditar ? focada : null

  return (
    <>
      {avisos.modal}
      {confirmacao.modal}
      {semLocal && (
        <MarcarNoMapa
          aoMarcar={([lat, lng]) => void executar(() => servicoInstituicao.ajustarParada(semLocal.id, [arredondar(lat), arredondar(lng)]), `Ponto da ${semLocal.nome} marcado.`)}
        />
      )}
      <PainelLateral>
        <Cartao className="space-y-3 p-4">
          <p className="text-sm text-slate-600">
            {podeEditar
              ? 'Toque numa faculdade para aproximar e arraste o pino até a rua, em frente ao portão onde a van para.'
              : 'Onde a van para em cada faculdade.'}
          </p>
          <ul className="-mx-1 max-h-[60vh] space-y-1.5 overflow-y-auto px-1 py-0.5">
            {instituicoes.map((i) => (
              <li key={i.id} className={`rounded-xl p-2.5 ring-1 transition-colors ${foco === i.id ? 'bg-laranja/5 ring-laranja/40' : 'ring-slate-200/70'}`}>
                <button type="button" onClick={() => setFoco(foco === i.id ? null : i.id)} className="flex w-full items-center gap-2 text-left">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-marinho text-white">
                    <Icone nome="escola" className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-marinho">{i.nome}</span>
                    <span className={`block text-xs ${i.ponto_parada ? 'text-slate-500' : 'font-semibold text-amber-600'}`}>
                      {!i.ponto_parada ? 'sem localização: toque nela e depois no mapa' : i.parada_latitude !== null ? 'ponto ajustado' : 'no endereço'}
                      {i.paradas.length ? ` · +${i.paradas.length} parada(s) extra(s)` : ''}
                    </span>
                  </span>
                </button>
                {foco === i.id && podeEditar && (
                  <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs">
                    {i.paradas.map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-semibold text-slate-600">{p.nome}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            const sim = await confirmacao.confirmar({
                              titulo: `Remover a parada ${p.nome}?`,
                              descricao: 'Quem descia nela volta para a parada principal.',
                              botao: 'Remover',
                              perigo: true,
                            })
                            if (sim) void executar(() => servicoInstituicao.removerParada(i.id, p.id), `Parada ${p.nome} removida.`)
                          }}
                          className="font-bold text-red-500 hover:underline"
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-3 pt-1">
                      <button
                        type="button"
                        onClick={async () => {
                          const base = i.ponto_parada
                          if (!base) return avisos.erro('Marque primeiro o ponto principal da faculdade no mapa.')
                          const nome = await confirmacao.pedirTexto({
                            titulo: 'Nova parada extra',
                            descricao: `Outro portão da ${i.nome} onde a van também para.`,
                            botao: 'Criar parada',
                            campo: { rotulo: 'Nome da parada', placeholder: 'Ex.: Biopráticas, portão dos fundos' },
                          })
                          if (!nome) return
                          void executar(
                            () => servicoInstituicao.adicionarParada(i.id, { nome, latitude: base[0] + 0.0006, longitude: base[1] + 0.0006 }),
                            `Parada ${nome} criada: arraste o pino novo até o portão.`,
                          )
                        }}
                        className="font-bold text-laranja hover:underline"
                      >
                        + Parada extra
                      </button>
                      {i.parada_latitude !== null && (
                        <button
                          type="button"
                          onClick={() => void executar(() => servicoInstituicao.ajustarParada(i.id, null), `${i.nome} voltou a parar no endereço.`)}
                          className="font-bold text-slate-500 hover:underline"
                        >
                          Voltar ao endereço
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Cartao>
      </PainelLateral>

      {!carregando && <Enquadrar pontos={pontos} chave={`faculdades-${foco}-${instituicoes.length}`} zoomMaximo={focada ? 18 : 15} />}
      {instituicoes.map((i) =>
        i.ponto_parada ? (
          <Marker
            key={`principal-${i.id}-${versao}`}
            position={i.ponto_parada}
            icon={iconeInstituicao(foco === i.id ? '#f2600c' : undefined)}
            draggable={podeEditar}
            eventHandlers={podeEditar ? aoArrastar(i) : undefined}
          >
            <Tooltip direction="top" permanent={foco === i.id}>
              {i.nome}
              {podeEditar ? ' · arraste até o portão' : ''}
            </Tooltip>
          </Marker>
        ) : null,
      )}
      {instituicoes.flatMap((i) =>
        i.paradas.map((p) => (
          <Marker
            key={`extra-${p.id}-${versao}`}
            position={[p.latitude, p.longitude]}
            icon={iconeInstituicao('#0ea5e9')}
            draggable={podeEditar}
            eventHandlers={
              podeEditar
                ? {
                    dragend: (evento) => {
                      const { lat, lng } = (evento.target as L.Marker).getLatLng()
                      void executar(
                        () => servicoInstituicao.alterarParada(i.id, p.id, { nome: p.nome, latitude: arredondar(lat), longitude: arredondar(lng) }),
                        `Parada ${p.nome} movida.`,
                      )
                    },
                  }
                : undefined
            }
          >
            <Tooltip direction="top">
              {i.nome} · {p.nome}
            </Tooltip>
          </Marker>
        )),
      )}
    </>
  )
}

function MarcarNoMapa({ aoMarcar }: { aoMarcar: (ponto: Coordenada) => void }) {
  useMapEvents({ click: (evento) => aoMarcar([evento.latlng.lat, evento.latlng.lng]) })
  return null
}
