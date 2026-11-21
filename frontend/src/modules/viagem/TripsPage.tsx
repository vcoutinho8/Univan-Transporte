import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

import Botao from '../../shared/components/Button.tsx'
import Cartao from '../../shared/components/Card.tsx'
import Icone from '../../shared/components/Icon.tsx'
import AvisoSemResultado from '../../shared/components/NoResults.tsx'
import { useAviso } from '../../shared/components/NoticeModal.tsx'
import CabecalhoPagina from '../../shared/components/PageHeader.tsx'
import RodapePaginacao from '../../shared/components/Pagination.tsx'
import { usePaginacao } from '../../shared/hooks/usePagination.ts'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { ErroApi } from '../../shared/services/api.ts'
import { dataIso, diaDaSemana, formatarData } from '../../shared/utils/formatar.ts'
import { ROTULOS_TURNO, type Turno } from '../estudante/types.ts'
import { servicoMotorista } from '../motorista/driverService.ts'
import { servicoVeiculo } from '../veiculo/vehicleService.ts'
import CartaoJornada from './JourneyCard.tsx'
import FormularioSubstituicao from './SubstitutionForm.tsx'
import { agruparJornadas, contarPorTurno, ORDEM_TURNOS, turnoInicial, type ResumoJornada } from './tripGrouping.ts'
import {
  ModalCompartilharWhatsApp,
  ModalDiaIndisponivel,
  ModalIniciarJornada,
  ModalJornadaConcluida,
} from './TripModals.tsx'
import GavetaPassageirosViagem from './TripPassengersDrawer.tsx'
import GavetaJornada from './TripProgressDrawer.tsx'
import { servicoViagem } from './tripService.ts'
import {
  ROTULOS_STATUS_VIAGEM,
  type Jornada,
  type MotivoIndisponivel,
  type Sentido,
  type StatusViagem,
  type Viagem,
} from './types.ts'
import { diasDaSemana, partesDoDia } from './semana.ts'
import FaixaSemana from './WeekStrip.tsx'
import { montarMensagemChamada } from './whatsappChamada.ts'

/** O que está aberto por cima da tela. */
type Sobreposicao =
  | { tipo: 'nada' }
  | { tipo: 'passageiros' | 'troca'; viagem: Viagem }
  | { tipo: 'iniciar' | 'andamento'; jornada: ResumoJornada }
  | { tipo: 'concluida'; jornada: Jornada }
  | { tipo: 'indisponivel'; motivo: MotivoIndisponivel; detalhes: string[] }
  | { tipo: 'whatsapp'; mensagem: string }

const SITUACOES: StatusViagem[] = ['agendada', 'em_andamento', 'concluida', 'cancelada']

/** Texto do modal de "Gerar viagens do dia" (viagens = uma por motorista, turno e sentido). */
export function descreverGeracao(viagens: number, passageiros: number): string {
  if (viagens === 0 && passageiros === 0) return 'Nenhuma viagem nova.'
  const partes = [
    viagens > 0 && `${viagens} viage${viagens === 1 ? 'm' : 'ns'} de motorista`,
    passageiros > 0 && `${passageiros} passageiro${passageiros === 1 ? '' : 's'} na chamada`,
  ].filter(Boolean)
  return `${partes.join(' e ')}.`
}

/** Quantas jornadas (motorista + turno + sentido) o dia tem. */
function jornadasDoDia(viagens: Viagem[]): number {
  return new Set(viagens.map((v) => `${v.motorista.id}|${v.rota.turno}|${v.sentido}`)).size
}

interface PropsSecao {
  sentido: Sentido
  jornadas: ResumoJornada[]
  chaveFiltros: string
  renderizar: (jornada: ResumoJornada, indice: number) => ReactNode
  /** Filtros ativos (ex.: "Situação: Cancelada"), para o aviso quando nada aparece. */
  filtros: string[]
  aoLimpar: () => void
}

/** Ida ou volta do turno: os cartões dos motoristas, paginados. */
function SecaoSentido({ sentido, jornadas, chaveFiltros, renderizar, filtros, aoLimpar }: PropsSecao) {
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
          · {jornadas.length} viage{jornadas.length === 1 ? 'm' : 'ns'}
        </span>
      </h2>
      {jornadas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60">
          <AvisoSemResultado
            titulo={`Nenhuma ${ida ? 'ida' : 'volta'} encontrada`}
            filtros={filtros}
            aoLimpar={aoLimpar}
            dica={filtros.length ? undefined : `Nenhum motorista tem ${ida ? 'ida' : 'volta'} neste turno.`}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {paginacao.visiveis.map((j, i) => renderizar(j, i))}
          {paginacao.totalPaginas > 1 && (
            <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70">
              <RodapePaginacao paginacao={paginacao} rotulo="viagem(ns)" />
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
  const avisos = useAviso()
  const [gerando, setGerando] = useState(false)
  const [ocupada, setOcupada] = useState<number | null>(null)
  const [preparandoWhatsApp, setPreparandoWhatsApp] = useState<string | null>(null)
  const [versaoCalendario, setVersaoCalendario] = useState(0)

  const viagens = useRequisicao(() => servicoViagem.listar({ data }), [data])
  const motoristas = useRequisicao(() => servicoMotorista.listar())
  const veiculos = useRequisicao(() => servicoVeiculo.listar())
  const todas = useMemo(() => viagens.dados ?? [], [viagens.dados])

  // Sem escolha do usuário, abre no turno do horário atual (ou no primeiro que tiver viagem).
  const turno = turnoEscolhido ?? turnoInicial(todas, new Date().getHours())
  const porTurno = contarPorTurno(todas)
  // A operação trabalha com manhã e noite; a tarde só aparece se o dia tiver viagem à tarde.
  const turnosVisiveis = ORDEM_TURNOS.filter((t) => t !== 'tarde' || porTurno.tarde > 0)
  const jornadas = useMemo(() => agruparJornadas(todas, turno), [todas, turno])

  const totais = useMemo(() => {
    const contagem = { agendada: 0, em_andamento: 0, concluida: 0, cancelada: 0 }
    for (const j of [...jornadas.ida, ...jornadas.volta]) contagem[j.status] += 1
    return contagem
  }, [jornadas])

  const filtrosAtivos = situacao ? [`Situação: ${ROTULOS_STATUS_VIAGEM[situacao]}`] : []
  const filtrar = (lista: ResumoJornada[]) => (situacao ? lista.filter((j) => j.status === situacao) : lista)
  // Só dá para gerar até o fim da semana atual (a API recusa semanas futuras).
  const limiteGeracao = diasDaSemana(dataIso())[6]
  const semanaFutura = data > limiteGeracao
  const liberaEm = diasDaSemana(data)[0]
  const dataPorExtenso = `${diaDaSemana(data).replace(/^./, (c) => c.toUpperCase())}, ${formatarData(data)}`
  const chaveFiltros = `${data}|${turno}|${situacao}`

  function trocarDia(novo: string) {
    setData(novo)
  }

  async function gerar() {
    setGerando(true)
    try {
      const antes = jornadasDoDia(todas)
      const resultado = await servicoViagem.gerar(data)
      setVersaoCalendario((v) => v + 1)
      if (resultado.indisponivel) {
        setAberto({ tipo: 'indisponivel', motivo: resultado.indisponivel, detalhes: resultado.avisos })
        return
      }
      const depois = jornadasDoDia(await servicoViagem.listar({ data }))
      await viagens.recarregar()
      const novas = depois - antes
      const houveNovidade = resultado.viagens_criadas > 0 || resultado.chamadas_criadas > 0
      const pendencias = resultado.avisos.filter((a) => a !== 'As viagens deste dia já tinham sido geradas.')
      avisos.mostrar({
        tipo: houveNovidade ? (pendencias.length ? 'aviso' : 'sucesso') : 'info',
        titulo: houveNovidade ? 'Viagens do dia geradas' : 'Nada novo para gerar',
        descricao: houveNovidade
          ? `${dataPorExtenso}: ${descreverGeracao(Math.max(novas, 0), resultado.chamadas_criadas)}`
          : `As viagens de ${dataPorExtenso.toLowerCase()} já estavam geradas e completas.`,
        itens: pendencias,
      })
    } catch (e) {
      avisos.erro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado.', 'Não foi possível gerar as viagens')
    } finally {
      setGerando(false)
    }
  }

  async function cancelarRota(v: Viagem) {
    if (!window.confirm(`Cancelar a rota ${v.rota.nome} (${v.sentido}) hoje? Esses passageiros não serão buscados.`)) return
    setOcupada(v.id)
    try {
      await servicoViagem.cancelar(v.id)
      await viagens.recarregar()
      avisos.mostrar({
        tipo: 'sucesso',
        titulo: 'Destino cancelado neste dia',
        descricao: `${v.rota.instituicao.nome} (${v.sentido}) não será atendida em ${dataPorExtenso.toLowerCase()}.`,
      })
    } catch (e) {
      avisos.erro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado.', 'Não foi possível cancelar')
    } finally {
      setOcupada(null)
    }
  }

  /** Confirmou no modal: inicia todas as rotas e já abre a fila no primeiro passageiro. */
  async function iniciar(jornada: ResumoJornada) {
    await servicoViagem.iniciarJornada(jornada.chave)
    setAberto({ tipo: 'andamento', jornada })
    await viagens.recarregar()
  }

  async function salvarTroca(viagem: Viagem, dados: { fk_motorista?: number; fk_veiculo?: number }) {
    await servicoViagem.substituir(viagem.id, dados)
    setAberto({ tipo: 'nada' })
    await viagens.recarregar()
    avisos.mostrar({
      tipo: 'sucesso',
      titulo: 'Troca salva',
      descricao: `A troca vale só para ${viagem.rota.instituicao.nome} (${viagem.sentido}) neste dia; o cadastro da rota não muda.`,
    })
  }

  async function prepararChamadaWhatsApp(jornada: ResumoJornada) {
    const chave = `${jornada.chave.sentido}-${jornada.motorista.id}`
    setPreparandoWhatsApp(chave)
    try {
      const detalhes = await Promise.all(jornada.viagens.map((v) => servicoViagem.obter(v.id)))
      const motoristaCompleto = motoristas.dados?.find((m) => m.id === jornada.motorista.id) ?? null
      const mensagem = montarMensagemChamada({
        jornada,
        detalhes,
        motoristaCompleto,
        veiculosCompletos: veiculos.dados ?? [],
      })
      setAberto({ tipo: 'whatsapp', mensagem })
    } catch (e) {
      avisos.erro(
        e instanceof ErroApi ? e.mensagemCompleta : 'Não foi possível buscar a lista de passageiros.',
        'Erro ao gerar chamada',
      )
    } finally {
      setPreparandoWhatsApp(null)
    }
  }

  const cartao = (jornada: ResumoJornada, indice: number) => {
    const chave = `${jornada.chave.sentido}-${jornada.motorista.id}`
    return (
      <CartaoJornada
        key={chave}
        jornada={jornada}
        indice={indice}
        ocupado={jornada.viagens.some((v) => v.id === ocupada)}
        carregandoWhatsApp={preparandoWhatsApp === chave}
        aoIniciar={() => setAberto({ tipo: 'iniciar', jornada })}
        aoAcompanhar={() => setAberto({ tipo: 'andamento', jornada })}
        aoCompartilharWhatsApp={() => void prepararChamadaWhatsApp(jornada)}
        aoVerPassageiros={(v) => setAberto({ tipo: 'passageiros', viagem: v })}
        aoTrocar={(v) => setAberto({ tipo: 'troca', viagem: v })}
        aoCancelar={(v) => void cancelarRota(v)}
      />
    )
  }

  const fechar = () => setAberto({ tipo: 'nada' })

  return (
    <>
      <CabecalhoPagina
        titulo="Viagens"
        descricao="Gere as viagens do dia, acompanhe cada motorista e confirme embarque e desembarque dos passageiros."
      />

      {/* Dia: faixa da semana + ação de gerar */}
      <section className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-5">
        <FaixaSemana data={data} aoEscolher={trocarDia} versao={versaoCalendario} />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div>
            <p className="text-lg font-extrabold text-marinho">{dataPorExtenso}</p>
            <p className="text-sm text-slate-500">
              {todas.length > 0
                ? `${jornadasDoDia(todas)} viagens de motorista · ${todas.filter((v) => v.status !== 'cancelada').length} destinos`
                : 'Nenhuma viagem gerada para este dia.'}
            </p>
          </div>
          {semanaFutura ? (
            <div className="flex w-full items-center gap-2 rounded-xl bg-fundo px-4 py-2.5 text-sm text-slate-600 sm:w-auto">
              <Icone nome="relogio" className="h-4 w-4 shrink-0 text-slate-400" />
              <span>
                Semana futura: gere a partir de{' '}
                <strong className="text-marinho">
                  {partesDoDia(liberaEm).semana.toLowerCase()}, {formatarData(liberaEm).slice(0, 5)}
                </strong>
              </span>
            </div>
          ) : (
            <Botao onClick={() => void gerar()} disabled={gerando} className="w-full sm:w-auto">
              <Icone nome="mais" className="h-4 w-4" />
              {gerando ? 'Gerando...' : todas.length > 0 ? 'Atualizar viagens do dia' : 'Gerar viagens do dia'}
            </Botao>
          )}
        </div>
      </section>

      {/* Turno e situação */}
      {todas.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
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
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] sm:ml-auto" aria-label="Filtrar por situação">
            {SITUACOES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSituacao(situacao === s ? '' : s)}
                aria-pressed={situacao === s}
                disabled={totais[s] === 0 && situacao !== s}
                title={totais[s] === 0 ? `Nenhuma jornada ${ROTULOS_STATUS_VIAGEM[s].toLowerCase()} neste turno` : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  situacao === s
                    ? 'bg-laranja text-white shadow-sm'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-marinho'
                }`}
              >
                {ROTULOS_STATUS_VIAGEM[s]}
                <span
                  className={`rounded-full px-1.5 text-xs tabular-nums ${situacao === s ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}`}
                >
                  {totais[s]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {viagens.erro && (
        <Cartao>
          <AvisoSemResultado titulo="Não foi possível carregar as viagens" filtros={[]} dica={viagens.erro} />
        </Cartao>
      )}
      {viagens.carregando && (
        <Cartao>
          <p className="py-6 text-center text-sm text-slate-500">Carregando...</p>
        </Cartao>
      )}
      {!viagens.carregando && !viagens.erro && todas.length > 0 && porTurno[turno] === 0 && (
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
          <SecaoSentido sentido="ida" jornadas={filtrar(jornadas.ida)} chaveFiltros={chaveFiltros} renderizar={cartao} filtros={filtrosAtivos} aoLimpar={() => setSituacao('')} />
          <SecaoSentido sentido="volta" jornadas={filtrar(jornadas.volta)} chaveFiltros={chaveFiltros} renderizar={cartao} filtros={filtrosAtivos} aoLimpar={() => setSituacao('')} />
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
      {avisos.modal}
      {aberto.tipo === 'indisponivel' && (
        <ModalDiaIndisponivel motivo={aberto.motivo} dataPorExtenso={dataPorExtenso} detalhes={aberto.detalhes} aoFechar={fechar} />
      )}
      {aberto.tipo === 'passageiros' && <GavetaPassageirosViagem viagem={aberto.viagem} aoFechar={fechar} />}
      {aberto.tipo === 'troca' && (
        <FormularioSubstituicao viagem={aberto.viagem} aoSalvar={(dados) => salvarTroca(aberto.viagem, dados)} aoCancelar={fechar} />
      )}
      {aberto.tipo === 'whatsapp' && (
        <ModalCompartilharWhatsApp mensagem={aberto.mensagem} aoFechar={fechar} />
      )}
    </>
  )
}