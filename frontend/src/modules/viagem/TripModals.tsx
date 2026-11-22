import { useState } from 'react'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Modal from '../../shared/components/Modal.tsx'
import { ErroApi } from '../../shared/services/api.ts'
import { formatarHoraDe, formatarHorario } from '../../shared/utils/formatar.ts'
import { ROTULOS_TURNO } from '../estudante/types.ts'
import { duracaoDaViagem } from './tripFlow.ts'
import type { ResumoJornada } from './tripGrouping.ts'
import type { Jornada, MotivoIndisponivel } from './types.ts'
import { abrirWhatsAppComMensagem } from './whatsappChamada.ts'

/** Linha "rótulo ........ valor" dos quadros de resumo. */
function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-slate-500">{rotulo}</span>
      <span className="text-right font-semibold text-marinho">{valor}</span>
    </div>
  )
}

/** "Deseja iniciar a ida?": confere motorista, veículo, rotas e passageiros antes de sair. */
export function ModalIniciarJornada({
  jornada,
  aoConfirmar,
  aoFechar,
}: {
  jornada: ResumoJornada
  aoConfirmar: () => Promise<void>
  aoFechar: () => void
}) {
  const [iniciando, setIniciando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const agendadas = jornada.viagens.filter((v) => v.status === 'agendada')
  const aBuscar = agendadas.reduce((s, v) => s + v.passageiros.total - v.passageiros.nao_vai, 0)
  const avisaram = agendadas.reduce((s, v) => s + v.passageiros.nao_vai, 0)
  const ida = jornada.chave.sentido === 'ida'

  async function confirmar() {
    setIniciando(true)
    setErro(null)
    try {
      await aoConfirmar()
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Não foi possível iniciar.')
      setIniciando(false)
    }
  }

  return (
    <Modal
      titulo={ida ? 'Deseja iniciar a ida?' : 'Deseja iniciar a volta?'}
      descricao={`Todas as rotas de ${jornada.motorista.nome} neste turno saem juntas. Depois é só ir registrando cada passageiro.`}
      icone="van"
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Agora não
          </Botao>
          <Botao onClick={() => void confirmar()} disabled={iniciando}>
            {iniciando ? 'Iniciando...' : ida ? 'Iniciar ida' : 'Iniciar volta'}
          </Botao>
        </>
      }
    >
      {erro && (
        <div className="mb-3">
          <Alerta mensagem={erro} />
        </div>
      )}
      <div className="divide-y divide-slate-100 rounded-xl bg-fundo/60 px-4 py-1">
        <Dado rotulo="Motorista" valor={jornada.motorista.nome} />
        <Dado rotulo="Veículo" valor={jornada.veiculos.map((v) => `${v.placa} · ${v.modelo}`).join(', ')} />
        <Dado
          rotulo="Turno"
          valor={`${ROTULOS_TURNO[jornada.chave.turno]} · saída prevista ${formatarHorario(jornada.horario_previsto)}`}
        />
        <Dado rotulo={`Destinos (${agendadas.length})`} valor={agendadas.map((v) => v.rota.instituicao.nome).join(', ')} />
        <Dado rotulo="Passageiros" valor={`${aBuscar} para ${ida ? 'buscar' : 'levar'}`} />
      </div>
      {avisaram > 0 && (
        <p className="mt-3 text-center text-xs text-amber-700">
          {avisaram} passageiro(s) avisaram que não vão hoje e não aparecem no embarque.
        </p>
      )}
    </Modal>
  )
}

/** "Viagem concluída": resumo final da jornada. */
export function ModalJornadaConcluida({ jornada, aoFechar }: { jornada: Jornada; aoFechar: () => void }) {
  const duracao = duracaoDaViagem(jornada)
  const ativas = jornada.viagens.filter((v) => v.status !== 'cancelada')
  return (
    <Modal
      titulo="Viagem concluída!"
      descricao={`${jornada.sentido === 'ida' ? 'Ida' : 'Volta'} da ${ROTULOS_TURNO[jornada.turno].toLowerCase()} · ${jornada.motorista.nome}`}
      icone="ok"
      tom="verde"
      aoFechar={aoFechar}
      acoes={<Botao onClick={aoFechar}>Fechar</Botao>}
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { rotulo: 'Embarcaram', valor: jornada.passageiros.presente, cor: 'text-emerald-600' },
          { rotulo: 'Não embarcaram', valor: jornada.passageiros.ausente, cor: 'text-red-600' },
          { rotulo: 'Avisaram antes', valor: jornada.passageiros.nao_vai, cor: 'text-amber-600' },
        ].map((item) => (
          <div key={item.rotulo} className="rounded-xl bg-fundo/60 py-3">
            <p className={`text-2xl font-extrabold tabular-nums ${item.cor}`}>{item.valor}</p>
            <p className="text-xs text-slate-500">{item.rotulo}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 divide-y divide-slate-100 rounded-xl bg-fundo/60 px-4 py-1">
        <Dado rotulo="Saída" valor={formatarHoraDe(jornada.horario_saida)} />
        <Dado rotulo="Chegada" valor={formatarHoraDe(jornada.horario_chegada)} />
        {duracao && <Dado rotulo="Duração" valor={duracao} />}
        <Dado rotulo={`Destinos (${ativas.length})`} valor={ativas.map((v) => v.rota.instituicao.nome).join(', ')} />
      </div>
    </Modal>
  )
}

/** Confirmação para encerrar antes de registrar todo mundo. */
export function ModalEncerrarAntes({
  pendentes,
  aBordo = 0,
  aoConfirmar,
  aoFechar,
}: {
  pendentes: number
  aBordo?: number
  aoConfirmar: () => void
  aoFechar: () => void
}) {
  const partes = [
    pendentes > 0 && `${pendentes} passageiro(s) ainda na fila ficarão como "não embarcou"`,
    aBordo > 0 && `${aBordo} a bordo serão dados como desembarcados agora`,
  ].filter(Boolean)
  return (
    <Modal
      titulo="Encerrar a viagem agora?"
      descricao={partes.length ? `${partes.join(' e ')}.` : 'A viagem será concluída.'}
      icone="alerta"
      tom="vermelho"
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Continuar a viagem
          </Botao>
          <Botao variante="perigo" onClick={aoConfirmar}>
            Encerrar mesmo assim
          </Botao>
        </>
      }
    />
  )
}

const MOTIVOS_EMERGENCIA = ['Pneu furou', 'Problema mecânico', 'Troca de motorista', 'Acidente', 'Passageiro passou mal', 'Outro']

/**
 * Emergência do motorista: encerra a viagem antes da hora e guarda o motivo (pneu furou, troca de
 * motorista...). Fica escondido atrás do botão de aviso: no dia a dia a viagem conclui sozinha.
 */
export function ModalEmergencia({
  pendentes,
  aBordo = 0,
  aoConfirmar,
  aoFechar,
}: {
  pendentes: number
  aBordo?: number
  aoConfirmar: (motivo: string) => void
  aoFechar: () => void
}) {
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [outro, setOutro] = useState('')
  const motivo = escolhido === 'Outro' ? outro.trim() : escolhido
  const partes = [
    pendentes > 0 && `${pendentes} ainda na fila ficam como "não embarcou"`,
    aBordo > 0 && `${aBordo} a bordo contam como desembarcados agora`,
  ].filter(Boolean)
  return (
    <Modal
      titulo="Emergência: encerrar a viagem?"
      descricao={`Use só se não der para continuar.${partes.length ? ` ${partes.join(' e ')}.` : ''}`}
      icone="alerta"
      tom="vermelho"
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Continuar a viagem
          </Botao>
          <Botao variante="perigo" disabled={!motivo} onClick={() => motivo && aoConfirmar(motivo)}>
            Encerrar viagem
          </Botao>
        </>
      }
    >
      <p className="mb-2 text-xs font-bold tracking-widest text-slate-400 uppercase">O que aconteceu?</p>
      <div className="grid grid-cols-2 gap-2">
        {MOTIVOS_EMERGENCIA.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setEscolhido(m)}
            className={`rounded-xl px-3 py-3 text-sm font-bold transition-colors ${
              escolhido === m ? 'bg-red-500 text-white shadow-md' : 'bg-fundo text-marinho hover:bg-slate-200'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      {escolhido === 'Outro' && (
        <input
          autoFocus
          value={outro}
          onChange={(e) => setOutro(e.target.value)}
          maxLength={200}
          placeholder="Conte rapidamente o motivo"
          className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-red-400 focus:outline-none"
        />
      )}
    </Modal>
  )
}

const TEXTOS_INDISPONIVEL: Record<MotivoIndisponivel, { titulo: string; descricao: string }> = {
  feriado: {
    titulo: 'Dia sem aula',
    descricao: 'Este dia está marcado como feriado ou recesso para todas as instituições, então não há viagens para gerar.',
  },
  fim_de_semana: {
    titulo: 'Fim de semana',
    descricao: 'Nenhuma rota roda neste dia. As viagens são geradas só nos dias da semana em que cada rota funciona.',
  },
  sem_rotas: {
    titulo: 'Nenhuma rota neste dia',
    descricao: 'Nenhuma rota ativa está marcada para este dia da semana. Confira os dias de cada rota em Mapa e rotas, ou os feriados no Calendário.',
  },
}

/** "Dia indisponível": explica por que o dia não tem viagem para gerar. */
export function ModalDiaIndisponivel({
  motivo,
  dataPorExtenso,
  detalhes,
  aoFechar,
}: {
  motivo: MotivoIndisponivel
  /** "Sábado, 21/11/2026" */
  dataPorExtenso: string
  /** Feriados do dia ou outros avisos da geração. */
  detalhes: string[]
  aoFechar: () => void
}) {
  const texto = TEXTOS_INDISPONIVEL[motivo]
  return (
    <Modal
      titulo={texto.titulo}
      descricao={`${dataPorExtenso} não está disponível para gerar viagens.`}
      icone={motivo === 'feriado' ? 'viagem' : 'alerta'}
      tom={motivo === 'feriado' ? 'vermelho' : 'marinho'}
      aoFechar={aoFechar}
      acoes={<Botao onClick={aoFechar}>Entendi</Botao>}
    >
      <p className="text-center text-sm text-slate-600">{texto.descricao}</p>
      {detalhes.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl bg-fundo/60 px-4 py-3 text-sm text-marinho">
          {detalhes.map((d) => (
            <li key={d}>• {d}</li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

/** Prévia da chamada formatada antes de abrir o grupo do WhatsApp ou copiar o texto. */
export function ModalCompartilharWhatsApp({
  mensagem,
  aoFechar,
}: {
  mensagem: string
  aoFechar: () => void
}) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    await navigator.clipboard.writeText(mensagem)
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 2500)
  }

  return (
    <Modal
      titulo="Chamada para o WhatsApp"
      descricao="Confira a mensagem gerada abaixo. Ao abrir o WhatsApp, basta escolher o grupo da van e enviar."
      icone="compartilhar"
      tom="verde"
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Fechar
          </Botao>
          <Botao variante="secundario" onClick={() => void copiar()}>
            {copiado ? 'Texto copiado!' : 'Copiar texto'}
          </Botao>
          <Botao
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => abrirWhatsAppComMensagem(mensagem)}
          >
            Abrir WhatsApp
          </Botao>
        </>
      }
    >
      <pre className="max-h-72 overflow-y-auto rounded-xl bg-fundo/80 p-4 font-sans text-xs leading-relaxed whitespace-pre-wrap text-marinho ring-1 ring-slate-200/80">
        {mensagem}
      </pre>
    </Modal>
  )
}