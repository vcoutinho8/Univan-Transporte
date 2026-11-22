import { useMemo, useState, type FormEvent, type ReactNode } from 'react'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Gaveta from '../../shared/components/Drawer.tsx'
import { ErroApi } from '../../shared/services/api.ts'
import type { Area } from '../area/types.ts'
import { ROTULOS_TURNO, type Estudante, type Turno } from '../estudante/types.ts'
import type { Instituicao } from '../instituicao/types.ts'
import { Segmentos } from '../mapa/MapWidgets.tsx'
import type { Motorista } from '../motorista/types.ts'
import { DIAS_SEMANA, type DadosRota, type Rota } from './types.ts'

interface Propriedades {
  rota: Rota | null
  /** Motorista já escolhido ao abrir (filtro da lista). */
  idMotoristaInicial?: number | null
  /** Turno já escolhido ao abrir (aba do turno na viagem do motorista). */
  turnoInicial?: Turno | null
  motoristas: Motorista[]
  instituicoes: Instituicao[]
  areas: Area[]
  estudantes: Estudante[]
  aoSalvar: (dados: DadosRota) => Promise<void>
  aoFechar: () => void
}

const HORARIOS_PADRAO: Record<Turno, [string, string]> = {
  manha: ['06:30', '12:10'],
  tarde: ['12:40', '18:00'],
  noite: ['18:00', '22:30'],
}

/** "UVV - Universidade Vila Velha" → "UVV". */
export const nomeCurtoInstituicao = (nome: string) => nome.split(' - ')[0]

/** Cadastro e edição de rota (gaveta lateral). */
export default function FormularioRota(props: Propriedades) {
  const { rota, motoristas, instituicoes, areas, estudantes, aoSalvar, aoFechar } = props
  const [motorista, setMotorista] = useState(rota ? String(rota.fk_motorista) : String(props.idMotoristaInicial ?? ''))
  const [instituicao, setInstituicao] = useState(rota ? String(rota.fk_instituicao) : '')
  const turnoInicial = rota?.turno ?? props.turnoInicial ?? 'noite'
  const [turno, setTurno] = useState<Turno>(turnoInicial)
  const [ida, setIda] = useState(rota?.horario_ida?.slice(0, 5) ?? HORARIOS_PADRAO[turnoInicial][0])
  const [volta, setVolta] = useState(rota?.horario_volta?.slice(0, 5) ?? HORARIOS_PADRAO[turnoInicial][1])
  const [dias, setDias] = useState<number[]>(rota?.dias ?? [1, 2, 3, 4, 5])
  // Enquanto o nome não for digitado à mão, ele acompanha motorista, faculdade e turno.
  const [nomeManual, setNomeManual] = useState<string | null>(rota?.nome ?? null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const bairros = areas.filter((a) => a.status === 'ativo' && a.fk_motorista === Number(motorista))
  const destino = instituicoes.find((i) => i.id === Number(instituicao))
  const nomeSugerido =
    bairros.length && destino
      ? `${bairros.map((b) => b.nome).join(' e ')} → ${nomeCurtoInstituicao(destino.nome)} (${ROTULOS_TURNO[turno].toLowerCase()})`
      : ''
  const nome = nomeManual ?? nomeSugerido

  // Prévia com a mesma regra da API: mora num bairro do motorista, mesma faculdade e turno.
  const previa = useMemo(() => {
    const ids = new Set(bairros.map((b) => b.id))
    return estudantes.filter(
      (e) => e.fk_area !== null && ids.has(e.fk_area) && e.fk_instituicao === Number(instituicao) && e.turno === turno,
    ).length
  }, [bairros, estudantes, instituicao, turno])

  function trocarTurno(novo: Turno) {
    // Horários ainda no padrão do turno anterior acompanham o novo turno.
    if (ida === HORARIOS_PADRAO[turno][0]) setIda(HORARIOS_PADRAO[novo][0])
    if (volta === HORARIOS_PADRAO[turno][1]) setVolta(HORARIOS_PADRAO[novo][1])
    setTurno(novo)
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setSalvando(true)
    setErro(null)
    try {
      await aoSalvar({
        nome,
        fk_motorista: Number(motorista),
        fk_instituicao: Number(instituicao),
        turno,
        horario_ida: ida || null,
        horario_volta: volta || null,
        dias,
      })
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Gaveta
      titulo={rota ? 'Editar rota' : 'Nova rota'}
      descricao="A rota leva quem mora nos bairros do motorista, estuda na faculdade escolhida e é do mesmo turno."
      aoFechar={aoFechar}
    >
      <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          {erro && <Alerta mensagem={erro} />}

          <Campo rotulo="Motorista">
            <select required value={motorista} onChange={(e) => setMotorista(e.target.value)} className="campo">
              <option value="" disabled>
                Selecione...
              </option>
              {motoristas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
            {motorista && (
              <span className={`mt-1 block text-xs font-normal ${bairros.length ? 'text-slate-500' : 'text-amber-700'}`}>
                {bairros.length
                  ? `Bairros: ${bairros.map((b) => b.nome).join(', ')}`
                  : 'Este motorista ainda não tem bairro. Defina na aba Bairros para a rota ter passageiros.'}
              </span>
            )}
          </Campo>

          <Campo rotulo="Faculdade (destino)">
            <select required value={instituicao} onChange={(e) => setInstituicao(e.target.value)} className="campo">
              <option value="" disabled>
                Selecione...
              </option>
              {instituicoes.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
          </Campo>

          <div>
            <p className="mb-1 text-sm font-semibold text-marinho">Turno</p>
            <Segmentos
              opcoes={(Object.keys(ROTULOS_TURNO) as Turno[]).map((t) => ({ valor: t, rotulo: ROTULOS_TURNO[t] }))}
              atual={turno}
              aoMudar={trocarTurno}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Campo rotulo="Horário de ida">
              <input type="time" value={ida} onChange={(e) => setIda(e.target.value)} className="campo" />
            </Campo>
            <Campo rotulo="Horário de volta">
              <input type="time" value={volta} onChange={(e) => setVolta(e.target.value)} className="campo" />
            </Campo>
          </div>

          <div>
            <p className="mb-1 text-sm font-semibold text-marinho">Dias da semana</p>
            <div className="flex gap-1.5">
              {DIAS_SEMANA.map((dia) => {
                const ligado = dias.includes(dia.numero)
                return (
                  <button
                    key={dia.numero}
                    type="button"
                    title={dia.nome}
                    aria-pressed={ligado}
                    onClick={() => setDias(ligado ? dias.filter((d) => d !== dia.numero) : [...dias, dia.numero].sort())}
                    className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold transition-all ${
                      ligado ? 'bg-laranja text-white shadow-sm shadow-laranja/30' : 'bg-fundo text-slate-500 hover:text-marinho'
                    }`}
                  >
                    {dia.curto}
                  </button>
                )
              })}
            </div>
          </div>

          <Campo rotulo="Nome da rota">
            <input
              required
              maxLength={100}
              value={nome}
              onChange={(e) => setNomeManual(e.target.value)}
              placeholder="Preenchido sozinho ao escolher motorista e faculdade"
              className="campo"
            />
          </Campo>

          {motorista && instituicao && (
            <p className={`rounded-xl p-3 text-sm font-semibold ${previa ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
              {previa
                ? `Esta rota vai levar ${previa} passageiro(s).`
                : 'Ninguém se encaixa nesta rota hoje (bairro do motorista + faculdade + turno).'}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <Botao type="button" variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" disabled={salvando || dias.length === 0}>
            {salvando ? 'Salvando...' : rota ? 'Salvar alterações' : 'Cadastrar rota'}
          </Botao>
        </footer>
      </form>
    </Gaveta>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-marinho">
      {rotulo}
      {children}
    </label>
  )
}
