import L from 'leaflet'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CircleMarker, Marker, Polygon, useMap, useMapEvents } from 'react-leaflet'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Cartao from '../../shared/components/Card.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { ErroApi } from '../../shared/services/api.ts'
import { PainelLateral, useDadosMapa } from '../mapa/mapContext.tsx'
import { CamadaAreas, Enquadrar } from '../mapa/MapLayers.tsx'
import { coordenadaDo, corDoMotorista, pontoNoPoligono } from '../mapa/mapUtils.ts'
import { Segmentos } from '../mapa/MapWidgets.tsx'
import { servicoArea } from './areaService.ts'
import { bairroNoPonto, bairroPorNome, type BairroOsm } from './osmService.ts'
import type { Area, Coordenada } from './types.ts'

/**
 * Como marcar o contorno:
 * - 'clique': um clique no mapa traz o limite oficial do bairro do OpenStreetMap;
 * - 'desenho': cada clique no mapa acrescenta um ponto (bairros sem limite no OSM ou regiões
 *   que não são um bairro inteiro).
 * Nos dois modos dá para arrastar os pontos, clicar num ponto para tirá-lo e clicar no
 * pontinho do meio de um lado para criar um ponto novo ali.
 */
type Modo = 'clique' | 'desenho'

interface Edicao {
  id: number | null
  nome: string
  fk_motorista: number | null
  poligono: Coordenada[]
  modo: Modo
}

type Situacao = { tipo: 'info' | 'ok' | 'erro'; mensagem: string } | null

const ICONE_VERTICE = L.divIcon({ className: '', html: '<div class="vertice"></div>', iconSize: [14, 14], iconAnchor: [7, 7] })
const ICONE_PRIMEIRO = L.divIcon({ className: '', html: '<div class="vertice vertice-primeiro"></div>', iconSize: [14, 14], iconAnchor: [7, 7] })
const ICONE_MEIO = L.divIcon({ className: '', html: '<div class="vertice-meio"></div>', iconSize: [10, 10], iconAnchor: [5, 5] })

const DICA_MODO: Record<Modo, string> = {
  clique: 'Clique no bairro no mapa para trazer o contorno oficial.',
  desenho: 'Clique no mapa para acrescentar pontos ao contorno.',
}

/** Aba Bairros: áreas da cidade desenhadas no mapa e o motorista de cada uma. */
export default function AbaBairros() {
  const dados = useDadosMapa()
  const { areas, ativas, estudantes, comLocal, motoristas, carregando } = dados

  const [edicao, setEdicao] = useState<Edicao | null>(null)
  const [situacao, setSituacao] = useState<Situacao>(null)
  const [buscaBairro, setBuscaBairro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ mensagem: string; tipo: 'erro' | 'sucesso' } | null>(null)
  const [chaveEnquadrar, setChaveEnquadrar] = useState('inicio')

  const inativas = areas.filter((a) => a.status === 'inativo')
  const passageirosPorArea = useMemo(() => {
    const contagem = new Map<number, number>()
    for (const e of estudantes) if (e.fk_area) contagem.set(e.fk_area, (contagem.get(e.fk_area) ?? 0) + 1)
    return contagem
  }, [estudantes])

  // Prévia: quem cairia na área desenhada, e quem já está em outra área.
  const previa = useMemo(() => {
    if (!edicao || edicao.poligono.length < 3) return null
    const dentro = comLocal.filter((e) => pontoNoPoligono(coordenadaDo(e)!, edicao.poligono))
    const emOutra = dentro.filter((e) => e.fk_area !== null && e.fk_area !== edicao.id)
    return { total: dentro.length, emOutra: emOutra.length, nomesOutras: [...new Set(emOutra.map((e) => e.area?.nome))] }
  }, [edicao, comLocal])

  function comecar(area: Area | null) {
    setErro(null)
    setAviso(null)
    setBuscaBairro('')
    setEdicao(
      area
        ? { id: area.id, nome: area.nome, fk_motorista: area.fk_motorista, poligono: area.poligono, modo: 'desenho' }
        : { id: null, nome: '', fk_motorista: null, poligono: [], modo: 'clique' },
    )
    setSituacao({ tipo: 'info', mensagem: area ? 'Arraste os pontos para ajustar o contorno.' : DICA_MODO.clique })
    setChaveEnquadrar(`area-${area?.id ?? 'nova'}-${Date.now()}`)
  }

  const cancelar = () => {
    setEdicao(null)
    setSituacao(null)
    setErro(null)
  }
  const mudar = (parcial: Partial<Edicao>) => setEdicao((atual) => (atual ? { ...atual, ...parcial } : atual))

  function aplicarBairro(bairro: BairroOsm | null, origem: string) {
    if (!bairro) {
      setSituacao({ tipo: 'erro', mensagem: `O OpenStreetMap não tem o limite ${origem}. Desenhe clicando no mapa.` })
      mudar({ modo: 'desenho' })
      return
    }
    setEdicao((atual) => (atual ? { ...atual, poligono: bairro.poligono, nome: atual.nome.trim() ? atual.nome : bairro.nome } : atual))
    setChaveEnquadrar(`osm-${Date.now()}`)
    setSituacao({
      tipo: 'ok',
      mensagem: `Contorno de ${bairro.nome}${bairro.cidade ? ` (${bairro.cidade})` : ''} carregado com ${bairro.poligono.length} pontos. Ajuste se precisar.`,
    })
  }

  async function aoClicarNoMapa(ponto: Coordenada) {
    if (!edicao) return
    if (edicao.modo === 'desenho') {
      mudar({ poligono: [...edicao.poligono, ponto] })
      return
    }
    setSituacao({ tipo: 'info', mensagem: 'Buscando o bairro no OpenStreetMap...' })
    aplicarBairro(await bairroNoPonto(ponto), 'desse bairro')
  }

  async function buscarPorNome(evento: FormEvent) {
    evento.preventDefault()
    if (!buscaBairro.trim()) return
    setSituacao({ tipo: 'info', mensagem: `Buscando "${buscaBairro}"...` })
    aplicarBairro(await bairroPorNome(buscaBairro), `de "${buscaBairro}"`)
  }

  async function salvar() {
    if (!edicao) return
    setSalvando(true)
    setErro(null)
    try {
      const corpo = { nome: edicao.nome, fk_motorista: edicao.fk_motorista, poligono: edicao.poligono }
      const salva = edicao.id ? await servicoArea.atualizar(edicao.id, corpo) : await servicoArea.cadastrar(corpo)
      await dados.recarregar()
      cancelar()
      setAviso({ mensagem: `Bairro ${salva.nome} salvo. Passageiros e rotas foram atualizados.`, tipo: 'sucesso' })
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function executar(acao: () => Promise<Area>, mensagem: string) {
    try {
      await acao()
      await dados.recarregar()
      setAviso({ mensagem, tipo: 'sucesso' })
    } catch (e) {
      setAviso({ mensagem: e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado.', tipo: 'erro' })
    }
  }

  function inativar(area: Area) {
    const total = passageirosPorArea.get(area.id) ?? 0
    if (!window.confirm(`Inativar o bairro ${area.nome}? ${total} passageiro(s) ficarão sem área e fora das rotas.`)) return
    void executar(() => servicoArea.inativar(area.id), `Bairro ${area.nome} inativado.`)
  }

  const pontosEnquadrar: Coordenada[] =
    edicao && edicao.poligono.length > 0
      ? edicao.poligono
      : [...ativas.flatMap((a) => a.poligono), ...comLocal.map((e) => coordenadaDo(e)!)]

  return (
    <>
      <PainelLateral>
        {aviso && (
          <div className="animate-surgir">
            <Alerta mensagem={aviso.mensagem} tipo={aviso.tipo} aoFechar={() => setAviso(null)} />
          </div>
        )}

        {edicao ? (
          <Cartao titulo={edicao.id ? `Editar ${edicao.nome}` : 'Novo bairro'} className="animate-surgir">
            <div className="space-y-4">
              {erro && <Alerta mensagem={erro} />}

              <Segmentos
                opcoes={[
                  { valor: 'clique', rotulo: 'Clicar no bairro' },
                  { valor: 'desenho', rotulo: 'Desenhar à mão' },
                ]}
                atual={edicao.modo}
                aoMudar={(modo: Modo) => {
                  mudar({ modo })
                  setSituacao({ tipo: 'info', mensagem: DICA_MODO[modo] })
                }}
              />

              {edicao.modo === 'clique' && (
                <form onSubmit={buscarPorNome} className="flex gap-2">
                  <input
                    value={buscaBairro}
                    onChange={(e) => setBuscaBairro(e.target.value)}
                    placeholder="ou busque: Praia do Morro, Guarapari"
                    className="campo mt-0"
                  />
                  <Botao type="submit" variante="secundario" className="px-3" aria-label="Buscar bairro">
                    <Icone nome="busca" className="h-4 w-4" />
                  </Botao>
                </form>
              )}

              {situacao && (
                <p
                  className={`rounded-xl p-3 text-xs ${
                    situacao.tipo === 'erro'
                      ? 'bg-amber-50 text-amber-800'
                      : situacao.tipo === 'ok'
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-fundo text-slate-600'
                  }`}
                >
                  {situacao.mensagem}
                </p>
              )}

              <label className="block text-sm font-semibold text-marinho">
                Nome do bairro
                <input
                  value={edicao.nome}
                  maxLength={100}
                  onChange={(e) => mudar({ nome: e.target.value })}
                  placeholder="Ex.: Praia do Morro"
                  className="campo"
                />
              </label>

              <label className="block text-sm font-semibold text-marinho">
                Motorista responsável
                <select
                  value={edicao.fk_motorista ?? ''}
                  onChange={(e) => mudar({ fk_motorista: e.target.value ? Number(e.target.value) : null })}
                  className="campo"
                >
                  <option value="">Sem motorista por enquanto</option>
                  {motoristas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{edicao.poligono.length} ponto(s) no contorno</span>
                <span className="flex gap-3">
                  <button
                    type="button"
                    disabled={edicao.poligono.length === 0}
                    onClick={() => mudar({ poligono: edicao.poligono.slice(0, -1) })}
                    className="font-semibold text-marinho hover:text-laranja disabled:opacity-40"
                  >
                    Desfazer ponto
                  </button>
                  <button
                    type="button"
                    disabled={edicao.poligono.length === 0}
                    onClick={() => mudar({ poligono: [] })}
                    className="font-semibold text-red-600 hover:underline disabled:opacity-40"
                  >
                    Limpar
                  </button>
                </span>
              </div>

              {previa && (
                <div className="rounded-xl bg-fundo p-3 text-sm">
                  <p className="font-bold text-marinho">{previa.total} passageiro(s) dentro deste contorno</p>
                  {previa.emOutra > 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      {previa.emOutra} já está(ão) em {previa.nomesOutras.join(', ')}. Onde os bairros se sobrepõem, vale o
                      cadastrado primeiro.
                    </p>
                  )}
                </div>
              )}

              <p className="text-xs text-slate-400">
                Arraste um ponto para mover · clique num ponto para tirar · clique no pontinho entre dois pontos para criar
                um novo.
              </p>

              <div className="flex justify-end gap-2">
                <Botao variante="secundario" onClick={cancelar}>
                  Cancelar
                </Botao>
                <Botao onClick={() => void salvar()} disabled={salvando || edicao.poligono.length < 3 || !edicao.nome.trim()}>
                  {salvando ? 'Salvando...' : 'Salvar bairro'}
                </Botao>
              </div>
            </div>
          </Cartao>
        ) : (
          <Cartao
            titulo={`Bairros (${ativas.length})`}
            acoes={
              <Botao className="px-3 py-1.5" onClick={() => comecar(null)}>
                <Icone nome="mais" className="h-4 w-4" />
                Novo bairro
              </Botao>
            }
          >
            <ul className="space-y-1">
              {carregando && [1, 2, 3].map((n) => <li key={n} className="esqueleto h-12" />)}
              {ativas.map((area, indice) => (
                <li
                  key={area.id}
                  className="group flex animate-surgir items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-fundo"
                  style={{ animationDelay: `${indice * 30}ms` }}
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: corDoMotorista(area.fk_motorista) }} />
                  <button onClick={() => comecar(area)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-bold text-marinho">{area.nome}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {area.motorista?.nome ?? 'Sem motorista'} · {passageirosPorArea.get(area.id) ?? 0} passageiro(s)
                    </span>
                  </button>
                  <button
                    onClick={() => comecar(area)}
                    title="Editar"
                    aria-label={`Editar ${area.nome}`}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-marinho"
                  >
                    <Icone nome="editar" className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => inativar(area)}
                    title="Inativar"
                    aria-label={`Inativar ${area.nome}`}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-red-600"
                  >
                    <Icone nome="fechar" className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            {inativas.length > 0 && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer font-semibold text-slate-500">Inativos ({inativas.length})</summary>
                <ul className="mt-2 space-y-1">
                  {inativas.map((area) => (
                    <li key={area.id} className="flex items-center justify-between rounded-lg px-3 py-1.5 hover:bg-fundo">
                      <span className="text-slate-500">{area.nome}</span>
                      <button
                        onClick={() => void executar(() => servicoArea.reativar(area.id), `Bairro ${area.nome} reativado.`)}
                        className="text-xs font-bold text-laranja hover:underline"
                      >
                        Reativar
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="mt-4 text-xs text-slate-400">Clique num bairro no mapa para editar o contorno.</p>
          </Cartao>
        )}
      </PainelLateral>

      {!carregando && <Enquadrar pontos={pontosEnquadrar} chave={`bairros-${chaveEnquadrar}`} />}
      <CursorDeDesenho ativo={edicao?.modo === 'desenho'} />
      <CamadaAreas
        areas={edicao ? ativas.filter((a) => a.id !== edicao.id) : ativas}
        discretas={!!edicao}
        interativas={!edicao}
        mostrarNomes={!edicao}
        aoClicar={edicao ? undefined : comecar}
      />
      {comLocal.map((e) => (
        <CircleMarker
          key={e.id}
          center={coordenadaDo(e)!}
          radius={4}
          interactive={false}
          pathOptions={{ color: '#fff', weight: 1.5, fillColor: e.fk_area ? '#F2600C' : '#EAB308', fillOpacity: 1 }}
        />
      ))}
      {edicao && <EditorPoligono poligono={edicao.poligono} aoMudar={(poligono) => mudar({ poligono })} aoClicarNoMapa={aoClicarNoMapa} />}
    </>
  )
}

/** Cursor em cruz no mapa enquanto se desenha. */
function CursorDeDesenho({ ativo }: { ativo: boolean }) {
  const mapa = useMap()
  useEffect(() => {
    mapa.getContainer().classList.toggle('mapa-desenhando', ativo)
    return () => mapa.getContainer().classList.remove('mapa-desenhando')
  }, [mapa, ativo])
  return null
}

interface PropriedadesEditor {
  poligono: Coordenada[]
  aoMudar: (poligono: Coordenada[]) => void
  aoClicarNoMapa: (ponto: Coordenada) => void
}

/** Contorno em edição: polígono, pontos arrastáveis e "meios" para inserir pontos. */
function EditorPoligono({ poligono, aoMudar, aoClicarNoMapa }: PropriedadesEditor) {
  useMapEvents({ click: (e) => aoClicarNoMapa([arredondar(e.latlng.lat), arredondar(e.latlng.lng)]) })

  const mover = (indice: number, alvo: L.Marker) => {
    const { lat, lng } = alvo.getLatLng()
    aoMudar(poligono.map((p, i) => (i === indice ? [arredondar(lat), arredondar(lng)] : p)))
  }
  const meios: Coordenada[] = poligono.map((p, i) => {
    const q = poligono[(i + 1) % poligono.length]
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
  })
  // Com 2 pontos o "lado de volta" é o mesmo lado: só um meio.
  const meiosVisiveis = poligono.length >= 3 ? meios : poligono.length === 2 ? meios.slice(0, 1) : []

  return (
    <>
      {poligono.length >= 2 && (
        <Polygon
          positions={poligono}
          interactive={false}
          pathOptions={{ color: '#F2600C', weight: 3, fillColor: '#F2600C', fillOpacity: 0.18, dashArray: '6 6' }}
        />
      )}
      {meiosVisiveis.map((ponto, i) => (
        <Marker
          key={`meio-${i}-${poligono.length}`}
          position={ponto}
          icon={ICONE_MEIO}
          eventHandlers={{ click: () => aoMudar([...poligono.slice(0, i + 1), ponto, ...poligono.slice(i + 1)]) }}
        />
      ))}
      {poligono.map((ponto, i) => (
        <Marker
          key={`v-${i}-${poligono.length}`}
          position={ponto}
          icon={i === 0 ? ICONE_PRIMEIRO : ICONE_VERTICE}
          draggable
          eventHandlers={{
            drag: (e) => mover(i, e.target as L.Marker),
            click: () => aoMudar(poligono.filter((_, j) => j !== i)),
          }}
        />
      ))}
    </>
  )
}

const arredondar = (valor: number) => Math.round(valor * 1e6) / 1e6
