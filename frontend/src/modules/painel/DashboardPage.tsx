import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { ROTULOS_PERFIL } from '../../shared/auth/permissoes.ts'
import { useSessao } from '../../shared/auth/useSessao.ts'
import Alerta from '../../shared/components/Alert.tsx'
import Cartao from '../../shared/components/Card.tsx'
import Icone from '../../shared/components/Icon.tsx'
import CartaoIndicador from '../../shared/components/StatCard.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { dataIso, formatarHorario, iniciais } from '../../shared/utils/formatar.ts'
import { servicoArea } from '../area/areaService.ts'
import { servicoChamada } from '../chamada/callService.ts'
import { servicoEstudante } from '../estudante/studentService.ts'
import { CamadaAreas, Enquadrar, MapaBase, MarcadorPassageiro } from '../mapa/MapLayers.tsx'
import { coordenadaDo } from '../mapa/mapUtils.ts'
import { ROTULOS_TURNO, type Turno } from '../estudante/types.ts'
import { servicoMotorista } from '../motorista/driverService.ts'
import { diasParaVencer, situacaoCnh } from '../motorista/driverUtils.ts'
import { servicoRota } from '../rota/routeService.ts'
import type { Rota } from '../rota/types.ts'
import { servicoPainel } from './dashboardService.ts'
import CenaEstrada, { Ceu, periodoDoDia, type Periodo } from './RoadScene.tsx'
import { agruparJornadas, ORDEM_TURNOS } from '../viagem/tripGrouping.ts'
import { servicoViagem } from '../viagem/tripService.ts'
import type { StatusViagem } from '../viagem/types.ts'

function saudacao(hora = new Date().getHours()) {
  if (hora < 12) return 'Bom dia'
  if (hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** Status da jornada (linha da operação de hoje). */
const PILULA: Record<StatusViagem, { rotulo: string; classe: string }> = {
  agendada: { rotulo: 'Agendada', classe: 'bg-slate-100 text-slate-600' },
  em_andamento: { rotulo: 'Em andamento', classe: 'bg-sky-100 text-sky-700' },
  concluida: { rotulo: 'Concluída', classe: 'bg-emerald-100 text-emerald-700' },
  cancelada: { rotulo: 'Cancelada', classe: 'bg-red-50 text-red-500' },
}

const RESUMO_OPERACAO = [
  ['agendada', 'A sair', 'text-marinho'],
  ['em_andamento', 'Rodando agora', 'text-sky-600'],
  ['concluida', 'Concluídas', 'text-emerald-600'],
] as const

/**
 * Tela inicial (RF5) do administrador e do auxiliar: boas-vindas com as próximas saídas,
 * indicadores, a operação de hoje (uma linha por motorista e sentido), as chamadas do dia,
 * os pontos de atenção e o mapa dos passageiros.
 */
export default function PaginaPainel() {
  const hoje = dataIso()
  const resumo = useRequisicao(() => servicoPainel.resumo())
  const estudantes = useRequisicao(() => servicoEstudante.listar({ status: 'ativo' }))
  const areas = useRequisicao(() => servicoArea.listar({ status: 'ativo' }))
  const rotas = useRequisicao(() => servicoRota.listar({ status: 'ativo' }))
  const viagens = useRequisicao(() => servicoViagem.listar({ data: hoje }), [hoje])
  const chamadas = useRequisicao(() => servicoChamada.doDia(hoje), [hoje])
  const motoristas = useRequisicao(() => servicoMotorista.listar({ status: 'ativo' }))
  const dados = resumo.dados

  const comLocal = (estudantes.dados ?? []).filter((e) => coordenadaDo(e) !== null)
  const semLocal = (estudantes.dados?.length ?? 0) - comLocal.length
  const cnhs = (motoristas.dados ?? [])
    .map((m) => ({ motorista: m, situacao: situacaoCnh(m.cnh_validade), dias: diasParaVencer(m.cnh_validade) }))
    .filter((c) => c.situacao !== 'valida')
    .sort((a, b) => a.dias - b.dias)

  // Jornadas do dia (motorista + turno + sentido), na ordem manhã ida, manhã volta, noite...
  const jornadas = useMemo(
    () =>
      ORDEM_TURNOS.flatMap((t) => {
        const { ida, volta } = agruparJornadas(viagens.dados ?? [], t)
        return [...ida, ...volta]
      }),
    [viagens.dados],
  )
  // Na lista: rodando, depois as próximas a sair, as atrasadas e por fim as concluídas.
  const horaAgora = new Date().toTimeString().slice(0, 5)
  const atrasada = (j: (typeof jornadas)[number]) => j.status === 'agendada' && (j.horario_previsto ?? '99:99').slice(0, 5) < horaAgora
  const peso = (j: (typeof jornadas)[number]) =>
    j.status === 'em_andamento' ? 0 : j.status === 'agendada' ? (atrasada(j) ? 2 : 1) : j.status === 'concluida' ? 3 : 4
  const emDestaque = [...jornadas].sort((a, b) => peso(a) - peso(b) || (a.horario_previsto ?? '').localeCompare(b.horario_previsto ?? ''))
  const contagem = { agendada: 0, em_andamento: 0, concluida: 0, cancelada: 0 }
  for (const j of jornadas) contagem[j.status] += 1
  const ativas = jornadas.length - contagem.cancelada
  const pct = (n: number) => (ativas ? Math.round((n / ativas) * 100) : 0)
  const resumoChamadas = chamadas.dados?.resumo

  return (
    <>
      <BoasVindas rotas={rotas.dados} />

      {resumo.erro && (
        <div className="mt-6">
          <Alerta mensagem={resumo.erro} />
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoIndicador rotulo="Passageiros ativos" valor={dados?.estudantes_ativos} icone="passageiros" tom="laranja" detalhe="Ver passageiros" para="/passageiros" atraso={100} />
        <CartaoIndicador rotulo="Motoristas ativos" valor={dados?.motoristas_ativos} icone="motorista" tom="marinho" detalhe="Ver motoristas" para="/motoristas" atraso={160} />
        <CartaoIndicador rotulo="Veículos ativos" valor={dados?.veiculos_ativos} icone="van" tom="verde" detalhe="Ver a frota" para="/veiculos" atraso={220} />
        <CartaoIndicador rotulo="Rotas ativas" valor={dados?.rotas_ativas} icone="rota" tom="ambar" detalhe="Ver as rotas" para="/mapa?aba=rotas" atraso={280} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {/* Operação de hoje */}
        <Cartao
          titulo="Operação de hoje"
          className="animate-surgir [animation-delay:340ms] xl:col-span-2"
          acoes={
            <Link to={`/viagens?data=${hoje}`} className="group flex items-center gap-1 text-sm font-semibold text-laranja">
              Abrir viagens
              <Icone nome="seta" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          }
        >
          {viagens.carregando && !viagens.dados ? (
            <div className="space-y-3 py-1">
              <div className="esqueleto h-16" />
              <div className="esqueleto h-12" />
              <div className="esqueleto h-12" />
            </div>
          ) : jornadas.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-fundo text-slate-400">
                <Icone nome="mala" className="h-6 w-6" />
              </span>
              <p className="text-sm text-slate-500">Nenhuma viagem gerada para hoje.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                {RESUMO_OPERACAO.map(([chave, rotulo, cor]) => (
                  <div key={chave} className="rounded-xl bg-fundo/70 p-3">
                    <p className="text-xs font-semibold text-slate-500">{rotulo}</p>
                    <p className={`mt-1 flex items-baseline gap-1.5 text-2xl font-extrabold tabular-nums ${cor}`}>
                      {contagem[chave]}
                      <span className="text-xs font-semibold text-slate-400">{pct(contagem[chave])}%</span>
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-fundo">
                <div className="bg-emerald-500 transition-all duration-700" style={{ width: `${pct(contagem.concluida)}%` }} />
                <div className="bg-sky-500 transition-all duration-700" style={{ width: `${pct(contagem.em_andamento)}%` }} />
              </div>

              <ul className="mt-4 divide-y divide-slate-100">
                {emDestaque.slice(0, 6).map((j) => {
                  const fila = j.passageiros.total - j.passageiros.nao_vai
                  const feitos = j.passageiros.presente + j.passageiros.ausente
                  return (
                    <li key={`${j.chave.turno}-${j.chave.sentido}-${j.motorista.id}`}>
                      <Link
                        to={`/viagens?data=${hoje}&turno=${j.chave.turno}`}
                        className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-fundo/70"
                      >
                        <span className="w-12 shrink-0 text-sm font-extrabold text-marinho tabular-nums">{formatarHorario(j.horario_previsto)}</span>
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-marinho text-xs font-bold text-white">
                          {iniciais(j.motorista.nome)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-marinho">{j.motorista.nome}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {ROTULOS_TURNO[j.chave.turno]} · {j.chave.sentido === 'ida' ? 'Ida' : 'Volta'} · {j.viagens.length} destino(s)
                          </span>
                        </span>
                        <span className="hidden text-xs font-semibold text-slate-500 tabular-nums sm:block">
                          {j.status === 'agendada' ? `${fila} a buscar` : `${feitos}/${fila}`}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${atrasada(j) ? 'bg-amber-100 text-amber-700' : PILULA[j.status].classe}`}
                        >
                          {j.status === 'em_andamento' && (
                            <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500 align-middle" />
                          )}
                          {atrasada(j) ? 'Atrasada' : PILULA[j.status].rotulo}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
              {jornadas.length > 6 && (
                <p className="mt-2 text-center text-xs text-slate-500">e mais {jornadas.length - 6} na tela de viagens</p>
              )}
            </>
          )}
        </Cartao>

        <div className="space-y-6">
          {/* Chamadas do dia */}
          <Cartao
            titulo="Chamadas de hoje"
            className="animate-surgir [animation-delay:400ms]"
            acoes={
              <Link to="/chamadas" className="text-sm font-semibold text-laranja hover:underline">
                Abrir
              </Link>
            }
          >
            {!resumoChamadas ? (
              <div className="esqueleto h-20" />
            ) : resumoChamadas.passageiros === 0 ? (
              <p className="py-3 text-sm text-slate-500">Sem passageiros nas viagens de hoje.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-xs font-semibold text-emerald-700">Confirmados</p>
                  <p className="mt-1 text-2xl font-extrabold text-emerald-700 tabular-nums">{resumoChamadas.confirmados}</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-700">Não vão</p>
                  <p className="mt-1 text-2xl font-extrabold text-amber-700 tabular-nums">{resumoChamadas.avisaram}</p>
                </div>
                <p className="col-span-2 text-xs text-slate-500">
                  {resumoChamadas.passageiros} passageiro(s) nas viagens
                  {resumoChamadas.tardios > 0 && ` · ${resumoChamadas.tardios} avisaram em cima da hora`}
                </p>
              </div>
            )}
          </Cartao>

          {/* Pontos de atenção */}
          <Cartao titulo="Pontos de atenção" className="animate-surgir [animation-delay:460ms]">
            <ul className="space-y-2 text-sm">
              {!dados ? (
                <li className="esqueleto h-14" />
              ) : (
                <>
                  {dados.estudantes_sem_area > 0 && (
                    <li>
                      <Link to="/passageiros" className="flex gap-3 rounded-xl bg-amber-50 p-3 text-amber-800 transition-colors hover:bg-amber-100">
                        <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          <strong>{dados.estudantes_sem_area}</strong> passageiro(s) fora de qualquer área de motorista.
                        </span>
                      </Link>
                    </li>
                  )}
                  {semLocal > 0 && (
                    <li className="flex gap-3 rounded-xl bg-amber-50 p-3 text-amber-800">
                      <Icone nome="pino" className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        <strong>{semLocal}</strong> passageiro(s) sem localização no mapa.
                      </span>
                    </li>
                  )}
                  {cnhs.slice(0, 3).map(({ motorista, situacao, dias }) => (
                    <li key={motorista.id}>
                      <Link
                        to="/motoristas"
                        className={`flex gap-3 rounded-xl p-3 transition-colors ${
                          situacao === 'vencida' ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                        }`}
                      >
                        <Icone nome="cnh" className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          CNH de <strong>{motorista.nome}</strong>{' '}
                          {situacao === 'vencida' ? `vencida há ${-dias} dia(s)` : `vence em ${dias} dia(s)`}.
                        </span>
                      </Link>
                    </li>
                  ))}
                  {dados.estudantes_sem_area === 0 && semLocal === 0 && cnhs.length === 0 && (
                    <li className="flex gap-3 rounded-xl bg-emerald-50 p-3 text-emerald-800">
                      <Icone nome="ok" className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Tudo em dia: passageiros com área e localização e CNHs válidas.</span>
                    </li>
                  )}
                </>
              )}
            </ul>
          </Cartao>
        </div>
      </div>

      <Cartao
        titulo="Mapa dos passageiros"
        className="mt-6 animate-surgir [animation-delay:520ms]"
        acoes={
          <Link to="/mapa" className="group flex items-center gap-1 text-sm font-semibold text-laranja">
            Abrir mapa completo
            <Icone nome="seta" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        }
      >
        <div className="overflow-hidden rounded-xl ring-1 ring-slate-200/70">
          <MapaBase className="h-80" rolagem={false}>
            <Enquadrar
              pontos={[...(areas.dados ?? []).flatMap((a) => a.poligono), ...comLocal.map((e) => coordenadaDo(e)!)]}
              chave={`${areas.dados?.length ?? 0}-${comLocal.length}`}
            />
            <CamadaAreas areas={areas.dados ?? []} mostrarNomes={false} />
            {comLocal.map((estudante) => (
              <MarcadorPassageiro
                key={estudante.id}
                estudante={estudante}
                posicao={coordenadaDo(estudante)!}
                variante={estudante.fk_area === null ? 'sem-area' : 'normal'}
              />
            ))}
          </MapaBase>
        </div>
      </Cartao>
    </>
  )
}

/** Rotas de hoje agrupadas por motorista e turno: uma saída da van. */
interface Saida {
  idMotorista: number
  motorista: string
  turno: Turno
  horario: string
  passageiros: number
  faculdades: number
}

function saidasDeHoje(rotas: Rota[], hoje = new Date()): Saida[] {
  const diaIso = ((hoje.getDay() + 6) % 7) + 1 // 1 = segunda ... 7 = domingo
  const grupos = new Map<string, Saida>()
  for (const r of rotas) {
    if (r.status !== 'ativo' || !r.dias.includes(diaIso) || r.total_passageiros === 0) continue
    const chave = `${r.fk_motorista}-${r.turno}`
    const horario = r.horario_ida?.slice(0, 5) ?? '--:--'
    const atual = grupos.get(chave)
    grupos.set(chave, {
      idMotorista: r.fk_motorista,
      motorista: r.motorista.nome,
      turno: r.turno,
      horario: atual && atual.horario < horario ? atual.horario : horario,
      passageiros: (atual?.passageiros ?? 0) + r.total_passageiros,
      faculdades: (atual?.faculdades ?? 0) + 1,
    })
  }
  return [...grupos.values()].sort((a, b) => a.horario.localeCompare(b.horario))
}

const FUNDOS: Record<Periodo, string> = {
  manha: 'bg-[linear-gradient(135deg,#1B3C59_0%,#245a83_55%,#3f86b0_100%)]',
  tarde: 'bg-[linear-gradient(135deg,#1B3C59_0%,#3a4f78_55%,#b8613a_100%)]',
  noite: 'bg-[linear-gradient(135deg,#0b2233_0%,#102D40_55%,#1B3C59_100%)]',
}

/** Faixa de boas-vindas: resumo do dia, próximas saídas e a van na estrada. */
function BoasVindas({ rotas }: { rotas: Rota[] | null }) {
  const { usuario } = useSessao()
  const primeiroNome = usuario?.nome.split(' ')[0] ?? ''
  const agora = new Date()
  const periodo = periodoDoDia(agora.getHours())
  const horaAgora = agora.toTimeString().slice(0, 5)
  const saidas = rotas ? saidasDeHoje(rotas, agora) : []
  const restantesHoje = saidas.filter((s) => s.horario >= horaAgora)
  // Acabaram as saídas de hoje: mostra as primeiras de amanhã.
  const amanha = new Date(agora.getTime() + 24 * 60 * 60 * 1000)
  const deAmanha = rotas && restantesHoje.length === 0 ? saidasDeHoje(rotas, amanha) : []
  const proximas = (restantesHoje.length ? restantesHoje : deAmanha).slice(0, 3)
  const tituloSaidas = restantesHoje.length || !deAmanha.length ? 'Próximas saídas de hoje' : 'Próximas saídas · amanhã'
  const passageirosHoje = saidas.reduce((soma, s) => soma + s.passageiros, 0)
  const motoristasHoje = new Set(saidas.map((s) => s.idMotorista)).size
  const dataExtenso = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(agora)

  return (
    <section className={`relative animate-surgir overflow-hidden rounded-3xl ${FUNDOS[periodo]} text-white shadow-lg shadow-marinho/20`}>
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:18px_18px]" />
      <Ceu periodo={periodo} />
      <div className="absolute -top-24 -left-10 h-72 w-72 animate-flutuar rounded-full bg-laranja/25 blur-3xl" />

      <div className="relative grid grid-cols-1 gap-6 px-6 pt-6 pb-36 sm:px-8 lg:grid-cols-[1fr_360px] lg:pb-28">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-xs font-bold tracking-widest text-white/60 uppercase">
            {dataExtenso}
            {usuario && <span className="rounded-full bg-white/10 px-2 py-0.5 tracking-normal normal-case">{ROTULOS_PERFIL[usuario.perfil]}</span>}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{saudacao()}, {primeiroNome}</h1>
          <p className="mt-2 max-w-xl text-sm text-white/75">
            {rotas === null
              ? 'Carregando o resumo de hoje...'
              : saidas.length
                ? `Hoje saem ${saidas.length} viagens com ${motoristasHoje} motorista(s), levando ${passageirosHoje} passageiro(s) até as faculdades.`
                : 'Nenhuma viagem programada para hoje.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/passageiros?novo=1"
              className="inline-flex items-center gap-2 rounded-xl bg-laranja px-4 py-2.5 text-sm font-bold shadow-lg shadow-laranja/30 transition-all hover:-translate-y-0.5 hover:bg-laranja-claro"
            >
              <Icone nome="mais" className="h-4 w-4" />
              Novo passageiro
            </Link>
            <Link
              to="/viagens"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold ring-1 ring-white/20 backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/20"
            >
              <Icone nome="mala" className="h-4 w-4" />
              Viagens de hoje
            </Link>
          </div>
        </div>

        <div className="self-start rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-md">
          <p className="flex items-center gap-2 text-xs font-bold tracking-widest text-white/70 uppercase">
            <span className="h-2 w-2 animate-brilho rounded-full bg-emerald-400" />
            {tituloSaidas}
          </p>
          <ul className="mt-3 space-y-2">
            {rotas === null && [1, 2].map((n) => <li key={n} className="h-12 animate-brilho rounded-xl bg-white/10" />)}
            {rotas !== null && proximas.length === 0 && (
              <li className="rounded-xl bg-white/5 p-3 text-sm text-white/70">
                Sem saídas programadas hoje nem amanhã.
              </li>
            )}
            {proximas.map((s) => (
              <li key={`${s.idMotorista}-${s.turno}`}>
                <Link
                  to={`/mapa?aba=rotas&motorista=${s.idMotorista}&turno=${s.turno}`}
                  className="group flex items-center gap-3 rounded-xl bg-white/5 p-2.5 transition-colors hover:bg-white/15"
                >
                  <span className="rounded-lg bg-white px-2 py-1 text-sm font-extrabold text-marinho tabular-nums">{s.horario}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{s.motorista}</span>
                    <span className="block truncate text-xs text-white/65">
                      {ROTULOS_TURNO[s.turno]} · {s.passageiros} passageiro(s) · {s.faculdades} faculdade(s)
                    </span>
                  </span>
                  <Icone nome="seta" className="h-4 w-4 text-white/50 transition-transform group-hover:translate-x-1 group-hover:text-white" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <CenaEstrada periodo={periodo} />
    </section>
  )
}
