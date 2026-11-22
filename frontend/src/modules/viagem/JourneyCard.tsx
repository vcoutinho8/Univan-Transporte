import { useState } from 'react'

import Botao from '../../shared/components/Button.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { formatarHoraDe, formatarHorario, iniciais } from '../../shared/utils/formatar.ts'
import type { ResumoJornada } from './tripGrouping.ts'
import { ROTULOS_STATUS_VIAGEM, type StatusViagem, type Viagem } from './types.ts'

export const CORES_STATUS_VIAGEM: Record<StatusViagem, string> = {
  agendada: 'bg-marinho/10 text-marinho',
  em_andamento: 'bg-laranja/15 text-laranja',
  concluida: 'bg-emerald-100 text-emerald-700',
  cancelada: 'bg-slate-200 text-slate-500',
}

export function EtiquetaStatusViagem({ status, aCaminho = false }: { status: StatusViagem; aCaminho?: boolean }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${
        aCaminho ? 'bg-sky-100 text-sky-700' : CORES_STATUS_VIAGEM[status]
      }`}
    >
      {aCaminho ? 'A caminho' : ROTULOS_STATUS_VIAGEM[status]}
    </span>
  )
}

interface Propriedades {
  jornada: ResumoJornada
  indice: number
  ocupado: boolean
  carregandoWhatsApp?: boolean
  /** Sem ele não há botão de iniciar (só se inicia a viagem de hoje). */
  aoIniciar?: () => void
  aoAcompanhar: () => void
  /** Sem ele o botão some (ex.: dia que já passou: a chamada não vale mais). */
  aoCompartilharWhatsApp?: () => void
  aoVerPassageiros: (v: Viagem) => void
  /** Sem as ações abaixo o botão some (perfil sem permissão). */
  aoTrocar?: (v: Viagem) => void
  aoCancelar?: (v: Viagem) => void
  /** Só visualização (auxiliar): sem iniciar nem registrar embarque; vê os passageiros. */
  somenteLeitura?: boolean
  /** Texto do botão da viagem em andamento (o motorista continua pela "Minha rota"). */
  rotuloContinuar?: string
}

/**
 * Cartão da jornada de um motorista (ex.: a ida da noite do Carlos): um botão só para iniciar
 * todas as rotas dele e, embaixo, cada rota com a faculdade, os passageiros e as ações da rota.
 */
export default function CartaoJornada({
  jornada,
  indice,
  ocupado,
  carregandoWhatsApp = false,
  aoIniciar,
  aoAcompanhar,
  aoCompartilharWhatsApp,
  aoVerPassageiros,
  aoTrocar,
  aoCancelar,
  somenteLeitura = false,
  rotuloContinuar,
}: Propriedades) {
  const ida = jornada.chave.sentido === 'ida'
  // Destinos começam ocultos: o cartão mostra a viagem do motorista; as rotas ficam a um clique.
  const [mostrarDestinos, setMostrarDestinos] = useState(false)
  const { passageiros } = jornada
  const fila = passageiros.total - passageiros.nao_vai
  const registrados = passageiros.presente + passageiros.ausente
  // Em andamento sem ninguém pendente: o embarque acabou, faltam os desembarques.
  const aCaminho = jornada.status === 'em_andamento' && passageiros.pendente === 0
  const saida = jornada.viagens.map((v) => v.horario_saida).filter(Boolean).sort()[0] ?? null

  return (
    <article
      className="animate-surgir overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70"
      style={{ animationDelay: `${Math.min(indice * 40, 240)}ms` }}
    >
      {/* Cabeçalho: motorista, saída e ação principal */}
      <header className="px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-marinho text-sm font-extrabold text-white">
            {iniciais(jornada.motorista.nome)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-marinho">{jornada.motorista.nome}</p>
            <p className="truncate text-xs text-slate-500">
              {jornada.veiculos.map((v) => `${v.placa} · ${v.modelo}`).join(' / ')}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg leading-tight font-extrabold text-marinho tabular-nums">{formatarHorario(jornada.horario_previsto)}</p>
            <p className="text-[11px] text-slate-500">{saida ? `saiu ${formatarHoraDe(saida)}` : 'saída prevista'}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <EtiquetaStatusViagem status={jornada.status} aCaminho={aCaminho} />
          <span className="text-sm text-slate-600">
            <strong className="text-marinho tabular-nums">
              {jornada.status === 'agendada' ? fila : registrados}/{fila}
            </strong>{' '}
            {jornada.status === 'agendada' ? 'a buscar' : 'registrados'} · {jornada.viagens.length} destino(s)
          </span>
          {passageiros.nao_vai > 0 && (
            <span className="text-xs font-semibold text-amber-600">{passageiros.nao_vai} avisaram que não vão</span>
          )}
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            {aoCompartilharWhatsApp && jornada.status !== 'cancelada' && (
              <button
                type="button"
                onClick={aoCompartilharWhatsApp}
                disabled={carregandoWhatsApp}
                title="Gerar chamada formatada para enviar no grupo do WhatsApp"
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 transition-colors hover:bg-emerald-100 disabled:opacity-50 sm:flex-initial sm:py-2"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-current" aria-hidden="true">
                  <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm5.82 14.01c-.24.68-1.41 1.3-1.95 1.38-.5.07-1.13.1-1.82-.12-.42-.13-.96-.31-1.65-.61-2.91-1.26-4.81-4.19-4.96-4.38-.14-.19-1.18-1.57-1.18-3 0-1.43.75-2.13 1.01-2.42.27-.29.58-.36.77-.36.19 0 .39 0 .56.01.18.01.42-.07.66.5.24.58.82 2.01.89 2.16.07.14.12.31.02.5-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.75 1.24 1.61 2.01 1.11.99 2.04 1.3 2.33 1.44.29.15.46.12.63-.07.17-.19.73-.85.92-1.14.19-.29.39-.24.65-.15.27.1 1.69.8 1.98.94.29.15.48.22.55.34.07.12.07.69-.17 1.37z" />
                </svg>
                {carregandoWhatsApp ? 'Preparando...' : 'WhatsApp'}
              </button>
            )}
            {somenteLeitura && jornada.status !== 'cancelada' && (
              <Botao variante="secundario" onClick={() => aoVerPassageiros(jornada.viagens[0])} className="flex-1 sm:flex-initial">
                Ver passageiros
              </Botao>
            )}
            {!somenteLeitura && aoIniciar && jornada.status === 'agendada' && (
              <Botao onClick={aoIniciar} disabled={ocupado} className="flex-1 py-3 sm:flex-initial sm:py-2">
                <Icone nome="van" className="h-4 w-4" />
                {ida ? 'Iniciar ida' : 'Iniciar volta'}
              </Botao>
            )}
            {!somenteLeitura && jornada.status === 'em_andamento' && (
              <Botao onClick={aoAcompanhar} className="flex-1 py-3 sm:flex-initial sm:py-2">
                <Icone nome="van" className="h-4 w-4" />
                {rotuloContinuar ?? (aCaminho ? 'Confirmar desembarques' : 'Continuar embarque')}
              </Botao>
            )}
            {!somenteLeitura && jornada.status === 'concluida' && (
              <Botao variante="secundario" onClick={aoAcompanhar} className="flex-1 sm:flex-initial">
                Ver passageiros
              </Botao>
            )}
          </div>
        </div>
        {/* Em andamento: só uma bolinha pulsando e a fase atual */}
        {jornada.status === 'em_andamento' && (
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-sky-700">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-500" />
            </span>
            {aCaminho
              ? ida
                ? 'A caminho das faculdades'
                : 'Levando os passageiros para casa'
              : ida
                ? 'Buscando os passageiros'
                : 'Embarque na faculdade'}
            <span className="font-normal text-slate-500">
              · {aCaminho ? `${passageiros.presente} a bordo` : `${registrados}/${fila} registrados`}
            </span>
          </p>
        )}
      </header>

      {/* Destinos da viagem: uma linha por rota (faculdade), ocultos até o usuário pedir */}
      <button
        type="button"
        onClick={() => setMostrarDestinos(!mostrarDestinos)}
        aria-expanded={mostrarDestinos}
        className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100 py-2.5 text-xs font-bold text-slate-500 transition-colors hover:bg-fundo/60 hover:text-marinho"
      >
        {mostrarDestinos ? 'Ocultar destinos' : `Ver destinos (${jornada.viagens.length})`}
        <Icone nome="chevron" className={`h-3.5 w-3.5 transition-transform ${mostrarDestinos ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      {mostrarDestinos && (
        <ul className="animate-aparecer divide-y divide-slate-100 border-t border-slate-100 bg-fundo/30">
          {jornada.viagens.map((v) => (
            <li key={v.id} className="flex items-start gap-3 px-4 py-3 text-sm sm:px-5">
              <span className="w-11 shrink-0 pt-0.5 font-semibold text-slate-600 tabular-nums">{formatarHorario(v.horario_previsto)}</span>
              <div className="min-w-0 flex-1">
                <p className={`font-semibold ${v.status === 'cancelada' ? 'text-slate-400 line-through' : 'text-marinho'}`}>
                  {v.rota.instituicao.nome}
                </p>
                <p className="truncate text-xs text-slate-400">{v.rota.nome}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <button
                    type="button"
                    onClick={() => aoVerPassageiros(v)}
                    className="py-1 text-xs font-semibold text-slate-600 tabular-nums hover:text-laranja hover:underline"
                  >
                    {v.passageiros.total - v.passageiros.nao_vai} passageiro(s)
                  </button>
                  {v.status !== jornada.status && <EtiquetaStatusViagem status={v.status} />}
                  {v.substituicao && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">substituição</span>
                  )}
                  {aoTrocar && (v.status === 'agendada' || v.status === 'em_andamento') && (
                    <button
                      type="button"
                      onClick={() => aoTrocar(v)}
                      aria-label={`Trocar motorista ou veículo de ${v.rota.nome}`}
                      className="flex items-center gap-1 py-1 text-xs font-semibold text-slate-500 hover:text-marinho"
                    >
                      <Icone nome="troca" className="h-3.5 w-3.5" />
                      Trocar
                    </button>
                  )}
                  {aoCancelar && v.status === 'agendada' && (
                    <button
                      type="button"
                      onClick={() => aoCancelar(v)}
                      disabled={ocupado}
                      className="py-1 text-xs font-semibold text-red-500 hover:underline disabled:opacity-50"
                    >
                      Cancelar rota
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}