import L from 'leaflet'
import { useMemo, useRef, useState } from 'react'
import { CircleMarker, Marker, Tooltip, useMapEvents } from 'react-leaflet'
import { useSearchParams } from 'react-router-dom'

import { pode } from '../../shared/auth/permissoes.ts'
import { useSessao } from '../../shared/auth/useSessao.ts'
import AvisoSemResultado from '../../shared/components/NoResults.tsx'
import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Cartao from '../../shared/components/Card.tsx'
import Modal from '../../shared/components/Modal.tsx'
import { useAviso } from '../../shared/components/NoticeModal.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { ErroApi } from '../../shared/services/api.ts'
import { formatarHorario, iniciais } from '../../shared/utils/formatar.ts'
import type { Coordenada } from '../area/types.ts'
import { enderecoDoPonto } from '../endereco/addressService.ts'
import type { DadosEndereco } from '../endereco/types.ts'
import { ROTULOS_TURNO, type Turno } from '../estudante/types.ts'
import { servicoInstituicao } from '../instituicao/institutionService.ts'
import { servicoMotorista } from '../motorista/driverService.ts'
import type { Instituicao } from '../instituicao/types.ts'
import { PainelLateral, useDadosMapa } from '../mapa/mapContext.tsx'
import { CamadaAreas, Enquadrar, LinhaDirecional, MarcadorInstituicao, MarcadorPassageiro } from '../mapa/MapLayers.tsx'
import { coordenadaDo, corDoMotorista, iconeInstituicao } from '../mapa/mapUtils.ts'
import { NumeroResumo, Segmentos } from '../mapa/MapWidgets.tsx'
import { useTrajeto } from '../mapa/routingService.ts'
import FormularioRota, { nomeCurtoInstituicao } from './RouteForm.tsx'
import GavetaOrdem from './RouteOrderDrawer.tsx'
import { servicoRota } from './routeService.ts'
import { chaveDestino, CORES_DESTINO, montarViagem, passageirosDaRota, somarMinutos, type Destino } from './tripUtils.ts'
import { descreverDias, type DadosRota, type Rota } from './types.ts'

const TURNOS: Turno[] = ['manha', 'tarde', 'noite']
/** Tempo parado em cada embarque/desembarque, somado à estimativa de chegada. */
const MINUTOS_POR_PARADA = 1

const COR_IDA = '#F2600C'
const COR_SETA_IDA = '#1B3C59'
const COR_VOLTA = '#0284C7'
const COR_SETA_VOLTA = '#F59E0B'

type SentidoViagem = 'ida' | 'volta' | 'ambas'

/** Casa/garagem do motorista no mapa: início da ida e fim da volta (gota azul com a casinha). */
const ICONE_CASA = L.divIcon({
  className: '',
  html: '<div class="pino pino-casa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg></div>',
  iconSize: [40, 40],
  iconAnchor: [20, 48],
  tooltipAnchor: [0, -46],
})

/** Clique no mapa (marcar a casa do motorista). */
function CliqueNoMapa({ aoClicar }: { aoClicar: (ponto: Coordenada) => void }) {
  useMapEvents({ click: (e) => aoClicar([Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))]) })
  return null
}

const enderecoEmTexto = (e: Pick<DadosEndereco, 'logradouro' | 'numero' | 'bairro' | 'cidade'>) =>
  `${e.logradouro}${e.numero ? `, ${e.numero}` : ''} · ${e.bairro} · ${e.cidade}`

const nomeDoDestino = (d: Destino) => (d.parada ? `${d.instituicao.nome} · ${d.parada.nome}` : d.instituicao.nome)
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
  // Ajuste do ponto de parada das faculdades: pinos arrastáveis + confirmação antes de salvar.
  const [ajustandoParadas, setAjustandoParadas] = useState(false)
  const [paradaPendente, setParadaPendente] = useState<{ instituicao: Instituicao; ponto: [number, number] } | null>(null)
  const [versaoPinos, setVersaoPinos] = useState(0)
  // Faculdade em foco no ajuste: o mapa aproxima nela, no nível de rua.
  const [focoParada, setFocoParada] = useState<number | null>(null)
  const [salvandoParada, setSalvandoParada] = useState(false)
  const avisosParada = useAviso()
  const [ordemAberta, setOrdemAberta] = useState(false)
  // Casa do motorista: o admin arrasta o pino ou, sem endereço, marca clicando no mapa.
  const podeEditarCasa = pode(useSessao().usuario?.perfil, 'cadastro.editar')
  const [marcandoCasa, setMarcandoCasa] = useState(false)
  const [casaPendente, setCasaPendente] = useState<{ ponto: Coordenada; endereco: DadosEndereco | null; buscando: boolean } | null>(null)
  const [salvandoCasa, setSalvandoCasa] = useState(false)

  async function proporCasa(ponto: Coordenada) {
    setMarcandoCasa(false)
    setCasaPendente({ ponto, endereco: null, buscando: true })
    const endereco = await enderecoDoPonto(ponto)
    setCasaPendente({ ponto, endereco, buscando: false })
  }

  function cancelarCasa() {
    setCasaPendente(null)
    setVersaoPinos((v) => v + 1) // o pino volta para onde estava
  }
  const [novaParada, setNovaParada] = useState<{ instituicao: Instituicao; nome: string } | null>(null)

  async function executarParada(acao: () => Promise<unknown>, titulo: string, descricao: string) {
    setSalvandoParada(true)
    try {
      await acao()
      await Promise.all([dados.recarregarInstituicoes(), dados.recarregar()])
      avisosParada.mostrar({ tipo: 'sucesso', titulo, descricao })
    } catch (e) {
      setVersaoPinos((v) => v + 1)
      avisosParada.erro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado.', 'Não foi possível salvar a parada')
    } finally {
      setSalvandoParada(false)
    }
  }

  function criarParadaExtra() {
    if (!novaParada) return
    const nome = novaParada.nome.trim()
    const base = novaParada.instituicao.ponto_parada
    if (!nome || !base) return
    const instituicao = novaParada.instituicao
    setNovaParada(null)
    // Nasce ao lado da parada principal; o usuário arrasta até o portão certo.
    void executarParada(
      () => servicoInstituicao.adicionarParada(instituicao.id, { nome, latitude: base[0] + 0.0006, longitude: base[1] + 0.0006 }),
      'Parada extra criada',
      `Arraste o pino "${nome}" até o portão certo. Depois, escolha esta parada no cadastro dos passageiros que descem nela.`,
    )
  }

  async function salvarParada(instituicao: Instituicao, ponto: [number, number] | null) {
    setSalvandoParada(true)
    try {
      await servicoInstituicao.ajustarParada(instituicao.id, ponto)
      await dados.recarregarInstituicoes()
      setParadaPendente(null)
      avisosParada.mostrar({
        tipo: 'sucesso',
        titulo: ponto ? 'Parada ajustada' : 'Parada voltou ao endereço',
        descricao: ponto
          ? `O trajeto de todas as rotas que vão para ${instituicao.nome} agora termina neste ponto da rua.`
          : `${instituicao.nome} volta a usar a localização do endereço como parada.`,
      })
    } catch (e) {
      setParadaPendente(null)
      setVersaoPinos((v) => v + 1) // o pino volta para onde estava
      avisosParada.erro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado.', 'Não foi possível ajustar a parada')
    } finally {
      setSalvandoParada(false)
    }
  }

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
  // Uma entrada por faculdade (a viagem pode ter a parada principal e paradas extras da mesma).
  const faculdadesDaViagem = useMemo(
    () => [...new Map((viagem?.destinos ?? []).map((d) => [d.instituicao.id, d] as const)).values()],
    [viagem],
  )
  const corDestino = (idRota: number) =>
    CORES_DESTINO[Math.max(0, viagem?.destinos.findIndex((d) => d.rota.id === idRota) ?? 0) % CORES_DESTINO.length]
  const rotasDoTurno = motorista && turno ? rotas.filter((r) => r.fk_motorista === motorista.id && r.turno === turno) : []

  // Casa/garagem do motorista: a ida sai dela e a volta termina nela.
  const enderecoCasa = motoristas.find((m) => m.id === motorista?.id)?.endereco
  const casa: Coordenada | null =
    enderecoCasa?.latitude != null && enderecoCasa?.longitude != null ? [enderecoCasa.latitude, enderecoCasa.longitude] : null

  // Pontos da IDA: casa do motorista, embarques na ordem (1 → N) e depois as faculdades.
  const paradasNoMapa = viagem?.paradas.filter((p) => p.ponto) ?? []
  const destinosNoMapa = viagem?.destinos.filter((d) => d.ponto) ?? []
  const pontosIda: Coordenada[] = [
    ...(casa ? [casa] : []),
    ...paradasNoMapa.map((p) => p.ponto!),
    ...destinosNoMapa.map((d) => d.ponto!),
  ]

  // Pontos da VOLTA: faculdades (ordem inversa) e depois desembarque nas casas (N → 1).
  const destinosVolta = useMemo(() => [...(viagem?.destinos ?? [])].reverse(), [viagem])
  const paradasVolta = useMemo(() => [...(viagem?.paradas ?? [])].reverse(), [viagem])
  const destinosVoltaNoMapa = destinosVolta.filter((d) => d.ponto)
  const paradasVoltaNoMapa = paradasVolta.filter((p) => p.ponto)
  const pontosVolta: Coordenada[] = [
    ...destinosVoltaNoMapa.map((d) => d.ponto!),
    ...paradasVoltaNoMapa.map((p) => p.ponto!),
    ...(casa ? [casa] : []),
  ]

  const mostrarIda = sentido === 'ida' || sentido === 'ambas'
  const mostrarVolta = sentido === 'volta' || sentido === 'ambas'

  const { trajeto: trajetoIda, carregando: tracandoIda } = useTrajeto(mostrarIda ? pontosIda : [])
  const { trajeto: trajetoVolta, carregando: tracandoVolta } = useTrajeto(mostrarVolta ? pontosVolta : [])

  const tracando = (mostrarIda && tracandoIda) || (mostrarVolta && tracandoVolta)

  // Horários estimados da IDA: da saída de casa (horário de ida da rota) ou, sem casa, do 1º embarque.
  const saidaDasRotas = (motorista && turno ? rotas.filter((r) => r.status === 'ativo' && r.fk_motorista === motorista.id && r.turno === turno) : [])
    .map((r) => r.horario_ida?.slice(0, 5))
    .filter((h): h is string => Boolean(h))
    .sort()[0]
  const desvioCasa = casa ? 1 : 0
  const inicioIda = casa ? saidaDasRotas ?? null : paradasNoMapa[0]?.estudante.horario_embarque?.slice(0, 5) ?? null
  const chegadaNaIda = (indiceSemCasa: number) => {
    const indice = indiceSemCasa + desvioCasa
    return trajetoIda && inicioIda
      ? somarMinutos(inicioIda, trajetoIda.trechosMin.slice(0, indice).reduce((s, t) => s + t, 0) + indiceSemCasa * MINUTOS_POR_PARADA)
      : null
  }

  // Horários estimados da VOLTA (parte do horário de volta da 1ª faculdade).
  const inicioVolta = destinosVoltaNoMapa[0]?.rota.horario_volta?.slice(0, 5) ?? null
  const chegadaNaVolta = (indice: number) =>
    trajetoVolta && inicioVolta
      ? somarMinutos(inicioVolta, trajetoVolta.trechosMin.slice(0, indice).reduce((s, t) => s + t, 0) + indice * MINUTOS_POR_PARADA)
      : null

  const cor = corDoMotorista(motorista?.id)
  const bairrosDoMotorista = motorista ? ativas.filter((a) => a.fk_motorista === motorista.id) : []
  // Ajustando paradas: enquadra as faculdades, para os pinos ficarem à vista e perto o bastante para arrastar.
  const pontosFaculdades = (viagem?.destinos ?? []).map((d) => d.instituicao.ponto_parada).filter((p): p is Coordenada => Boolean(p))
  const pontoEmFoco = viagem?.destinos.find((d) => d.instituicao.id === focoParada)?.instituicao.ponto_parada ?? null
  const pontosEnquadrar: Coordenada[] = ajustandoParadas && pontoEmFoco
    ? [pontoEmFoco as Coordenada]
    : ajustandoParadas && pontosFaculdades.length
    ? pontosFaculdades
    : motorista
    ? trajetoInteiro || sentido === 'volta' || sentido === 'ambas'
      ? [
          ...pontosIda,
          ...(mostrarIda && trajetoIda ? trajetoIda.linha : []),
          ...(mostrarVolta && trajetoVolta ? trajetoVolta.linha : []),
        ]
      : [...bairrosDoMotorista.flatMap((a) => a.poligono), ...paradasNoMapa.map((p) => p.ponto!)]
    : ativas.flatMap((a) => a.poligono)

  async function salvarCasa() {
    if (!motorista || !casaPendente) return
    const atual = enderecoCasa ? (({ id: _id, ...resto }) => resto)(enderecoCasa) : null
    // Rua do ponto (se achou); senão mantém o endereço escrito e só move o pino.
    const endereco = casaPendente.endereco ?? (atual ? { ...atual, latitude: casaPendente.ponto[0], longitude: casaPendente.ponto[1] } : null)
    if (!endereco) return
    setSalvandoCasa(true)
    try {
      await servicoMotorista.atualizar(motorista.id, { endereco: { ...endereco, latitude: casaPendente.ponto[0], longitude: casaPendente.ponto[1] } })
      await dados.recarregarMotoristas()
      setCasaPendente(null)
      avisosParada.mostrar({
        tipo: 'sucesso',
        titulo: 'Casa do motorista salva',
        descricao: `A ida de ${motorista.nome} passa a sair deste ponto e a volta termina nele. Use "Melhor ordem das paradas" para recalcular.`,
      })
    } catch (e) {
      cancelarCasa()
      avisosParada.erro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado.', 'Não foi possível salvar a casa')
    } finally {
      setSalvandoCasa(false)
    }
  }

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

            {/* Casa do motorista: ponto de partida da ida e de chegada da volta */}
            <div className={`flex items-center gap-3 rounded-2xl p-3 ring-1 ${casa ? 'bg-white ring-slate-200/70' : 'bg-sky-50 ring-sky-200'}`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500 text-white shadow-md shadow-sky-500/30">
                <Icone nome="van" className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-marinho">{casa ? 'Casa do motorista' : 'Casa do motorista não marcada'}</span>
                <span className="block truncate text-xs text-slate-500">
                  {casa && enderecoCasa
                    ? enderecoEmTexto(enderecoCasa)
                    : marcandoCasa
                      ? 'Clique no mapa onde o motorista mora.'
                      : 'É o início da ida e o fim da volta.'}
                </span>
                {casa && podeEditarCasa && <span className="block text-[11px] text-sky-600">Arraste o pino azul no mapa para mudar.</span>}
              </span>
              {!casa && podeEditarCasa && (
                <button
                  type="button"
                  onClick={() => setMarcandoCasa(!marcandoCasa)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold ${marcandoCasa ? 'bg-white text-slate-600 ring-1 ring-slate-200' : 'bg-sky-500 text-white'}`}
                >
                  {marcandoCasa ? 'Cancelar' : 'Marcar no mapa'}
                </button>
              )}
            </div>

            {viagem && viagem.destinos.length > 0 && (
              <div
                className={`rounded-2xl p-3 ring-1 transition-colors ${
                  ajustandoParadas ? 'bg-laranja/5 ring-laranja/40' : 'bg-white ring-slate-200/70'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setAjustandoParadas(!ajustandoParadas)
                    setFocoParada(null)
                  }}
                  aria-pressed={ajustandoParadas}
                  className="flex w-full items-center gap-2 text-left text-sm font-bold text-marinho"
                >
                  <Icone nome="pino" className="h-4 w-4 text-laranja" />
                  {ajustandoParadas ? 'Ajustando paradas das faculdades' : 'Ajustar paradas das faculdades'}
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${ajustandoParadas ? 'bg-laranja text-white' : 'bg-fundo text-slate-500'}`}
                  >
                    {ajustandoParadas ? 'Ligado' : 'Desligado'}
                  </span>
                </button>
                {ajustandoParadas && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-slate-600">
                      Toque numa faculdade para aproximar o mapa nela e arraste o pino até a rua, em frente ao portão
                      onde a van para. Faculdade com mais de um portão (ex.: UVV e Biopráticas)? Crie uma parada extra e
                      escolha-a no cadastro de quem desce nela.
                    </p>
                    <ul className="space-y-1">
                      {faculdadesDaViagem.map((d) => (
                        <li key={chaveDestino(d)} className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: corDestino(d.rota.id) }} />
                          <button
                            type="button"
                            onClick={() => setFocoParada(d.instituicao.id)}
                            className={`min-w-0 flex-1 truncate text-left font-semibold hover:text-laranja hover:underline ${
                              focoParada === d.instituicao.id ? 'text-laranja' : 'text-marinho'
                            }`}
                          >
                            {d.instituicao.nome}
                          </button>
                          {d.instituicao.parada_latitude !== null ? (
                            <button
                              type="button"
                              disabled={salvandoParada}
                              onClick={() => void salvarParada(d.instituicao, null)}
                              className="shrink-0 font-semibold text-slate-500 hover:text-laranja"
                            >
                              Voltar ao endereço
                            </button>
                          ) : (
                            <span className="shrink-0 text-slate-400">no endereço</span>
                          )}
                        </div>
                        {/* Paradas extras da faculdade (ex.: Biopráticas) */}
                        <div className="ml-4 space-y-1 border-l-2 border-slate-200 pl-2">
                          {d.instituicao.paradas.map((extra) => (
                            <div key={extra.id} className="flex items-center gap-2">
                              <Icone nome="pino" className="h-3 w-3 shrink-0 text-slate-400" />
                              <span className="min-w-0 flex-1 truncate font-semibold text-slate-600">{extra.nome}</span>
                              <button
                                type="button"
                                disabled={salvandoParada}
                                onClick={() => {
                                  if (!window.confirm(`Remover a parada ${extra.nome}? Quem descia nela volta para a parada principal.`)) return
                                  void executarParada(
                                    () => servicoInstituicao.removerParada(d.instituicao.id, extra.id),
                                    'Parada removida',
                                    `Quem usava ${extra.nome} volta para a parada principal de ${d.instituicao.nome}.`,
                                  )
                                }}
                                className="shrink-0 font-semibold text-red-500 hover:underline"
                              >
                                Remover
                              </button>
                            </div>
                          ))}
                          {novaParada?.instituicao.id === d.instituicao.id ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault()
                                criarParadaExtra()
                              }}
                              className="flex items-center gap-1"
                            >
                              <input
                                autoFocus
                                maxLength={60}
                                placeholder="Nome (ex.: Biopráticas)"
                                value={novaParada.nome}
                                onChange={(e) => setNovaParada({ ...novaParada, nome: e.target.value })}
                                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-laranja"
                              />
                              <button type="submit" className="rounded-lg bg-laranja px-2 py-1 font-bold text-white">
                                Criar
                              </button>
                              <button type="button" onClick={() => setNovaParada(null)} className="px-1 text-slate-400 hover:text-marinho">
                                <Icone nome="fechar" className="h-3.5 w-3.5" />
                              </button>
                            </form>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setNovaParada({ instituicao: d.instituicao, nome: '' })}
                              className="font-bold text-laranja hover:underline"
                            >
                              + Parada extra
                            </button>
                          )}
                        </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

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
                {viagem.paradas.length > 1 && (
                  <button
                    onClick={() => setOrdemAberta(true)}
                    className="group mb-4 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-marinho to-[#24506f] p-3.5 text-left text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-laranja">
                      <Icone nome="rota" className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-extrabold">Melhor ordem das paradas</span>
                      <span className="block text-xs text-white/70">
                        {casa ? 'Sai da casa do motorista e' : 'Calcula pelas ruas e'} sugere o caminho mais curto
                      </span>
                    </span>
                    <Icone nome="seta" className="h-4 w-4 text-white/60 transition-transform group-hover:translate-x-1" />
                  </button>
                )}
                {viagem.paradas.length === 0 ? (
                  <AvisoSemResultado
                    titulo="Nenhum passageiro nas rotas deste turno"
                    filtros={[`Turno: ${ROTULOS_TURNO[turno]}`]}
                    dica="Um passageiro entra na rota quando mora num bairro deste motorista, estuda na instituição da rota e tem o mesmo turno. Confira os bairros na aba Bairros ou escolha outro turno."
                  />
                ) : sentido === 'volta' ? (
                  <ol className="relative space-y-2.5 before:absolute before:top-3 before:bottom-3 before:left-[13px] before:w-0.5 before:bg-slate-200">
                    {destinosVolta.map((d) => (
                      <li
                        key={chaveDestino(d)}
                        className={`relative flex items-center gap-3 ${idDestaque !== null && d.rota.id !== idDestaque ? 'opacity-35' : ''}`}
                      >
                        <span
                          className="z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ring-4 ring-white"
                          style={{ background: corDestino(d.rota.id) }}
                        >
                          <Icone nome="escola" className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 text-sm font-bold text-marinho">
                          {nomeDoDestino(d)}
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
                    {casa && (
                      <li className="relative flex items-center gap-3">
                        <span className="z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-500 text-white ring-4 ring-white">
                          <Icone nome="van" className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 text-sm font-bold text-marinho">
                          Saída · casa do motorista
                          <span className="block truncate text-xs font-normal text-slate-500">
                            {inicioIda ? `${inicioIda} · ` : ''}
                            {enderecoCasa?.logradouro}
                            {enderecoCasa?.numero ? `, ${enderecoCasa.numero}` : ''} · {enderecoCasa?.bairro}
                          </span>
                        </span>
                      </li>
                    )}
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
                        <li key={chaveDestino(d)} className={`relative flex items-center gap-3 ${idDestaque !== null && d.rota.id !== idDestaque ? 'opacity-35' : ''}`}>
                          <span className="z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ring-4 ring-white" style={{ background: corDestino(d.rota.id) }}>
                            <Icone nome="escola" className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 text-sm font-bold text-marinho">
                            {nomeDoDestino(d)}
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
          chave={`rotas-${idMotorista}-${turno}-${sentido}-${trajetoInteiro}-${paradasNoMapa.length}-${ativas.length}-${ajustandoParadas}-${focoParada}`}
          zoomMaximo={ajustandoParadas ? 18 : 16}
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

          {(ajustandoParadas ? faculdadesDaViagem : viagem.destinos.filter((d) => !d.parada))
            .map((d) => (
              <MarcadorInstituicao
                key={`${chaveDestino(d)}-${versaoPinos}-${d.instituicao.ponto_parada?.join(',')}`}
                instituicao={d.instituicao}
                cor={corDestino(d.rota.id)}
                ajustavel={ajustandoParadas}
                aoMover={(ponto) => setParadaPendente({ instituicao: d.instituicao, ponto })}
              />
            ))}

          {/* Paradas extras: as usadas na viagem e, no ajuste, todas as das faculdades da viagem */}
          {faculdadesDaViagem.flatMap((d) =>
            d.instituicao.paradas
              .filter((extra) => ajustandoParadas || viagem.destinos.some((x) => x.parada?.id === extra.id))
              .map((extra) => (
                <Marker
                  key={`extra-${extra.id}-${versaoPinos}-${extra.latitude},${extra.longitude}`}
                  position={[extra.latitude, extra.longitude]}
                  icon={iconeInstituicao(corDestino(d.rota.id))}
                  draggable={ajustandoParadas}
                  eventHandlers={
                    ajustandoParadas
                      ? {
                          dragend: (evento) => {
                            const { lat, lng } = (evento.target as L.Marker).getLatLng()
                            void executarParada(
                              () =>
                                servicoInstituicao.alterarParada(d.instituicao.id, extra.id, {
                                  nome: extra.nome,
                                  latitude: Number(lat.toFixed(6)),
                                  longitude: Number(lng.toFixed(6)),
                                }),
                              'Parada extra movida',
                              `${extra.nome} (${d.instituicao.nome}) agora fica neste ponto.`,
                            )
                          },
                        }
                      : undefined
                  }
                >
                  <Tooltip direction="top">
                    {d.instituicao.nome} · {extra.nome}
                    {ajustandoParadas ? ' · arraste até o portão' : ''}
                  </Tooltip>
                </Marker>
              )),
          )}

          {casa && (
            <Marker
              key={`casa-${motorista.id}-${versaoPinos}-${casa.join(',')}`}
              position={casa}
              icon={ICONE_CASA}
              zIndexOffset={900}
              draggable={podeEditarCasa}
              eventHandlers={
                podeEditarCasa
                  ? {
                      dragend: (evento) => {
                        const { lat, lng } = (evento.target as L.Marker).getLatLng()
                        void proporCasa([Number(lat.toFixed(6)), Number(lng.toFixed(6))])
                      },
                    }
                  : undefined
              }
            >
              <Tooltip direction="top" permanent className="rotulo-casa">
                Casa · {motorista.nome.split(' ')[0]}
              </Tooltip>
            </Marker>
          )}
          {marcandoCasa && <CliqueNoMapa aoClicar={(ponto) => void proporCasa(ponto)} />}
          {casaPendente && !casa && <Marker position={casaPendente.ponto} icon={ICONE_CASA} />}

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
      {paradaPendente && (
        <Modal
          titulo={`Mover a parada da ${paradaPendente.instituicao.nome}?`}
          descricao="O trajeto de todas as rotas que vão para esta faculdade passa a terminar neste ponto. Confira se o pino está na rua, em frente ao portão onde a van para."
          icone="pino"
          aoFechar={() => {
            setParadaPendente(null)
            setVersaoPinos((v) => v + 1)
          }}
          acoes={
            <>
              <Botao
                variante="secundario"
                onClick={() => {
                  setParadaPendente(null)
                  setVersaoPinos((v) => v + 1)
                }}
              >
                Cancelar
              </Botao>
              <Botao disabled={salvandoParada} onClick={() => void salvarParada(paradaPendente.instituicao, paradaPendente.ponto)}>
                {salvandoParada ? 'Salvando...' : 'Salvar parada'}
              </Botao>
            </>
          }
        />
      )}
      {avisosParada.modal}
      {casaPendente && motorista && (
        <Modal
          titulo={casa ? `Mover a casa de ${motorista.nome}?` : `Marcar a casa de ${motorista.nome} aqui?`}
          descricao="A ida passa a sair deste ponto e a volta termina nele."
          icone="pino"
          tom="marinho"
          aoFechar={cancelarCasa}
          acoes={
            <>
              <Botao variante="secundario" onClick={cancelarCasa}>
                Cancelar
              </Botao>
              <Botao disabled={salvandoCasa || casaPendente.buscando || (!casaPendente.endereco && !enderecoCasa)} onClick={() => void salvarCasa()}>
                {salvandoCasa ? 'Salvando...' : 'Salvar casa'}
              </Botao>
            </>
          }
        >
          <div className="rounded-xl bg-fundo p-3 text-sm">
            {casaPendente.buscando ? (
              <span className="animate-brilho text-slate-500">Procurando o endereço deste ponto...</span>
            ) : casaPendente.endereco ? (
              <>
                <span className="block text-xs font-bold tracking-wide text-slate-400 uppercase">Endereço encontrado</span>
                <span className="font-semibold text-marinho">{enderecoEmTexto(casaPendente.endereco)}</span>
                <span className="block text-xs text-slate-500">CEP {casaPendente.endereco.cep.replace(/(\d{5})(\d{3})/, '$1-$2')} · confira o número no cadastro do motorista</span>
              </>
            ) : enderecoCasa ? (
              <span className="text-slate-600">Não achamos a rua deste ponto: o endereço escrito continua o mesmo e só o pino muda de lugar.</span>
            ) : (
              <span className="text-amber-700">
                Não achamos o endereço (com CEP) deste ponto. Cadastre o endereço em Motoristas → editar, e marque o pino por lá.
              </span>
            )}
          </div>
        </Modal>
      )}
      {ordemAberta && motorista && turno && (
        <GavetaOrdem idMotorista={motorista.id} turno={turno} aoAplicar={dados.recarregar} aoFechar={() => setOrdemAberta(false)} />
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