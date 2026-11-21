import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import Alerta from '../../shared/components/Alert.tsx'
import Cartao from '../../shared/components/Card.tsx'
import Icone from '../../shared/components/Icon.tsx'
import CartaoIndicador from '../../shared/components/StatCard.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { servicoArea } from '../area/areaService.ts'
import { servicoEstudante } from '../estudante/studentService.ts'
import { CamadaAreas, Enquadrar, MapaBase, MarcadorPassageiro } from '../mapa/MapLayers.tsx'
import { coordenadaDo } from '../mapa/mapUtils.ts'
import { ROTULOS_TURNO, type Turno } from '../estudante/types.ts'
import { servicoRota } from '../rota/routeService.ts'
import type { Rota } from '../rota/types.ts'
import { servicoPainel } from './dashboardService.ts'
import CenaEstrada, { Ceu, periodoDoDia, type Periodo } from './RoadScene.tsx'
import type { ViagensDoDia } from './types.ts'

const SITUACOES_VIAGEM: { chave: keyof ViagensDoDia; rotulo: string; cor: string }[] = [
  { chave: 'agendada', rotulo: 'Agendadas', cor: 'bg-marinho' },
  { chave: 'em_andamento', rotulo: 'Em andamento', cor: 'bg-laranja' },
  { chave: 'concluida', rotulo: 'Concluídas', cor: 'bg-emerald-500' },
  { chave: 'cancelada', rotulo: 'Canceladas', cor: 'bg-slate-300' },
]

function saudacao(hora = new Date().getHours()) {
  if (hora < 12) return 'Bom dia'
  if (hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** Tela inicial (RF5): boas-vindas, indicadores da operação, viagens do dia e mapa dos passageiros. */
export default function PaginaPainel() {
  const resumo = useRequisicao(() => servicoPainel.resumo())
  const estudantes = useRequisicao(() => servicoEstudante.listar({ status: 'ativo' }))
  const areas = useRequisicao(() => servicoArea.listar({ status: 'ativo' }))
  const rotas = useRequisicao(() => servicoRota.listar({ status: 'ativo' }))
  const dados = resumo.dados

  const viagens = dados?.viagens_hoje
  const totalViagens = viagens ? Object.values(viagens).reduce((soma, n) => soma + n, 0) : 0
  const comLocal = (estudantes.dados ?? []).filter((e) => coordenadaDo(e) !== null)
  const semLocal = (estudantes.dados?.length ?? 0) - comLocal.length

  // A barra das viagens nasce vazia e cresce até o tamanho real (transição de largura).
  const [barraCheia, setBarraCheia] = useState(false)
  useEffect(() => {
    if (totalViagens === 0) return
    const temporizador = window.setTimeout(() => setBarraCheia(true), 120)
    return () => window.clearTimeout(temporizador)
  }, [totalViagens])

  return (
    <>
      <BoasVindas rotas={rotas.dados} />

      {resumo.erro && (
        <div className="mt-6">
          <Alerta mensagem={resumo.erro} />
        </div>
      )}

      <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoIndicador
          rotulo="Passageiros ativos"
          valor={dados?.estudantes_ativos}
          icone="passageiros"
          tom="laranja"
          detalhe="Ver passageiros"
          para="/passageiros"
          atraso={100}
        />
        <CartaoIndicador
          rotulo="Motoristas ativos"
          valor={dados?.motoristas_ativos}
          icone="motorista"
          tom="marinho"
          detalhe="Ver motoristas"
          para="/motoristas"
          atraso={160}
        />
        <CartaoIndicador
          rotulo="Veículos ativos"
          valor={dados?.veiculos_ativos}
          icone="van"
          tom="verde"
          detalhe="Ver a frota"
          para="/veiculos"
          atraso={220}
        />
        <CartaoIndicador
          rotulo="Rotas ativas"
          valor={dados?.rotas_ativas}
          icone="rota"
          tom="ambar"
          detalhe="Ver as rotas"
          para="/mapa?aba=rotas"
          atraso={280}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Cartao titulo="Viagens de hoje" className="animate-surgir [animation-delay:340ms] lg:col-span-2">
          {resumo.carregando ? (
            <div className="space-y-4 py-2">
              <div className="esqueleto h-3" />
              <div className="grid grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="esqueleto h-12" />
                ))}
              </div>
            </div>
          ) : totalViagens === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-fundo text-slate-400">
                <Icone nome="viagem" className="h-6 w-6" />
              </span>
              <p className="text-sm text-slate-500">Nenhuma viagem gerada para hoje.</p>
            </div>
          ) : (
            <>
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-fundo">
                {SITUACOES_VIAGEM.map(({ chave, cor }) => (
                  <div
                    key={chave}
                    className={`${cor} transition-[width] duration-1000 ease-out`}
                    style={{ width: barraCheia ? `${((viagens?.[chave] ?? 0) / totalViagens) * 100}%` : '0%' }}
                  />
                ))}
              </div>
              <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {SITUACOES_VIAGEM.map(({ chave, rotulo, cor }) => (
                  <li key={chave}>
                    <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <span className={`h-2.5 w-2.5 rounded-full ${cor}`} />
                      {rotulo}
                    </p>
                    <p className="mt-1 text-2xl font-extrabold text-marinho tabular-nums">{viagens?.[chave] ?? 0}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Cartao>

        <Cartao titulo="Pontos de atenção" className="animate-surgir [animation-delay:400ms]">
          <ul className="space-y-3 text-sm">
            {!dados ? (
              <li className="esqueleto h-14" />
            ) : dados.estudantes_sem_area > 0 ? (
              <li>
                <Link
                  to="/passageiros"
                  className="flex gap-3 rounded-xl bg-amber-50 p-3 text-amber-800 transition-colors hover:bg-amber-100"
                >
                  <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <strong>{dados.estudantes_sem_area}</strong> passageiro(s) sem área. O endereço não caiu em
                    nenhuma área de motorista.
                  </span>
                </Link>
              </li>
            ) : (
              <li className="flex gap-3 rounded-xl bg-emerald-50 p-3 text-emerald-800">
                <Icone nome="ok" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Todos os passageiros têm área definida.</span>
              </li>
            )}
            {semLocal > 0 && (
              <li className="flex gap-3 rounded-xl bg-amber-50 p-3 text-amber-800">
                <Icone nome="pino" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>{semLocal}</strong> passageiro(s) sem localização no mapa. Edite o endereço e marque a casa.
                </span>
              </li>
            )}
          </ul>
        </Cartao>
      </div>

      <Cartao
        titulo="Mapa dos passageiros"
        className="mt-6 animate-surgir [animation-delay:460ms]"
        acoes={
          <Link to="/mapa" className="group flex items-center gap-1 text-sm font-semibold text-laranja">
            Abrir mapa completo
            <Icone nome="seta" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        }
      >
        <div className="overflow-hidden rounded-xl ring-1 ring-slate-200/70">
          <MapaBase className="h-96" rolagem={false}>
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
          <p className="text-xs font-bold tracking-widest text-white/60 uppercase">{dataExtenso}</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{saudacao()}, Administrador</h1>
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
              to="/mapa?aba=rotas"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold ring-1 ring-white/20 backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/20"
            >
              <Icone nome="rota" className="h-4 w-4" />
              Ver as rotas
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
