import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Cartao from '../../shared/components/Card.tsx'
import Icone from '../../shared/components/Icon.tsx'
import CabecalhoPagina from '../../shared/components/PageHeader.tsx'
import RodapePaginacao from '../../shared/components/Pagination.tsx'
import { usePaginacao } from '../../shared/hooks/usePagination.ts'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { ErroApi } from '../../shared/services/api.ts'
import { dataIso, diaDaSemana, formatarData, somarDias } from '../../shared/utils/formatar.ts'
import { ROTULOS_TURNO, type Turno } from '../estudante/types.ts'
import CartaoJornada from './JourneyCard.tsx'
import FormularioSubstituicao from './SubstitutionForm.tsx'
import { agruparJornadas, contarPorTurno, ORDEM_TURNOS, turnoInicial, type ResumoJornada } from './tripGrouping.ts'
import { ModalIniciarJornada, ModalJornadaConcluida } from './TripModals.tsx'
import GavetaPassageirosViagem from './TripPassengersDrawer.tsx'
import GavetaJornada from './TripProgressDrawer.tsx'
import { servicoViagem } from './tripService.ts'
import { ROTULOS_STATUS_VIAGEM, type Jornada, type Sentido, type StatusViagem, type Viagem } from './types.ts'

type Aviso = { mensagem: string; tipo: 'erro' | 'sucesso' | 'aviso' }

/** O que está aberto por cima da tela. */
type Sobreposicao =
  | { tipo: 'nada' }
  | { tipo: 'passageiros' | 'troca'; viagem: Viagem }
  | { tipo: 'iniciar' | 'andamento'; jornada: ResumoJornada }
  | { tipo: 'concluida'; jornada: Jornada }

const SITUACOES: StatusViagem[] = ['agendada', 'em_andamento', 'concluida', 'cancelada']

/** Texto curto para o resultado de "Gerar viagens do dia". */
export function descreverGeracao(viagens: number, passageiros: number): string {
  if (viagens === 0 && passageiros === 0) return 'Nenhuma viagem nova.'
  const partes = [
    viagens > 0 && `${viagens} viage${viagens === 1 ? 'm criada' : 'ns criadas'}`,
    passageiros > 0 && `${passageiros} passageiro${passageiros === 1 ? '' : 's'} na chamada`,
  ].filter(Boolean)
  return `${partes.join(' e ')}.`
}

interface PropsSecao {
  sentido: Sentido
  jornadas: ResumoJornada[]
  chaveFiltros: string
  renderizar: (jornada: ResumoJornada, indice: number) => ReactNode
}

/** Ida ou volta do turno: os cartões dos motoristas, paginados. */
function SecaoSentido({ sentido, jornadas, chaveFiltros, renderizar }: PropsSecao) {
  const paginacao = usePaginacao(jornadas, chaveFiltros)
  const ida = sentido === 'ida'
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-marinho">
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${ida ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>
          <Icone nome="seta" className={`h-4 w-4 ${ida ? '' : 'rotate-180'}`} />
        </span>
        {ida ? 'Ida' : 'Volta'}
        <span className="text-sm font-normal text-slate-500">
          · {jornadas.length} motorista{jornadas.length === 1 ? '' : 's'}
        </span>
      </h2>
      {jornadas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 px-5 py-6 text-center text-sm text-slate-500">
          Nenhuma {ida ? 'ida' : 'volta'} com esses filtros.
        </p>
      ) : (
        <div className="space-y-3">
          {paginacao.visiveis.map((j, i) => renderizar(j, i))}
          {paginacao.totalPaginas > 1 && (
            <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70">
              <RodapePaginacao paginacao={paginacao} rotulo="motorista(s)" />
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * Tela de viagens (RF3). Escolhe o dia e o turno; dentro do turno, a ida e a volta trazem um
 * cartão por motorista (a "jornada"): todas as rotas dele saem juntas com um botão só, e a fila
 * de passageiros é única. Quem avisou que não vai (aviso prévio) não entra no embarque.
 */
export default function PaginaViagens() {
  // ?data=AAAA-MM-DD&turno=noite abre direto no dia e turno (ex.: link mandado ao motorista).
  const [parametros] = useSearchParams()
  const [data, setData] = useState(() => (/^\d{4}-\d{2}-\d{2}$/.test(parametros.get('data') ?? '') ? parametros.get('data')! : dataIso()))
  const [turnoEscolhido, setTurnoEscolhido] = useState<Turno | null>(() =>
    ORDEM_TURNOS.find((t) => t === parametros.get('turno')) ?? null,
  )
  const [situacao, setSituacao] = useState<StatusViagem | ''>('')
  const [aberto, setAberto] = useState<Sobreposicao>({ tipo: 'nada' })
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [gerando, setGerando] = useState(false)
  const [ocupada, setOcupada] = useState<number | null>(null)

  const viagens = useRequisicao(() => servicoViagem.listar({ data }), [data])
  const todas = useMemo(() => viagens.dados ?? [], [viagens.dados])

  // Sem escolha do usuário, abre no turno do horário atual (ou no primeiro que tiver viagem).
  const turno = turnoEscolhido ?? turnoInicial(todas, new Date().getHours())
  const porTurno = contarPorTurno(todas)
  const jornadas = useMemo(() => agruparJornadas(todas, turno), [todas, turno])

  const totais = useMemo(() => {
    const contagem = { agendada: 0, em_andamento: 0, concluida: 0, cancelada: 0 }
    for (const j of [...jornadas.ida, ...jornadas.volta]) contagem[j.status] += 1
    return contagem
  }, [jornadas])

  const filtrar = (lista: ResumoJornada[]) => (situacao ? lista.filter((j) => j.status === situacao) : lista)
  const ehHoje = data === dataIso()
  const chaveFiltros = `${data}|${turno}|${situacao}`

  function trocarDia(novo: string) {
    setData(novo)
    setAvisos([])
  }

  async function gerar() {
    setGerando(true)
    try {
      const resultado = await servicoViagem.gerar(data)
      setAvisos([
        {
          mensagem: `${formatarData(data)}: ${descreverGeracao(resultado.viagens_criadas, resultado.chamadas_criadas)}`,
          tipo: resultado.viagens_criadas > 0 || resultado.chamadas_criadas > 0 ? 'sucesso' : 'aviso',
        },
        ...resultado.avisos.map((mensagem) => ({ mensagem, tipo: 'aviso' as const })),
      ])
      await viagens.recarregar()
    } catch (e) {
      setAvisos([{ mensagem: e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado.', tipo: 'erro' }])
    } finally {
      setGerando(false)
    }
  }

  async function cancelarRota(v: Viagem) {
    if (!window.confirm(`Cancelar a rota ${v.rota.nome} (${v.sentido}) hoje? Esses passageiros não serão buscados.`)) return
    setOcupada(v.id)
    try {
      await servicoViagem.cancelar(v.id)
      setAvisos([{ mensagem: `Rota ${v.rota.nome} cancelada neste dia.`, tipo: 'sucesso' }])
      await viagens.recarregar()
    } catch (e) {
      setAvisos([{ mensagem: e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado.', tipo: 'erro' }])
    } finally {
      setOcupada(null)
    }
  }

  /** Confirmou no modal: inicia todas as rotas e já abre a fila no primeiro passageiro. */
  async function iniciar(jornada: ResumoJornada) {
    await servicoViagem.iniciarJornada(jornada.chave)
    setAvisos([])
    setAberto({ tipo: 'andamento', jornada })
    await viagens.recarregar()
  }

  async function salvarTroca(viagem: Viagem, dados: { fk_motorista?: number; fk_veiculo?: number }) {
    await servicoViagem.substituir(viagem.id, dados)
    setAberto({ tipo: 'nada' })
    setAvisos([{ mensagem: `Troca salva na rota ${viagem.rota.nome}.`, tipo: 'sucesso' }])
    await viagens.recarregar()
  }

  const cartao = (jornada: ResumoJornada, indice: number) => (
    <CartaoJornada
      key={`${jornada.chave.sentido}-${jornada.motorista.id}`}
      jornada={jornada}
      indice={indice}
      ocupado={jornada.viagens.some((v) => v.id === ocupada)}
      aoIniciar={() => setAberto({ tipo: 'iniciar', jornada })}
      aoAcompanhar={() => setAberto({ tipo: 'andamento', jornada })}
      aoVerPassageiros={(v) => setAberto({ tipo: 'passageiros', viagem: v })}
      aoTrocar={(v) => setAberto({ tipo: 'troca', viagem: v })}
      aoCancelar={(v) => void cancelarRota(v)}
    />
  )

  const fechar = () => setAberto({ tipo: 'nada' })

  return (
    <>
      <CabecalhoPagina
        titulo="Viagens"
        descricao={`${diaDaSemana(data).replace(/^./, (c) => c.toUpperCase())}, ${formatarData(data)}`}
        acoes={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="flex flex-1 items-center rounded-lg bg-white ring-1 ring-slate-300 sm:flex-none">
              <button
                type="button"
                onClick={() => trocarDia(somarDias(data, -1))}
                aria-label="Dia anterior"
                className="rounded-l-lg px-2.5 py-2 text-marinho hover:bg-fundo"
              >
                <Icone nome="seta" className="h-4 w-4 rotate-180" />
              </button>
              <input
                type="date"
                aria-label="Data das viagens"
                value={data}
                onChange={(e) => e.target.value && trocarDia(e.target.value)}
                className="min-w-0 flex-1 border-x border-slate-200 px-2 py-2 text-sm font-semibold text-marinho outline-none sm:py-1.5"
              />
              <button
                type="button"
                onClick={() => trocarDia(somarDias(data, 1))}
                aria-label="Próximo dia"
                className="rounded-r-lg px-2.5 py-2 text-marinho hover:bg-fundo"
              >
                <Icone nome="seta" className="h-4 w-4" />
              </button>
            </div>
            {!ehHoje && (
              <Botao variante="secundario" onClick={() => trocarDia(dataIso())}>
                Hoje
              </Botao>
            )}
            <Botao onClick={() => void gerar()} disabled={gerando} className="w-full sm:w-auto">
              <Icone nome="mais" className="h-4 w-4" />
              {gerando ? 'Gerando...' : 'Gerar viagens do dia'}
            </Botao>
          </div>
        }
      />

      {avisos.length > 0 && (
        <div className="mb-4 space-y-2 animate-surgir">
          {avisos.map((aviso, i) => (
            <Alerta
              key={`${i}-${aviso.mensagem}`}
              mensagem={aviso.mensagem}
              tipo={aviso.tipo}
              aoFechar={() => setAvisos((lista) => lista.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      )}

      {/* Turno */}
      <div role="tablist" aria-label="Turno" className="mb-4 grid grid-cols-3 gap-2 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200/70">
        {ORDEM_TURNOS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={turno === t}
            onClick={() => setTurnoEscolhido(t)}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
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

      {/* Situação das jornadas do turno (também filtra) */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {SITUACOES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSituacao(situacao === s ? '' : s)}
            aria-pressed={situacao === s}
            className={`rounded-2xl bg-white px-3 py-2 text-left shadow-sm ring-1 transition-all hover:-translate-y-0.5 sm:px-4 sm:py-2.5 ${
              situacao === s ? 'ring-2 ring-laranja' : 'ring-slate-200/70'
            }`}
          >
            <span className="text-xs font-semibold text-slate-500">{ROTULOS_STATUS_VIAGEM[s]}</span>
            <span className="block text-xl font-extrabold text-marinho tabular-nums">{totais[s]}</span>
          </button>
        ))}
      </div>

      {viagens.erro && <Alerta mensagem={viagens.erro} />}
      {viagens.carregando && (
        <Cartao>
          <p className="py-6 text-center text-sm text-slate-500">Carregando...</p>
        </Cartao>
      )}
      {!viagens.carregando && !viagens.erro && porTurno[turno] === 0 && (
        <Cartao>
          <p className="py-6 text-center text-sm text-slate-500">
            {todas.length === 0
              ? 'Nenhuma viagem neste dia. Clique em "Gerar viagens do dia" para criá-las a partir das rotas.'
              : `Nenhuma viagem no turno da ${ROTULOS_TURNO[turno].toLowerCase()} neste dia.`}
          </p>
        </Cartao>
      )}
      {!viagens.carregando && !viagens.erro && porTurno[turno] > 0 && (
        <div className="space-y-8">
          <SecaoSentido sentido="ida" jornadas={filtrar(jornadas.ida)} chaveFiltros={chaveFiltros} renderizar={cartao} />
          <SecaoSentido sentido="volta" jornadas={filtrar(jornadas.volta)} chaveFiltros={chaveFiltros} renderizar={cartao} />
        </div>
      )}

      {aberto.tipo === 'iniciar' && (
        <ModalIniciarJornada jornada={aberto.jornada} aoConfirmar={() => iniciar(aberto.jornada)} aoFechar={fechar} />
      )}
      {aberto.tipo === 'andamento' && (
        <GavetaJornada
          chave={aberto.jornada.chave}
          motorista={aberto.jornada.motorista.nome}
          aoAtualizar={() => void viagens.recarregar()}
          aoConcluir={(concluida) => setAberto({ tipo: 'concluida', jornada: concluida })}
          aoFechar={fechar}
        />
      )}
      {aberto.tipo === 'concluida' && <ModalJornadaConcluida jornada={aberto.jornada} aoFechar={fechar} />}
      {aberto.tipo === 'passageiros' && <GavetaPassageirosViagem viagem={aberto.viagem} aoFechar={fechar} />}
      {aberto.tipo === 'troca' && (
        <FormularioSubstituicao viagem={aberto.viagem} aoSalvar={(dados) => salvarTroca(aberto.viagem, dados)} aoCancelar={fechar} />
      )}
    </>
  )
}
