import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import Cartao from '../../shared/components/Card.tsx'
import EstadoVazio from '../../shared/components/EmptyState.tsx'
import Icone from '../../shared/components/Icon.tsx'
import AvisoSemResultado from '../../shared/components/NoResults.tsx'
import { useAviso } from '../../shared/components/NoticeModal.tsx'
import CabecalhoPagina from '../../shared/components/PageHeader.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { ErroApi } from '../../shared/services/api.ts'
import { dataIso, diaDaSemana, formatarCelular, formatarData, formatarHoraDe, iniciais } from '../../shared/utils/formatar.ts'
import { ROTULOS_TURNO, type Turno } from '../estudante/types.ts'
import { ORDEM_TURNOS, turnoDaHora } from '../viagem/tripGrouping.ts'
import type { Sentido } from '../viagem/types.ts'
import FaixaSemana from '../viagem/WeekStrip.tsx'
import { servicoChamada } from './callService.ts'
import { podeAvisar, podeDesfazer, situacaoParaTela, type TomSituacao } from './callRules.ts'
import ModalAvisoNaoVou from './NoticeForm.tsx'
import type { PassageiroDoDia, SituacaoNoSentido } from './types.ts'

type Filtro = 'todos' | 'confirmados' | 'avisaram'

const CORES: Record<TomSituacao, string> = {
  vai: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  nao_vai: 'bg-amber-50 text-amber-700 ring-amber-200',
  tardio: 'bg-red-50 text-red-700 ring-red-200',
  embarcou: 'bg-emerald-500 text-white ring-emerald-500',
  faltou: 'bg-slate-200 text-slate-600 ring-slate-200',
  sem_viagem: 'bg-white text-slate-400 ring-slate-200',
}

function Etiqueta({ rotulo, situacao }: { rotulo: string; situacao: SituacaoNoSentido | null }) {
  const { texto, tom } = situacaoParaTela(situacao)
  return (
    <span
      title={situacao?.horario_aviso ? `Avisou às ${formatarHoraDe(situacao.horario_aviso)}` : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 whitespace-nowrap ${CORES[tom]}`}
    >
      <span className="font-semibold opacity-70">{rotulo}</span>
      {texto}
    </span>
  )
}

const avisou = (p: PassageiroDoDia) => [p.ida, p.volta].some((s) => s?.status === 'nao_vai')

/**
 * Chamadas (aviso prévio): quem vai e quem avisou que não vai em cada sentido do dia. O
 * administrador registra o aviso que o passageiro mandou; quem avisa sai da fila do motorista.
 */
export default function PaginaChamadas() {
  const [parametros] = useSearchParams()
  const [data, setData] = useState(() => (/^\d{4}-\d{2}-\d{2}$/.test(parametros.get('data') ?? '') ? parametros.get('data')! : dataIso()))
  const [turnoEscolhido, setTurnoEscolhido] = useState<Turno | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const [avisando, setAvisando] = useState<PassageiroDoDia | null>(null)
  const avisos = useAviso()
  const passou = data < dataIso()

  const chamadas = useRequisicao(() => servicoChamada.doDia(data), [data])
  const todos = useMemo(() => chamadas.dados?.passageiros ?? [], [chamadas.dados])

  const porTurno = useMemo(() => {
    const contagem: Record<Turno, number> = { manha: 0, tarde: 0, noite: 0 }
    for (const p of todos) contagem[p.turno] += 1
    return contagem
  }, [todos])
  const turnosVisiveis = ORDEM_TURNOS.filter((t) => t !== 'tarde' || porTurno.tarde > 0)
  const turnoDaHoraAtual = turnoDaHora(new Date().getHours())
  const turno =
    turnoEscolhido ??
    (porTurno[turnoDaHoraAtual] > 0 ? turnoDaHoraAtual : (ORDEM_TURNOS.find((t) => porTurno[t] > 0) ?? 'noite'))

  const doTurno = todos.filter((p) => p.turno === turno)
  const resumo = {
    passageiros: doTurno.length,
    confirmados: doTurno.filter((p) => !avisou(p)).length,
    avisaram: doTurno.filter(avisou).length,
    tardios: doTurno.filter((p) => [p.ida, p.volta].some((s) => s?.tardio)).length,
  }

  const termo = busca.trim().toLowerCase()
  const visiveis = doTurno.filter(
    (p) =>
      (filtro === 'todos' || (filtro === 'avisaram' ? avisou(p) : !avisou(p))) &&
      (!termo ||
        `${p.estudante.nome} ${p.estudante.apelido ?? ''} ${p.estudante.bairro} ${p.instituicao.nome}`.toLowerCase().includes(termo)),
  )
  const porMotorista = useMemo(() => {
    const grupos = new Map<number, { motorista: PassageiroDoDia['motorista']; passageiros: PassageiroDoDia[] }>()
    for (const p of visiveis) {
      const grupo = grupos.get(p.motorista.id) ?? { motorista: p.motorista, passageiros: [] }
      grupo.passageiros.push(p)
      grupos.set(p.motorista.id, grupo)
    }
    return [...grupos.values()]
  }, [visiveis])

  async function registrar(passageiro: PassageiroDoDia, sentidos: Sentido[]) {
    try {
      const atualizado = await servicoChamada.avisar({ data, fk_estudante: passageiro.estudante.id, sentidos })
      setAvisando(null)
      await chamadas.recarregar()
      const tardio = [atualizado.ida, atualizado.volta].some((s) => s?.tardio)
      avisos.mostrar({
        tipo: tardio ? 'aviso' : 'sucesso',
        titulo: tardio ? 'Aviso de última hora registrado' : 'Aviso registrado',
        descricao: `${passageiro.estudante.nome} não vai na ${sentidos.length === 2 ? 'ida nem na volta' : sentidos[0]}. Saiu da fila de ${passageiro.motorista.nome}.`,
        itens: tardio ? ['Falta menos de 1 hora para a saída: avise o motorista se ele já estiver a caminho.'] : [],
      })
    } catch (e) {
      setAvisando(null)
      avisos.erro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado.', 'Não foi possível registrar o aviso')
    }
  }

  async function desfazer(passageiro: PassageiroDoDia) {
    const sentidos = (['ida', 'volta'] as Sentido[]).filter((s) => podeDesfazer(passageiro[s]))
    try {
      await servicoChamada.desfazer({ data, fk_estudante: passageiro.estudante.id, sentidos })
      await chamadas.recarregar()
      avisos.mostrar({
        tipo: 'sucesso',
        titulo: 'Passageiro de volta na fila',
        descricao: `${passageiro.estudante.nome} vai sim e voltou para a fila de ${passageiro.motorista.nome}.`,
      })
    } catch (e) {
      avisos.erro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado.', 'Não foi possível desfazer o aviso')
    }
  }

  const dataPorExtenso = `${diaDaSemana(data).replace(/^./, (c) => c.toUpperCase())}, ${formatarData(data)}`

  return (
    <>
      <CabecalhoPagina
        titulo="Chamadas"
        descricao="Aviso prévio: registre quem não vai. O passageiro sai da fila do motorista na ida, na volta ou nas duas."
      />

      <section className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-5">
        <FaixaSemana data={data} aoEscolher={setData} versao={0} />
      </section>

      {chamadas.erro && (
        <Cartao>
          <AvisoSemResultado titulo="Não foi possível carregar as chamadas" filtros={[]} dica={chamadas.erro} />
        </Cartao>
      )}

      {!chamadas.carregando && !chamadas.erro && todos.length === 0 && (
        <Cartao>
          <EstadoVazio
            icone="megafone"
            titulo={`Sem chamada em ${dataPorExtenso.toLowerCase()}`}
            descricao="A chamada nasce junto com as viagens do dia. Gere as viagens deste dia para registrar os avisos."
          >
            <Link to={`/viagens?data=${data}`} className="mt-4 rounded-lg bg-laranja px-4 py-2 text-sm font-semibold text-white hover:bg-laranja-claro">
              Ir para Viagens
            </Link>
          </EstadoVazio>
        </Cartao>
      )}

      {todos.length > 0 && (
        <>
          {/* Turno e números do turno */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div role="tablist" aria-label="Turno" className="flex w-full rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200/70 sm:w-auto">
              {turnosVisiveis.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={turno === t}
                  onClick={() => setTurnoEscolhido(t)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-colors sm:flex-none ${
                    turno === t ? 'bg-marinho text-white shadow-sm' : 'text-slate-500 hover:bg-fundo hover:text-marinho'
                  }`}
                >
                  {ROTULOS_TURNO[t]}
                  <span className={`rounded-full px-2 text-xs tabular-nums ${turno === t ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {porTurno[t]}
                  </span>
                </button>
              ))}
            </div>
            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { rotulo: 'Passageiros', valor: resumo.passageiros, cor: 'text-marinho' },
                { rotulo: 'Vão', valor: resumo.confirmados, cor: 'text-emerald-600' },
                { rotulo: 'Avisaram que não vão', valor: resumo.avisaram, cor: 'text-amber-600' },
                { rotulo: 'Avisos de última hora', valor: resumo.tardios, cor: 'text-red-600' },
              ].map((n) => (
                <div key={n.rotulo} className="rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/70">
                  <p className="truncate text-[11px] font-semibold text-slate-500">{n.rotulo}</p>
                  <p className={`text-xl font-extrabold tabular-nums ${n.cor}`}>{n.valor}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Busca e filtro */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="relative min-w-56 flex-1">
              <span className="sr-only">Buscar passageiro</span>
              <Icone nome="busca" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar passageiro, bairro ou faculdade"
                className="campo mt-0 rounded-full bg-white pl-9"
              />
            </label>
            <div className="flex rounded-full bg-white p-1 text-sm font-semibold shadow-sm ring-1 ring-slate-200/70">
              {(
                [
                  ['todos', 'Todos'],
                  ['confirmados', 'Vão'],
                  ['avisaram', 'Avisaram'],
                ] as [Filtro, string][]
              ).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setFiltro(valor)}
                  aria-pressed={filtro === valor}
                  className={`rounded-full px-4 py-1.5 transition-colors ${filtro === valor ? 'bg-marinho text-white' : 'text-slate-500 hover:text-marinho'}`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>

          {porMotorista.length === 0 && (
            <Cartao>
              <AvisoSemResultado
                titulo="Nenhum passageiro encontrado"
                filtros={[busca.trim() && `Busca: "${busca.trim()}"`, filtro !== 'todos' && (filtro === 'avisaram' ? 'Avisaram' : 'Vão')].filter(
                  (f): f is string => Boolean(f),
                )}
                aoLimpar={() => {
                  setBusca('')
                  setFiltro('todos')
                }}
              />
            </Cartao>
          )}

          {/* Por motorista */}
          <div className="space-y-4">
            {porMotorista.map((grupo, i) => (
              <article
                key={grupo.motorista.id}
                className="animate-surgir overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70"
                style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }}
              >
                <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-marinho text-xs font-extrabold text-white">
                    {iniciais(grupo.motorista.nome)}
                  </span>
                  <p className="min-w-0 flex-1 truncate font-bold text-marinho">{grupo.motorista.nome}</p>
                  <span className="shrink-0 text-xs text-slate-500">
                    {grupo.passageiros.filter((p) => !avisou(p)).length} de {grupo.passageiros.length} vão
                  </span>
                </header>
                <ul className="divide-y divide-slate-100">
                  {grupo.passageiros.map((p) => {
                    // Dia que já passou fica só para consulta (a API também recusa).
                    const podeAvisarAlgum = !passou && (podeAvisar(p.ida) || podeAvisar(p.volta))
                    const podeDesfazerAlgum = !passou && (podeDesfazer(p.ida) || podeDesfazer(p.volta))
                    return (
                      <li key={p.estudante.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                        <div className="min-w-0 flex-1 basis-56">
                          <p className="truncate font-semibold text-marinho">
                            {p.estudante.nome}
                            {p.estudante.apelido && <span className="ml-1 font-normal text-slate-400">"{p.estudante.apelido}"</span>}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {p.estudante.bairro} · {p.instituicao.nome} · {formatarCelular(p.estudante.celular)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Etiqueta rotulo="Ida" situacao={p.ida} />
                          <Etiqueta rotulo="Volta" situacao={p.volta} />
                        </div>
                        <div className="flex w-full justify-end gap-2 sm:w-36">
                          {podeDesfazerAlgum && (
                            <button
                              type="button"
                              onClick={() => void desfazer(p)}
                              className="rounded-lg px-3 py-2 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50"
                            >
                              Vai sim
                            </button>
                          )}
                          {podeAvisarAlgum && (
                            <button
                              type="button"
                              onClick={() => setAvisando(p)}
                              className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-600"
                            >
                              Não vai
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </article>
            ))}
          </div>
        </>
      )}

      {avisando && (
        <ModalAvisoNaoVou
          data={data}
          passageiro={avisando}
          aoConfirmar={(sentidos) => registrar(avisando, sentidos)}
          aoFechar={() => setAvisando(null)}
        />
      )}
      {avisos.modal}
    </>
  )
}
