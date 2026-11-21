import { useState } from 'react'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Modal from '../../shared/components/Modal.tsx'
import { ErroApi } from '../../shared/services/api.ts'
import { formatarHoraDe, formatarHorario } from '../../shared/utils/formatar.ts'
import { ROTULOS_TURNO } from '../estudante/types.ts'
import { duracaoDaViagem } from './tripFlow.ts'
import type { ResumoJornada } from './tripGrouping.ts'
import type { Jornada } from './types.ts'

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
