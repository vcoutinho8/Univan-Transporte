import type L from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMapEvents } from 'react-leaflet'
import { useSearchParams } from 'react-router-dom'

import Cartao from '../../shared/components/Card.tsx'
import Icone from '../../shared/components/Icon.tsx'
import type { Coordenada } from '../area/types.ts'
import { PainelLateral, useDadosMapa } from './mapContext.tsx'
import { CamadaAreas, Enquadrar, MarcadorInstituicao, MarcadorPassageiro } from './MapLayers.tsx'
import { coordenadaDo, corDoMotorista } from './mapUtils.ts'
import { Alternador, BotaoLista, NumeroResumo } from './MapWidgets.tsx'

/** Com a cidade inteira na tela os nomes se amontoam: só aparecem a partir deste zoom. */
const ZOOM_NOMES = 15

/**
 * Aba Visão geral: onde mora cada passageiro, os bairros de cada motorista e as faculdades.
 * URL: ?motorista=<id> destaca a região de um motorista; ?passageiro=<id> foca um pino.
 */
export default function AbaGeral() {
  const { ativas, estudantes, comLocal, instituicoes, rotas, carregando } = useDadosMapa()
  const [parametros, setParametros] = useSearchParams()
  const idMotorista = Number(parametros.get('motorista')) || null
  const idFoco = Number(parametros.get('passageiro')) || null

  const [mostrarNomes, setMostrarNomes] = useState(true)
  const [mostrarAreas, setMostrarAreas] = useState(true)
  const [mostrarInstituicoes, setMostrarInstituicoes] = useState(true)
  const [zoom, setZoom] = useState(13)
  const marcadores = useRef(new Map<number, L.Marker>())

  // Motoristas com bairro: cada bairro tem um motorista, e os passageiros do bairro são dele.
  const motoristas = useMemo(() => {
    const porId = new Map<number, { id: number; nome: string; bairros: string[]; idsAreas: Set<number> }>()
    for (const area of ativas) {
      if (!area.motorista) continue
      const item = porId.get(area.motorista.id) ?? { ...area.motorista, bairros: [], idsAreas: new Set<number>() }
      item.bairros.push(area.nome)
      item.idsAreas.add(area.id)
      porId.set(item.id, item)
    }
    return [...porId.values()]
      .map((m) => ({ ...m, passageiros: estudantes.filter((e) => e.fk_area !== null && m.idsAreas.has(e.fk_area)).length }))
      .sort((a, b) => a.nome.localeCompare(b.nome))
  }, [ativas, estudantes])

  const selecionado = motoristas.find((m) => m.id === idMotorista) ?? null
  const motoristaDaArea = useMemo(() => new Map(ativas.map((a) => [a.id, a.motorista?.nome ?? null])), [ativas])
  const foco = comLocal.find((e) => e.id === idFoco)
  const semLocal = estudantes.length - comLocal.length
  const foraDasAreas = estudantes.filter((e) => e.fk_area === null).length

  const pontos: Coordenada[] = foco
    ? [coordenadaDo(foco)!]
    : selecionado
      ? ativas.filter((a) => selecionado.idsAreas.has(a.id)).flatMap((a) => a.poligono)
      : [...ativas.flatMap((a) => a.poligono), ...comLocal.map((e) => coordenadaDo(e)!)]

  // Abre o balão do passageiro em foco depois do voo até ele.
  useEffect(() => {
    if (carregando || idFoco === null) return
    const temporizador = window.setTimeout(() => marcadores.current.get(idFoco)?.openPopup(), 1300)
    return () => window.clearTimeout(temporizador)
  }, [carregando, idFoco])

  const escolher = (id: number | null) => setParametros(id ? { aba: 'geral', motorista: String(id) } : { aba: 'geral' }, { replace: true })

  return (
    <>
      <PainelLateral>
        <Cartao>
          <div className="grid grid-cols-2 gap-3 pt-5">
            <NumeroResumo rotulo="Passageiros no mapa" valor={comLocal.length} />
            <NumeroResumo rotulo="Bairros" valor={ativas.length} />
            <NumeroResumo rotulo="Rotas ativas" valor={rotas.filter((r) => r.status === 'ativo').length} />
            <NumeroResumo rotulo="Fora das áreas" valor={foraDasAreas} alerta={foraDasAreas > 0} />
          </div>
        </Cartao>

        <Cartao titulo="Motoristas">
          <ul className="space-y-1">
            <li>
              <BotaoLista
                ativo={selecionado === null}
                cor="#1B3C59"
                titulo="Todos os motoristas"
                detalhe={`${motoristas.length} com bairro definido`}
                aoClicar={() => escolher(null)}
              />
            </li>
            {carregando && [1, 2, 3].map((n) => <li key={n} className="esqueleto h-12" />)}
            {motoristas.map((m, i) => (
              <li key={m.id} className="animate-surgir" style={{ animationDelay: `${i * 40}ms` }}>
                <BotaoLista
                  ativo={selecionado?.id === m.id}
                  cor={corDoMotorista(m.id)}
                  titulo={m.nome}
                  detalhe={`${m.bairros.join(', ')} · ${m.passageiros} passageiro(s)`}
                  aoClicar={() => escolher(m.id)}
                />
              </li>
            ))}
          </ul>
          {selecionado && (
            <button
              onClick={() => setParametros({ aba: 'rotas', motorista: String(selecionado.id) })}
              className="group mt-3 flex w-full items-center justify-center gap-1 rounded-xl bg-laranja/10 py-2 text-sm font-bold text-laranja transition-colors hover:bg-laranja/15"
            >
              Ver as rotas de {selecionado.nome.split(' ')[0]}
              <Icone nome="seta" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          )}
        </Cartao>

        <Cartao titulo="Camadas">
          <div className="space-y-2.5 text-sm">
            <Alternador rotulo="Nomes dos passageiros" ligado={mostrarNomes} aoMudar={setMostrarNomes} />
            {mostrarNomes && zoom < ZOOM_NOMES && <p className="text-xs text-slate-400">Aproxime o mapa para ver os nomes.</p>}
            <Alternador rotulo="Bairros dos motoristas" ligado={mostrarAreas} aoMudar={setMostrarAreas} />
            <Alternador rotulo="Instituições" ligado={mostrarInstituicoes} aoMudar={setMostrarInstituicoes} />
          </div>
          {semLocal > 0 && (
            <p className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
              <Icone nome="alerta" className="h-4 w-4 shrink-0" />
              {semLocal} passageiro(s) sem localização no endereço não aparecem no mapa.
            </p>
          )}
        </Cartao>
      </PainelLateral>

      {!carregando && <Enquadrar pontos={pontos} chave={`geral-${idMotorista}-${idFoco}-${ativas.length}-${comLocal.length}`} />}
      <AcompanharZoom aoMudar={setZoom} />
      {mostrarAreas && <CamadaAreas areas={ativas} idMotoristaDestaque={selecionado?.id ?? null} />}
      {mostrarInstituicoes && instituicoes.map((i) => <MarcadorInstituicao key={i.id} instituicao={i} />)}
      {comLocal.map((estudante) => {
        const foraDoMotorista = selecionado && (estudante.fk_area === null || !selecionado.idsAreas.has(estudante.fk_area))
        const variante = foraDoMotorista ? 'apagado' : estudante.fk_area === null ? 'sem-area' : 'normal'
        return (
          <MarcadorPassageiro
            key={`${estudante.id}-${variante}`}
            estudante={estudante}
            posicao={coordenadaDo(estudante)!}
            variante={variante}
            mostrarNome={mostrarNomes && (zoom >= ZOOM_NOMES || estudante.id === idFoco)}
            motorista={estudante.fk_area ? motoristaDaArea.get(estudante.fk_area) : null}
            aoMontar={(marcador) => {
              if (marcador) marcadores.current.set(estudante.id, marcador)
              else marcadores.current.delete(estudante.id)
            }}
          />
        )
      })}
    </>
  )
}

function AcompanharZoom({ aoMudar }: { aoMudar: (zoom: number) => void }) {
  const mapa = useMapEvents({ zoomend: () => aoMudar(mapa.getZoom()) })
  return null
}
