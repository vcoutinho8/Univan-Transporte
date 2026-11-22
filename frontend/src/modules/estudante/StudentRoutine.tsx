import Botao from '../../shared/components/Button.tsx'
import Icone, { type NomeIcone } from '../../shared/components/Icon.tsx'
import Modal from '../../shared/components/Modal.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { formatarCelular, formatarCep, formatarHorario } from '../../shared/utils/formatar.ts'
import { servicoRota } from '../rota/routeService.ts'
import { ROTULOS_TURNO, type Estudante } from './types.ts'

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function Linha({ icone, rotulo, children }: { icone: NomeIcone; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-laranja/10 text-laranja">
        <Icone nome={icone} className="h-4 w-4" />
      </span>
      <div className="min-w-0 text-sm">
        <p className="text-xs font-bold tracking-wide text-slate-400 uppercase">{rotulo}</p>
        <div className="text-marinho">{children}</div>
      </div>
    </div>
  )
}

/**
 * Rotina do passageiro (clique na lista): em que dias e horários a van passa, com qual motorista,
 * para qual faculdade, e onde ele embarca. A rota é a do motorista da área + faculdade + turno
 * (a mesma regra que gera as viagens).
 */
export default function RotinaPassageiro({
  estudante,
  motoristaDaArea,
  aoEditar,
  aoFechar,
}: {
  estudante: Estudante
  /** Motorista dono da área do passageiro (sem área, sem rota). */
  motoristaDaArea: number | null
  aoEditar?: () => void
  aoFechar: () => void
}) {
  const rotas = useRequisicao(() => servicoRota.listar({ status: 'ativo' }), [])
  const rota = (rotas.dados ?? []).find(
    (r) => r.fk_motorista === motoristaDaArea && r.fk_instituicao === estudante.instituicao.id && r.turno === estudante.turno,
  )
  const e = estudante.endereco

  return (
    <Modal
      titulo={estudante.apelido ? `${estudante.nome} ("${estudante.apelido}")` : estudante.nome}
      descricao={`${estudante.instituicao.nome} · ${ROTULOS_TURNO[estudante.turno]}`}
      icone="passageiros"
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Fechar
          </Botao>
          {aoEditar && (
            <Botao onClick={aoEditar}>
              <Icone nome="editar" className="h-4 w-4" />
              Editar
            </Botao>
          )}
        </>
      }
    >
      {/* Semana: dias da rota em destaque */}
      <div className="grid grid-cols-7 gap-1">
        {DIAS.map((d, i) => {
          const vai = rota?.dias.includes(i + 1)
          return (
            <span key={d} className={`rounded-lg py-2 text-center text-xs font-bold ${vai ? 'bg-marinho text-white' : 'bg-fundo text-slate-300'}`}>
              {d}
            </span>
          )
        })}
      </div>
      <div className="mt-2 divide-y divide-slate-100">
        <Linha icone="van" rotulo="Rota">
          {rotas.carregando ? (
            <span className="text-slate-400">Carregando...</span>
          ) : rota ? (
            <>
              <p className="font-semibold">{rota.nome}</p>
              <p className="text-xs text-slate-500">Motorista {rota.motorista.nome}</p>
            </>
          ) : (
            <p className="text-amber-700">{motoristaDaArea ? 'Nenhuma rota ativa para esta faculdade e turno.' : 'Sem área: ainda não entra em nenhuma rota.'}</p>
          )}
        </Linha>
        <Linha icone="relogio" rotulo="Horários">
          <p>
            Embarque às <strong>{formatarHorario(estudante.horario_embarque)}</strong>
            {rota && (
              <>
                {' '}
                · ida {formatarHorario(rota.horario_ida)} · volta {formatarHorario(rota.horario_volta)}
              </>
            )}
          </p>
        </Linha>
        <Linha icone="escola" rotulo="Faculdade">
          <p>
            {estudante.instituicao.nome}
            {estudante.parada && <span className="text-slate-500"> · desce em {estudante.parada.nome}</span>}
          </p>
          {estudante.curso && <p className="text-xs text-slate-500">{estudante.curso}</p>}
        </Linha>
        <Linha icone="pino" rotulo="Embarca em">
          <p>
            {e.logradouro}, {e.numero ?? 'S/N'}
            {e.complemento ? ` · ${e.complemento}` : ''}
          </p>
          <p className="text-xs text-slate-500">
            {e.bairro} · {e.cidade}/{e.estado} · {formatarCep(e.cep)}
          </p>
        </Linha>
        <Linha icone="usuario" rotulo="Contato">
          <a href={`https://wa.me/55${estudante.celular}`} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">
            {formatarCelular(estudante.celular)} (WhatsApp)
          </a>
        </Linha>
      </div>
    </Modal>
  )
}
