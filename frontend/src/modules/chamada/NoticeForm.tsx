import { useState } from 'react'

import Botao from '../../shared/components/Button.tsx'
import Modal from '../../shared/components/Modal.tsx'
import { formatarHorario } from '../../shared/utils/formatar.ts'
import type { Sentido } from '../viagem/types.ts'
import { podeAvisar, seriaTardio } from './callRules.ts'
import type { PassageiroDoDia } from './types.ts'

interface Propriedades {
  data: string
  passageiro: PassageiroDoDia
  aoConfirmar: (sentidos: Sentido[]) => Promise<void>
  aoFechar: () => void
}

/** Modal do aviso prévio: em quais sentidos o passageiro não vai (ida, volta ou as duas). */
export default function ModalAvisoNaoVou({ data, passageiro, aoConfirmar, aoFechar }: Propriedades) {
  const disponiveis = (['ida', 'volta'] as Sentido[]).filter((s) => podeAvisar(passageiro[s]))
  const [sentidos, setSentidos] = useState<Sentido[]>(disponiveis)
  const [salvando, setSalvando] = useState(false)

  const tardio = sentidos.some((s) => seriaTardio(data, passageiro[s]))
  const alternar = (s: Sentido) => setSentidos((atual) => (atual.includes(s) ? atual.filter((x) => x !== s) : [...atual, s]))

  async function confirmar() {
    setSalvando(true)
    try {
      await aoConfirmar(sentidos)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo={`${passageiro.estudante.apelido ?? passageiro.estudante.nome.split(' ')[0]} não vai?`}
      descricao={`${passageiro.estudante.nome} · ${passageiro.instituicao.nome}. Quem avisa sai da fila do motorista.`}
      icone="chamada"
      tom={tardio ? 'vermelho' : 'laranja'}
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao onClick={() => void confirmar()} disabled={salvando || sentidos.length === 0}>
            {salvando ? 'Salvando...' : 'Registrar aviso'}
          </Botao>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {(['ida', 'volta'] as Sentido[]).map((s) => {
          const situacao = passageiro[s]
          const habilitado = disponiveis.includes(s)
          const marcado = sentidos.includes(s)
          return (
            <button
              key={s}
              type="button"
              disabled={!habilitado}
              aria-pressed={marcado}
              onClick={() => alternar(s)}
              className={`rounded-xl border-2 px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                marcado ? 'border-laranja bg-laranja/5' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <span className="block text-sm font-bold text-marinho">
                {marcado ? '✓ ' : ''}
                {s === 'ida' ? 'Ida' : 'Volta'}
              </span>
              <span className="text-xs text-slate-500">
                {!situacao
                  ? 'Sem viagem'
                  : habilitado
                    ? `Saída ${formatarHorario(situacao.horario_previsto)}`
                    : situacao.status === 'nao_vai'
                      ? 'Já avisou'
                      : 'Já registrado'}
              </span>
            </button>
          )
        })}
      </div>
      {tardio && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          Aviso de última hora: falta menos de 1 hora para a saída. O aviso vale, mas fica marcado e o motorista pode já estar a
          caminho.
        </p>
      )}
    </Modal>
  )
}
