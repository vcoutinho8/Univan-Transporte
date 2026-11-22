import Alerta from '../../shared/components/Alert.tsx'
import EstadoVazio from '../../shared/components/EmptyState.tsx'
import Gaveta from '../../shared/components/Drawer.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { formatarCelular, formatarHoraDe, formatarHorario, nomeCurto } from '../../shared/utils/formatar.ts'
import { servicoViagem } from './tripService.ts'
import { ROTULOS_STATUS_CHAMADA, type Chamada, type StatusChamada, type Viagem } from './types.ts'

export const CORES_CHAMADA: Record<StatusChamada, string> = {
  pendente: 'bg-slate-100 text-slate-600',
  presente: 'bg-emerald-100 text-emerald-700',
  ausente: 'bg-red-100 text-red-700',
  nao_vai: 'bg-amber-100 text-amber-700',
}

function detalheDaChamada(chamada: Chamada): string {
  if (chamada.status === 'presente')
    return `Embarcou às ${formatarHoraDe(chamada.horario_embarque)}${
      chamada.horario_desembarque ? ` · desceu às ${formatarHoraDe(chamada.horario_desembarque)}` : ' · a bordo'
    }`
  if (chamada.status === 'nao_vai' && chamada.horario_aviso) return `Avisou às ${formatarHoraDe(chamada.horario_aviso)}`
  return `Previsto ${formatarHorario(chamada.horario_previsto)}`
}

/** Gaveta com os passageiros esperados na viagem, na ordem de embarque, e a situação de cada um. */
export default function GavetaPassageirosViagem({ viagem, aoFechar }: { viagem: Viagem; aoFechar: () => void }) {
  const detalhe = useRequisicao(() => servicoViagem.obter(viagem.id), [viagem.id])
  const chamadas = detalhe.dados?.chamadas ?? []

  return (
    <Gaveta
      titulo={`${viagem.rota.nome} · ${viagem.sentido === 'ida' ? 'Ida' : 'Volta'}`}
      descricao={`${viagem.motorista.nome} · ${viagem.veiculo.placa} (${viagem.veiculo.capacidade} lugares)`}
      aoFechar={aoFechar}
    >
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {detalhe.erro && <Alerta mensagem={detalhe.erro} />}
        {detalhe.carregando && <p className="py-8 text-center text-sm text-slate-500">Carregando...</p>}
        {!detalhe.carregando && !detalhe.erro && chamadas.length === 0 && (
          <EstadoVazio icone="passageiros" titulo="Nenhum passageiro nesta viagem" descricao="Ninguém da rota está ativo para este dia." compacto />
        )}
        <ol className="space-y-2">
          {chamadas.map((chamada, indice) => (
            <li
              key={chamada.estudante.id}
              className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-fundo text-xs font-bold text-marinho">
                {indice + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-marinho" title={chamada.estudante.nome}>
                  {nomeCurto(chamada.estudante.nome, chamada.estudante.apelido)}
                  <span className="ml-2 font-normal text-slate-400">{formatarCelular(chamada.estudante.celular)}</span>
                </p>
                <p className="text-xs text-slate-500">{detalheDaChamada(chamada)}</p>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${CORES_CHAMADA[chamada.status]}`}>
                {ROTULOS_STATUS_CHAMADA[chamada.status]}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Gaveta>
  )
}
