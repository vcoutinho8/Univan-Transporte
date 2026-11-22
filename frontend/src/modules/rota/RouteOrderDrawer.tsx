import L from 'leaflet'
import { useEffect, useMemo, useState } from 'react'
import { Marker, Tooltip } from 'react-leaflet'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Gaveta from '../../shared/components/Drawer.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { ErroApi } from '../../shared/services/api.ts'
import { formatarHorario } from '../../shared/utils/formatar.ts'
import type { Coordenada } from '../area/types.ts'
import { ROTULOS_TURNO, type Turno } from '../estudante/types.ts'
import { Enquadrar, LinhaDirecional, MapaBase } from '../mapa/MapLayers.tsx'
import { iconeInstituicao } from '../mapa/mapUtils.ts'
import { useTrajeto } from '../mapa/routingService.ts'
import { servicoRota } from './routeService.ts'
import type { OrdemDasParadas, SequenciaDaOrdem } from './types.ts'

interface Propriedades {
  idMotorista: number
  turno: Turno
  /** Depois de aplicar: a tela recarrega os passageiros (os horários mudaram). */
  aoAplicar: () => Promise<void>
  aoFechar: () => void
}

const duracao = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min} min`)

const ICONE_CASA = L.divIcon({
  className: '',
  html: '<div class="pino pino-instituicao" style="background:#0ea5e9"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg></div>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
})

function iconeNumero(n: number) {
  return L.divIcon({ className: '', html: `<div class="pino"><span>${n}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 41], tooltipAnchor: [0, -40] })
}

/** Quadro "Atual x Sugerida": km, tempo e chegada. */
function Comparacao({ atual, nova, rotuloNova }: { atual: SequenciaDaOrdem; nova: SequenciaDaOrdem; rotuloNova: string }) {
  const linha = (rotulo: string, a: string, b: string, melhor: boolean) => (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-1.5 text-sm">
      <span className="text-slate-500">{rotulo}</span>
      <span className="w-20 text-right font-semibold text-slate-400 tabular-nums">{a}</span>
      <span className={`w-20 text-right font-extrabold tabular-nums ${melhor ? 'text-emerald-600' : 'text-marinho'}`}>{b}</span>
    </div>
  )
  return (
    <div className="rounded-2xl bg-fundo/70 p-4">
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 pb-1 text-[11px] font-bold tracking-wide text-slate-400 uppercase">
        <span />
        <span className="w-20 text-right">Atual</span>
        <span className="w-20 text-right">{rotuloNova}</span>
      </div>
      {linha('Distância', `${atual.distancia_km.toFixed(1)} km`, `${nova.distancia_km.toFixed(1)} km`, nova.distancia_km < atual.distancia_km)}
      {linha('Tempo ao volante', duracao(atual.duracao_min), duracao(nova.duracao_min), nova.duracao_min < atual.duracao_min)}
      {linha('Chegada na última faculdade', formatarHorario(atual.chegada), formatarHorario(nova.chegada), (nova.chegada ?? '') < (atual.chegada ?? ''))}
    </div>
  )
}

/**
 * Melhor ordem das paradas da ida (casa do motorista → passageiros → faculdades), calculada pela API
 * com tempos reais pelas ruas. O usuário pode ajustar à mão (↑ ↓) e aplicar: cada passageiro recebe
 * o horário de embarque calculado e a fila das viagens passa a seguir essa ordem.
 */
export default function GavetaOrdem({ idMotorista, turno, aoAplicar, aoFechar }: Propriedades) {
  const [ordem, setOrdem] = useState<OrdemDasParadas | null>(null)
  const [escolhida, setEscolhida] = useState<number[]>([])
  const [simulada, setSimulada] = useState<OrdemDasParadas | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aplicando, setAplicando] = useState(false)
  const [aplicada, setAplicada] = useState(false)

  useEffect(() => {
    servicoRota
      .ordem(idMotorista, turno)
      .then((o) => {
        setOrdem(o)
        setEscolhida(o.sugerida.paradas.filter((p) => p.fk_estudante).map((p) => p.fk_estudante!))
      })
      .catch((e) => setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Não foi possível calcular a ordem.'))
  }, [idMotorista, turno])

  const sugeridaIds = useMemo(() => ordem?.sugerida.paradas.filter((p) => p.fk_estudante).map((p) => p.fk_estudante!) ?? [], [ordem])
  const manual = escolhida.join(',') !== sugeridaIds.join(',')

  // Ordem mexida à mão: recalcula horários e totais (sem gravar).
  useEffect(() => {
    if (!ordem || !manual) return setSimulada(null)
    const temporizador = window.setTimeout(() => {
      servicoRota
        .simularOrdem(idMotorista, turno, escolhida)
        .then(setSimulada)
        .catch(() => setSimulada(null))
    }, 250)
    return () => window.clearTimeout(temporizador)
  }, [escolhida, manual, ordem, idMotorista, turno])

  const sequencia = manual ? simulada?.sugerida ?? null : ordem?.sugerida ?? null
  const pontos: Coordenada[] = useMemo(
    () => [
      ...(ordem?.partida ? [[ordem.partida.latitude, ordem.partida.longitude] as Coordenada] : []),
      ...(sequencia?.paradas.map((p) => [p.latitude, p.longitude] as Coordenada) ?? []),
    ],
    [ordem, sequencia],
  )
  const { trajeto } = useTrajeto(pontos)

  function mover(indice: number, delta: number) {
    const nova = [...escolhida]
    const alvo = indice + delta
    if (alvo < 0 || alvo >= nova.length) return
    ;[nova[indice], nova[alvo]] = [nova[alvo], nova[indice]]
    setEscolhida(nova)
    setAplicada(false)
  }

  async function aplicar() {
    setAplicando(true)
    setErro(null)
    try {
      const nova = await servicoRota.aplicarOrdem(idMotorista, turno, escolhida)
      setOrdem(nova)
      setEscolhida(nova.atual.paradas.filter((p) => p.fk_estudante).map((p) => p.fk_estudante!))
      setSimulada(null)
      setAplicada(true)
      await aoAplicar()
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Não foi possível aplicar a ordem.')
    } finally {
      setAplicando(false)
    }
  }

  const igualAtual = ordem && escolhida.join(',') === ordem.atual.paradas.filter((p) => p.fk_estudante).map((p) => p.fk_estudante).join(',')
  let numero = 0

  return (
    <Gaveta
      titulo="Melhor ordem das paradas"
      descricao={ordem ? `${ordem.motorista.nome} · ida da ${ROTULOS_TURNO[turno].toLowerCase()}` : 'Calculando...'}
      aoFechar={aoFechar}
      largura="max-w-2xl"
    >
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
        {erro && <Alerta mensagem={erro} />}
        {!ordem && !erro && (
          <div className="space-y-3">
            <div className="esqueleto h-24" />
            <div className="esqueleto h-56" />
            <div className="esqueleto h-40" />
          </div>
        )}

        {ordem && sequencia && (
          <>
            {ordem.economia_min > 0 && !manual && !igualAtual ? (
              <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500 text-white">
                  <Icone nome="tendencia" className="h-5 w-5" />
                </span>
                <p className="text-sm">
                  A ordem sugerida economiza <strong>{duracao(ordem.economia_min)}</strong> por viagem (
                  {(ordem.atual.distancia_km - ordem.sugerida.distancia_km).toFixed(1)} km a menos).
                </p>
              </div>
            ) : igualAtual && !manual ? (
              <div className="flex items-center gap-3 rounded-2xl bg-sky-50 p-4 text-sky-800">
                <Icone nome="ok" className="h-5 w-5 shrink-0" />
                <p className="text-sm">{aplicada ? 'Ordem aplicada! As próximas viagens já seguem esta ordem.' : 'A ordem atual já é a melhor encontrada.'}</p>
              </div>
            ) : null}

            <Comparacao atual={ordem.atual} nova={sequencia} rotuloNova={manual ? 'Sua ordem' : 'Sugerida'} />

            <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
              <MapaBase className="h-60" rolagem={false}>
                <Enquadrar pontos={pontos} chave={`${escolhida.join(',')}-${pontos.length}`} />
                {pontos.length > 1 && <LinhaDirecional pontos={trajeto?.linha ?? pontos} cor="#F2600C" tracejada={!trajeto} />}
                {ordem.partida && (
                  <Marker position={[ordem.partida.latitude, ordem.partida.longitude]} icon={ICONE_CASA}>
                    <Tooltip direction="top">Saída: casa do motorista</Tooltip>
                  </Marker>
                )}
                {sequencia.paradas.map((p, i) =>
                  p.tipo === 'faculdade' ? (
                    <Marker key={`f-${i}`} position={[p.latitude, p.longitude]} icon={iconeInstituicao()}>
                      <Tooltip direction="top">{p.nome}</Tooltip>
                    </Marker>
                  ) : (
                    <Marker key={p.fk_estudante} position={[p.latitude, p.longitude]} icon={iconeNumero(i + 1)}>
                      <Tooltip direction="top">{p.nome}</Tooltip>
                    </Marker>
                  ),
                )}
              </MapaBase>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                  {manual ? 'Sua ordem (ajustada à mão)' : 'Ordem sugerida'}
                </p>
                {manual && (
                  <button onClick={() => setEscolhida(sugeridaIds)} className="text-xs font-bold text-laranja hover:underline">
                    Voltar para a sugerida
                  </button>
                )}
              </div>
              <ol className="space-y-1.5">
                {ordem.partida && (
                  <li className="flex items-center gap-3 rounded-xl bg-sky-50 px-3 py-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-500 text-white">
                      <Icone nome="van" className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-marinho">Saída · casa do motorista</span>
                      <span className="block truncate text-xs text-slate-500">{ordem.partida.endereco}</span>
                    </span>
                    <span className="text-sm font-extrabold text-marinho tabular-nums">{formatarHorario(ordem.horario_saida)}</span>
                  </li>
                )}
                {sequencia.paradas.map((p) => {
                  if (p.tipo === 'faculdade')
                    return (
                      <li key={`f-${p.nome}`} className="flex items-center gap-3 rounded-xl bg-marinho/5 px-3 py-2">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-marinho text-white">
                          <Icone nome="escola" className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-marinho">{p.nome}</span>
                          <span className="block text-xs text-slate-500">{p.detalhe}</span>
                        </span>
                        <span className="text-sm font-extrabold text-marinho tabular-nums">{formatarHorario(p.horario)}</span>
                      </li>
                    )
                  const indice = escolhida.indexOf(p.fk_estudante!)
                  numero += 1
                  return (
                    <li key={p.fk_estudante} className="group flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-slate-200/70 transition-colors hover:bg-fundo/60">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-laranja text-xs font-extrabold text-white">{numero}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-marinho">{p.nome}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {p.detalhe}
                          {p.instituicao && ` · ${p.instituicao}`}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-extrabold text-marinho tabular-nums">{formatarHorario(p.horario)}</span>
                        {p.horario_atual && p.horario_atual.slice(0, 5) !== p.horario?.slice(0, 5) && (
                          <span className="block text-[11px] text-slate-400 line-through tabular-nums">{formatarHorario(p.horario_atual)}</span>
                        )}
                      </span>
                      <span className="flex flex-col">
                        <button
                          onClick={() => mover(indice, -1)}
                          disabled={indice === 0}
                          aria-label={`Subir ${p.nome}`}
                          className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-marinho disabled:opacity-20"
                        >
                          <Icone nome="chevron" className="h-4 w-4 -rotate-90" />
                        </button>
                        <button
                          onClick={() => mover(indice, 1)}
                          disabled={indice === escolhida.length - 1}
                          aria-label={`Descer ${p.nome}`}
                          className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-marinho disabled:opacity-20"
                        >
                          <Icone nome="chevron" className="h-4 w-4 rotate-90" />
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ol>
            </div>

            <div className="space-y-1 text-xs text-slate-500">
              {ordem.avisos.map((a) => (
                <p key={a} className="flex items-start gap-1.5 text-amber-700">
                  <Icone nome="alerta" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {a}
                </p>
              ))}
              <p>
                {ordem.pelas_ruas ? 'Tempos reais pelas ruas (OpenStreetMap)' : 'Tempos estimados (servidor de rotas fora do ar)'} · 1 min por
                embarque · horários a partir da saída {formatarHorario(ordem.horario_saida)}.
              </p>
            </div>
          </>
        )}
      </div>

      {ordem && (
        <footer className="flex items-center justify-end gap-2 border-t border-slate-100 bg-white px-6 py-4">
          <Botao variante="secundario" onClick={aoFechar}>
            Fechar
          </Botao>
          <Botao onClick={() => void aplicar()} disabled={aplicando || Boolean(igualAtual) || (manual && !simulada)}>
            <Icone nome="ok" className="h-4 w-4" />
            {aplicando ? 'Aplicando...' : 'Aplicar esta ordem'}
          </Botao>
        </footer>
      )}
    </Gaveta>
  )
}
