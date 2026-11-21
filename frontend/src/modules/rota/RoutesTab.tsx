import type L from 'leaflet'
import { useMemo, useRef, useState } from 'react'
import { CircleMarker } from 'react-leaflet'
import { useSearchParams } from 'react-router-dom'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Cartao from '../../shared/components/Card.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { ErroApi } from '../../shared/services/api.ts'
import { formatarHorario, iniciais } from '../../shared/utils/formatar.ts'
import type { Coordenada } from '../area/types.ts'
import { ROTULOS_TURNO, type Turno } from '../estudante/types.ts'
import { PainelLateral, useDadosMapa } from '../mapa/mapContext.tsx'
import { CamadaAreas, Enquadrar, LinhaDirecional, MarcadorInstituicao, MarcadorPassageiro } from '../mapa/MapLayers.tsx'
import { coordenadaDo, corDoMotorista } from '../mapa/mapUtils.ts'
import { NumeroResumo, Segmentos } from '../mapa/MapWidgets.tsx'
import { useTrajeto } from '../mapa/routingService.ts'
import FormularioRota, { nomeCurtoInstituicao } from './RouteForm.tsx'
import { servicoRota } from './routeService.ts'
import { CORES_DESTINO, montarViagem, passageirosDaRota, somarMinutos } from './tripUtils.ts'
import { descreverDias, type DadosRota, type Rota } from './types.ts'

const TURNOS: Turno[] = ['manha', 'tarde', 'noite']
/** Tempo parado em cada embarque/desembarque, somado à estimativa de chegada. */
const MINUTOS_POR_PARADA = 1

const COR_IDA = '#F2600C'
const COR_SETA_IDA = '#1B3C59'
const COR_VOLTA = '#0284C7'
const COR_SETA_VOLTA = '#F59E0B'

type SentidoViagem = 'ida' | 'volta' | 'ambas'
type Formulario = { modo: 'fechado' } | { modo: 'nova' } | { modo: 'editar'; rota: Rota }

/**
 * Aba Rotas, centrada no motorista: escolhe o motorista e o turno e vê a VIAGEM inteira dele
 * (todas as rotas do turno juntas), podendo alternar a visualização entre Ida, Volta ou Ambas.
 * URL: ?motorista=<id>&turno=<turno>&rota=<id destacada>&sentido=<ida|volta|ambas>.
 */
export default function AbaRotas() {
  const dados = useDadosMapa()
  const { ativas, comLocal, estudantes, instituicoes, rotas, motoristas, carregando } = dados
  const [parametros, setParametros] = useSearchParams()
  const idMotorista = Number(parametros.get('motorista')) || null
  const idDestaque = Number(parametros.get('rota')) || null
  const sentidoUrl = parametros.get('sentido') as SentidoViagem | null
  const sentido: SentidoViagem =
    sentidoUrl === 'ida' || sentidoUrl === 'volta' || sentidoUrl === 'ambas' ? sentidoUrl : 'ida'

  const [formulario, setFormulario] = useState<Formulario>({ modo: 'fechado' })
  const [trajetoInteiro, setTrajetoInteiro] = useState(false)
  const [aviso, setAviso] = useState<{ mensagem: string; tipo: 'erro' | 'sucesso' } | null>(null)
  const marcadores = useRef(new Map<number, L.Marker>())

  // Resumo de cada motorista: bairros e, por turno, quantas rotas e passageiros.
  const resumos = useMemo(
    () =>
      motoristas
        .map((m) => {
          const bairros = ativas.filter((a) => a.fk_motorista === m.id).map((a) => a.nome)
          const turnos = TURNOS.map((turno) => {
            const doTurno = rotas.filter((r) => r.status === 'ativo' && r.fk_motorista === m.id && r.turno === turno)
            return { turno, rotas: doTurno.length, passageiros: doTurno.reduce((soma, r) => soma + r.total_passageiros, 0) }
          }).filter((t) => t.rotas > 0)
          return { ...m, bairros, turnos, passageiros: turnos.reduce((soma, t) => soma + t.passageiros, 0) }
        })
        .sort((a, b) => b.passageiros - a.passageiros || a.nome.localeCompare(b.nome)),
    [motoristas, ativas, rotas],
  )

  const motorista = resumos.find((m) => m.id === idMotorista) ?? null
  const turnoUrl = parametros.get('turno') as Turno | null
  const turno: Turno | null =
    motorista?.turnos.find((t) => t.turno === turnoUrl)?.turno ??
    [...(motorista?.turnos ?? [])].sort((a, b) => b.passageiros - a.passageiros)[0]?.turno ??
    null

  const viagem = useMemo(
    () => (motorista && turno ? montarViagem(motorista.id, turno, rotas, dados.areas, estudantes, instituicoes) : null),
    [motorista, turno, rotas, dados.areas, estudantes, instituicoes],
  )
  const corDestino = (idRota: number) =>
    CORES_DESTINO[Math.max(0, viagem?.destinos.findIndex((d) => d.rota.id === idRota) ?? 0) % CORES_DESTINO.length]
  const rotasDoTurno = motorista && turno ? rotas.filter((r) => r.fk_motorista === motorista.id && r.turno === turno) : []

  // Pontos da IDA: embarques na ordem (1 → N) e depois as faculdades.
  const paradasNoMapa = viagem?.paradas.filter((p) => p.ponto) ?? []
  const destinosNoMapa = viagem?.destinos.filter((d) => d.ponto) ?? []
  const pontosIda: Coordenada[] = [...paradasNoMapa.map((p) => p.ponto!), ...destinosNoMapa.map((d) => d.ponto!)]

  // Pontos da VOLTA: faculdades (ordem inversa) e depois desembarque nas casas (N → 1).
  const destinosVolta = useMemo(() => [...(viagem?.destinos ?? [])].reverse(), [viagem])
  const paradasVolta = useMemo(() => [...(viagem?.paradas ?? [])].reverse(), [viagem])
  const destinosVoltaNoMapa = destinosVolta.filter((d) => d.ponto)
  const paradasVoltaNoMapa = paradasVolta.filter((p) => p.ponto)
  const pontosVolta: Coordenada[] = [...destinosVoltaNoMapa.map((d) => d.ponto!), ...paradasVoltaNoMapa.map((p) => p.ponto!)]

  const mostrarIda = sentido === 'ida' || sentido === 'ambas'
  const mostrarVolta = sentido === 'volta' || sentido === 'ambas'

  const { trajeto: trajetoIda, carregando: tracandoIda } = useTrajeto(mostrarIda ? pontosIda : [])
  const { trajeto: trajetoVolta, carregando: tracandoVolta } = useTrajeto(mostrarVolta ? pontosVolta : [])

  const tracando = (mostrarIda && tracandoIda) || (mostrarVolta && tracandoVolta)

  // Horários estimados da IDA (parte do 1º embarque).
  const inicioIda = paradasNoMapa[0]?.estudante.horario_embarque?.slice(0, 5) ?? null
  const chegadaNaIda = (indice: number) =>
    trajetoIda && inicioIda
      ? somarMinutos(inicioIda, trajetoIda.trechosMin.slice(0, indice).reduce((s, t) => s + t, 0) + indice * MINUTOS_POR_PARADA)
      : null

  // Horários estimados da VOLTA (parte do horário de volta da 1ª faculdade).
  const inicioVolta = destinosVoltaNoMapa[0]?.rota.horario_volta?.slice(0, 5) ?? null
  const chegadaNaVolta = (indice: number) =>
    trajetoVolta && inicioVolta
      ? somarMinutos(inicioVolta, trajetoVolta.trechosMin.slice(0, indice).reduce((s, t) => s + t, 0) + indice * MINUTOS_POR_PARADA)
      : null

  const cor = corDoMotorista(motorista?.id)
  const bairrosDoMotorista = motorista ? ativas.filter((a) => a.fk_motorista === motorista.id) : []
  const pontosEnquadrar: Coordenada[] = motorista
    ? trajetoInteiro || sentido === 'volta' || sentido === 'ambas'
      ? [
          ...pontosIda,
          ...(mostrarIda && trajetoIda ? trajetoIda.linha : []),
          ...(mostrarVolta && trajetoVolta ? trajetoVolta.linha : []),
        ]
      : [...bairrosDoMotorista.flatMap((a) => a.poligono), ...paradasNoMapa.map((p) => p.ponto!)]
    : ativas.flatMap((a) => a.poligono)

  const navegar = (novos: Record<string, string | number | null>) => {
    const atuais: Record<string, string | number | null> = {
      motorista: idMotorista,
      turno: parametros.get('turno'),
      rota: idDestaque,
      sentido,
    }
    const valores = { ...atuais, ...novos }
    const limpos = Object.fromEntries(Object.entries(valores).filter(([, v]) => v !== null && v !== '').map(([k, v]) => [k, String(v)]))
    setParametros({ aba: 'rotas', ...limpos }, { replace: true })
  }
  const escolherMotorista = (id: number | null) => {
    setTrajetoInteiro(false)
    setParametros(id ? { aba: 'rotas', motorista: String(id), sentido } : { aba: 'rotas' }, { replace: true })
  }

  async function salvar(dadosRota: DadosRota) {
    const salva =
      formulario.modo === 'editar'
        ? await servicoRota.atualizar(formulario.rota.id, dadosRota)
        : await servicoRota.cadastrar(dadosRota)
    setFormulario({ modo: 'fechado' })
    await dados.recarregar()
    setParametros(
      { aba: 'rotas', motorista: String(salva.fk_motorista), turno: salva.turno, rota: String(salva.id), sentido },
      { replace: true },
    )
    setAviso({ mensagem: `Rota salva: ${salva.nome}.`, tipo: 'sucesso' })
  }

  async function alternarSituacao(r: Rota) {
    if (r.status === 'ativo' && !window.confirm(`Inativar a rota ${r.nome}? Ela para de gerar viagens; o histórico fica.`)) return
    try {
      await (r.status === 'ativo' ? servicoRota.inativar(r.id) : servicoRota.reativar(r.id))
      await dados.recarregar()
      setAviso({ mensagem: `Rota ${r.status === 'ativo' ? 'inativada' : 'reativada'}.`, tipo: 'sucesso' })
    } catch (e) {
      setAviso({ mensagem: e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado.', tipo: 'erro' })
    }
  }

  const trajetoPrincipal = sentido === 'volta' ? trajetoVolta : trajetoIda

  return (
    <>
      <PainelLateral>
        {aviso && (
          <div className="animate-surgir">
            <Alerta mensagem={aviso.mensagem} tipo={aviso.tipo} aoFechar={() => setAviso(null)} />
          </div>
        )}

        {!motorista ? (
          <Cartao
            titulo="Viagens por motorista"
            acoes={
              <Botao className="px-3 py-1.5" onClick={() => setFormulario({ modo: 'nova' })}>
                <Icone nome="mais" className="h-4 w-4" />
                Nova rota
              </Botao>
            }
          >
            <p className="mb-3 text-xs text-slate-500">Escolha um motorista para ver a viagem dele no mapa, pelas ruas.</p>
            <ul className="space-y-2">
              {carregando && [1, 2, 3].map((n) => <li key={n} className="esqueleto h-16" />)}
              {resumos.map((m, i) => (
                <li key={m.id} className="animate-surgir" style={{ animationDelay: `${i * 40}ms` }}>
                  <button
                    onClick={() => escolherMotorista(m.id)}
                    className="group w-full rounded-xl p-3 text-left ring-1 ring-slate-200/70 transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-slate-300"
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-extrabold text-white"
                        style={{ background: corDoMotorista(m.id) }}
                      >
                        {iniciais(m.nome)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-marinho">{m.nome}</span>
                        <span className="block truncate text-xs text-slate-500">{m.bairros.join(', ') || 'Sem bairro definido'}</span>
                      </span>
                      <Icone nome="seta" className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-laranja" />
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {m.turnos.length === 0 && <span className="text-xs text-slate-400">Nenhuma rota ativa</span>}
                      {m.turnos.map((t) => (
                        <span key={t.turno} className="rounded-full bg-fundo px-2.5 py-0.5 text-[11px] font-bold text-marinho">
                          {ROTULOS_TURNO[t.turno]} · {t.passageiros} pass. · {t.rotas} faculdade(s)
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Cartao>
        ) : (
          <>
            <button
              onClick={() => escolherMotorista(null)}
              className="group flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-marinho"
            >
              <Icone nome="seta" className="h-4 w-4 rotate-180 transition-transform group-hover:-translate-x-1" />
              Todos os motoristas
            </button>

            <Cartao className="animate-surgir">
              <div className="space-y-4 pt-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-extrabold text-white" style={{ background: cor }}>
                    {iniciais(motorista.nome)}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-extrabold text-marinho">{motorista.nome}</h2>
                    <p className="truncate text-xs text-slate-500">Bairros: {motorista.bairros.join(', ') || 'nenhum'}</p>
                  </div>
                </div>
                {motorista.turnos.length > 0 ? (
                  <Segmentos
                    opcoes={motorista.turnos.map((t) => ({ valor: t.turno, rotulo: `${ROTULOS_TURNO[t.turno]} (${t.passageiros})` }))}
                    atual={turno!}
                    aoMudar={(t) => navegar({ turno: t, rota: null })}
                  />
                ) : (
                  <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Este motorista não tem rota ativa.</p>
                )}

                {viagem && (
                  <>
                    <div>
                      <p className="mb-1.5 text-xs font-bold tracking-wide text-slate-500 uppercase">Trajeto no mapa</p>
                      <Segmentos
                        opcoes={[
                          { valor: 'ida', rotulo: 'Ida' },
                          { valor: 'volta', rotulo: 'Volta' },
                          { valor: 'ambas', rotulo: 'Ambas' },
                        ]}
                        atual={sentido}
                        aoMudar={(novoSentido) => navegar({ sentido: novoSentido })}
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
                        {mostrarIda && (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-flex items-center">
                              <span className="h-2.5 w-4 rounded-l-full" style={{ background: COR_IDA }} />
                              <span className="h-2.5 w-2.5 rounded-r-full" style={{ background: COR_SETA_IDA }} />
                            </span>
                            Ida (embarque → faculdade)
                          </span>
                        )}
                        {mostrarVolta && (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-flex items-center">
                              <span className="h-2.5 w-4 rounded-l-full" style={{ background: COR_VOLTA }} />
                              <span className="h-2.5 w-2.5 rounded-r-full" style={{ background: COR_SETA_VOLTA }} />
                            </span>
                            Volta (faculdade → casa)
                          </span>
                        )}
                      </div>
                    </div>

                    {sentido === 'ambas' ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Medida
                          rotulo="Distância (Ida)"
                          valor={trajetoIda ? `${trajetoIda.distanciaKm.toFixed(1)} km` : null}
                          carregando={tracandoIda}
                        />
                        <Medida
                          rotulo="Distância (Volta)"
                          valor={trajetoVolta ? `${trajetoVolta.distanciaKm.toFixed(1)} km` : null}
                          carregando={tracandoVolta}
                        />
                        <Medida
                          rotulo="Tempo Ida"
                          valor={
                            trajetoIda
                              ? `${Math.floor(trajetoIda.duracaoMin / 60)}h${String(Math.round(trajetoIda.duracaoMin % 60)).padStart(2, '0')}`
                              : null
                          }
                          carregando={tracandoIda}
                        />
                        <Medida
                          rotulo="Tempo Volta"
                          valor={
                            trajetoVolta
                              ? `${Math.floor(trajetoVolta.duracaoMin / 60)}h${String(Math.round(trajetoVolta.duracaoMin % 60)).padStart(2, '0')}`
                              : null
                          }
                          carregando={tracandoVolta}
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <NumeroResumo rotulo={sentido === 'ida' ? 'Embarques' : 'Desembarques'} valor={viagem.paradas.length} />
                        <NumeroResumo rotulo="Faculdades" valor={viagem.destinos.length} />
                        <Medida
                          rotulo={`Distância (${sentido === 'ida' ? 'ida' : 'volta'})`}
                          valor={trajetoPrincipal ? `${trajetoPrincipal.distanciaKm.toFixed(1)} km` : null}
                          carregando={tracando}
                        />
                        <Medida
                          rotulo="Tempo ao volante"
                          valor={
                            trajetoPrincipal
                              ? `${Math.floor(trajetoPrincipal.duracaoMin / 60)}h${String(Math.round(trajetoPrincipal.duracaoMin % 60)).padStart(2, '0')}`
                              : null
                          }
                          carregando={tracando}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </Cartao>

            {viagem && turno && (
              <Cartao
                titulo={`Viagem da ${ROTULOS_TURNO[turno].toLowerCase()} · ${
                  sentido === 'ida' ? 'Ida' : sentido === 'volta' ? 'Volta' : 'Ida e Volta'
                }`}
                className="animate-surgir"
              >
                {viagem.paradas.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum passageiro nas rotas deste turno.</p>
                ) : sentido === 'volta' ? (
                  <ol className="relative space-y-2.5 before:absolute before:top-3 before:bottom-3 before:left-[13px] before:w-0.5 before:bg-slate-200">
                    {destinosVolta.map((d) => (
                      <li
                        key={d.rota.id}
                        className={`relative flex items-center gap-3 ${idDestaque !== null && d.rota.id !== idDestaque ? 'opacity-35' : ''}`}
                      >
                        <span
                          className="z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ring-4 ring-white"
                          style={{ background: corDestino(d.rota.id) }}
                        >
                          <Icone nome="escola" className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 text-sm font-bold text-marinho">
                          {d.instituicao.nome}
                          <span className="block text-xs font-normal text-slate-500">
                            Saída de {d.passageiros} · volta {formatarHorario(d.rota.horario_volta)}
                          </span>
                        </span>
                      </li>
                    ))}
                    {paradasVolta.map((p, i) => {
                      const indiceNoMapa = paradasVoltaNoMapa.indexOf(p)
                      const chegadaCasa =
                        indiceNoMapa >= 0 ? chegadaNaVolta(destinosVoltaNoMapa.length + indiceNoMapa) : null
                      const apagada = idDestaque !== null && p.rota.id !== idDestaque
                      return (
                        <li key={p.estudante.id} className={`relative transition-opacity ${apagada ? 'opacity-35' : ''}`}>
                          <button
                            onClick={() => marcadores.current.get(p.estudante.id)?.openPopup()}
                            className="flex w-full items-center gap-3 rounded-lg text-left hover:bg-fundo"
                          >
                            <span
                              className="z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold text-white ring-4 ring-white"
                              style={{ background: COR_VOLTA }}
                            >
                              {i + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-marinho">{p.estudante.nome}</span>
                              <span className="block truncate text-xs text-slate-500">
                                {chegadaCasa ? `chegada ~${chegadaCasa} · ` : ''}
                                {p.estudante.endereco.bairro}
                                {indiceNoMapa < 0 && ' · sem localização'}
                              </span>
                            </span>
                            <span
                              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                              style={{ background: corDestino(p.rota.id) }}
                              title={p.rota.instituicao.nome}
                            >
                              {nomeCurtoInstituicao(p.rota.instituicao.nome)}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                ) : (
                  <ol className="relative space-y-2.5 before:absolute before:top-3 before:bottom-3 before:left-[13px] before:w-0.5 before:bg-slate-200">
                    {viagem.paradas.map((p, i) => {
                      const indiceNoMapa = paradasNoMapa.indexOf(p)
                      const apagada = idDestaque !== null && p.rota.id !== idDestaque
                      return (
                        <li key={p.estudante.id} className={`relative transition-opacity ${apagada ? 'opacity-35' : ''}`}>
                          <button
                            onClick={() => marcadores.current.get(p.estudante.id)?.openPopup()}
                            className="flex w-full items-center gap-3 rounded-lg text-left hover:bg-fundo"
                          >
                            <span
                              className="z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold text-white ring-4 ring-white"
                              style={{ background: sentido === 'ambas' ? COR_IDA : cor }}
                            >
                              {i + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-marinho">{p.estudante.nome}</span>
                              <span className="block truncate text-xs text-slate-500">
                                {formatarHorario(p.estudante.horario_embarque)} · {p.estudante.endereco.bairro}
                                {indiceNoMapa < 0 && ' · sem localização'}
                              </span>
                            </span>
                            <span
                              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                              style={{ background: corDestino(p.rota.id) }}
                              title={p.rota.instituicao.nome}
                            >
                              {nomeCurtoInstituicao(p.rota.instituicao.nome)}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                    {viagem.destinos.map((d) => {
                      const indiceNoMapa = destinosNoMapa.indexOf(d)
                      const chegada = indiceNoMapa >= 0 ? chegadaNaIda(paradasNoMapa.length + indiceNoMapa) : null
                      return (
                        <li key={d.rota.id} className={`relative flex items-center gap-3 ${idDestaque !== null && d.rota.id !== idDestaque ? 'opacity-35' : ''}`}>
                          <span className="z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ring-4 ring-white" style={{ background: corDestino(d.rota.id) }}>
                            <Icone nome="escola" className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 text-sm font-bold text-marinho">
                            {d.instituicao.nome}
                            <span className="block text-xs font-normal text-slate-500">
                              Desembarque de {d.passageiros} · {chegada ? `chegada ~${chegada}` : `ida ${formatarHorario(d.rota.horario_ida)}`}
                            </span>
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                )}
                {sentido === 'ida' && pontosIda.length > 1 && (
                  <button
                    onClick={() => setTrajetoInteiro(!trajetoInteiro)}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-fundo py-2 text-sm font-bold text-marinho transition-colors hover:bg-slate-200/70"
                  >
                    <Icone nome={trajetoInteiro ? 'pino' : 'rota'} className="h-4 w-4" />
                    {trajetoInteiro ? 'Ver só os embarques' : 'Ver o trajeto até as faculdades'}
                  </button>
                )}
                <p className="mt-3 text-xs text-slate-400">
                  {trajetoIda || trajetoVolta
                    ? `Trajeto pelas ruas (OpenStreetMap) com setas direcionais. ${MINUTOS_POR_PARADA} min por parada.`
                    : tracando
                      ? 'Calculando o trajeto pelas ruas...'
                      : 'Sem o trajeto pelas ruas agora: a linha liga os pontos em linha reta.'}
                </p>
              </Cartao>
            )}

            {turno && (
              <Cartao
                titulo={`Rotas da ${ROTULOS_TURNO[turno].toLowerCase()} (${rotasDoTurno.length})`}
                acoes={
                  <button onClick={() => setFormulario({ modo: 'nova' })} className="text-xs font-bold text-laranja hover:underline">
                    + Nova rota
                  </button>
                }
              >
                <p className="mb-2 text-xs text-slate-500">Uma rota por faculdade. Clique para destacar quem ela leva.</p>
                <ul className="space-y-1">
                  {rotasDoTurno.map((r) => {
                    const destacada = r.id === idDestaque
                    const total = r.status === 'ativo' ? passageirosDaRota(r, dados.areas, estudantes).length : 0
                    return (
                      <li
                        key={r.id}
                        className={`flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors ${destacada ? 'bg-laranja/10 ring-1 ring-laranja/40' : 'hover:bg-fundo'} ${
                          r.status === 'inativo' ? 'opacity-60' : ''
                        }`}
                      >
                        <button onClick={() => navegar({ rota: destacada ? null : r.id })} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.status === 'ativo' ? corDestino(r.id) : '#cbd5e1' }} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-marinho">
                              {nomeCurtoInstituicao(r.instituicao.nome)}
                              {r.status === 'inativo' && <span className="ml-1 text-xs font-semibold text-slate-400">(inativa)</span>}
                            </span>
                            <span className="block truncate text-xs text-slate-500">
                              ida {formatarHorario(r.horario_ida)} · volta {formatarHorario(r.horario_volta)} · {descreverDias(r.dias)} · {total} pass.
                            </span>
                          </span>
                        </button>
                        <button
                          onClick={() => setFormulario({ modo: 'editar', rota: r })}
                          title="Editar rota"
                          aria-label={`Editar ${r.nome}`}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-marinho"
                        >
                          <Icone nome="editar" className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => void alternarSituacao(r)}
                          className={`rounded-lg px-2 py-1 text-[11px] font-bold ${r.status === 'ativo' ? 'text-red-600 hover:bg-red-50' : 'text-laranja hover:bg-laranja/10'}`}
                        >
                          {r.status === 'ativo' ? 'Inativar' : 'Reativar'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </Cartao>
            )}
          </>
        )}
      </PainelLateral>

      {formulario.modo !== 'fechado' && (
        <FormularioRota
          rota={formulario.modo === 'editar' ? formulario.rota : null}
          idMotoristaInicial={idMotorista}
          turnoInicial={turno}
          motoristas={motoristas}
          instituicoes={instituicoes}
          areas={dados.areas}
          estudantes={estudantes}
          aoSalvar={salvar}
          aoFechar={() => setFormulario({ modo: 'fechado' })}
        />
      )}

      {!carregando && (
        <Enquadrar
          pontos={pontosEnquadrar}
          chave={`rotas-${idMotorista}-${turno}-${sentido}-${trajetoInteiro}-${paradasNoMapa.length}-${ativas.length}`}
        />
      )}
      <CamadaAreas areas={ativas} idMotoristaDestaque={motorista?.id ?? null} mostrarNomes={!motorista} />

      {motorista && viagem ? (
        <>
          {mostrarIda && pontosIda.length > 1 && (
            <LinhaDirecional
              key={`ida-${idMotorista}-${turno}-${Boolean(trajetoIda)}`}
              pontos={trajetoIda ? trajetoIda.linha : pontosIda}
              cor={COR_IDA}
              corSeta={COR_SETA_IDA}
              tracejada={!trajetoIda}
              opacidade={trajetoIda ? 0.95 : tracandoIda ? 0.4 : 0.9}
              mostrarSetas
            />
          )}

          {mostrarVolta && pontosVolta.length > 1 && (
            <LinhaDirecional
              key={`volta-${idMotorista}-${turno}-${Boolean(trajetoVolta)}`}
              pontos={trajetoVolta ? trajetoVolta.linha : pontosVolta}
              cor={COR_VOLTA}
              corSeta={COR_SETA_VOLTA}
              tracejada={!trajetoVolta}
              opacidade={trajetoVolta ? 0.92 : tracandoVolta ? 0.4 : 0.9}
              mostrarSetas
            />
          )}

          {viagem.destinos.map((d) => (
            <MarcadorInstituicao key={d.rota.id} instituicao={d.instituicao} cor={corDestino(d.rota.id)} />
          ))}

          {(sentido === 'volta' ? paradasVoltaNoMapa : paradasNoMapa).map((p, idx) => {
            const numero =
              sentido === 'volta' ? idx + 1 : viagem.paradas.indexOf(p) + 1
            const apagada = idDestaque !== null && p.rota.id !== idDestaque
            return (
              <MarcadorPassageiro
                key={`${p.estudante.id}-${sentido}-${numero}-${apagada}`}
                estudante={p.estudante}
                posicao={p.ponto!}
                numero={numero}
                variante={apagada ? 'apagado' : 'normal'}
                motorista={motorista.nome}
                aoMontar={(m) => {
                  if (m) marcadores.current.set(p.estudante.id, m)
                  else marcadores.current.delete(p.estudante.id)
                }}
              />
            )
          })}
        </>
      ) : (
        comLocal.map((e) => (
          <CircleMarker
            key={e.id}
            center={coordenadaDo(e)!}
            radius={4}
            interactive={false}
            pathOptions={{ color: '#fff', weight: 1.5, fillColor: e.fk_area ? '#F2600C' : '#EAB308', fillOpacity: 1 }}
          />
        ))
      )}
    </>
  )
}

function Medida({ rotulo, valor, carregando }: { rotulo: string; valor: string | null; carregando: boolean }) {
  return (
    <div className="rounded-xl bg-fundo p-3">
      {carregando ? <div className="esqueleto h-8 w-16" /> : <p className="text-2xl font-extrabold text-marinho tabular-nums">{valor ?? '—'}</p>}
      <p className="text-xs font-semibold text-slate-500">{rotulo}</p>
    </div>
  )
}