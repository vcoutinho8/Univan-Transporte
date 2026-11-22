import { useState, type FormEvent } from 'react'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Gaveta from '../../shared/components/Drawer.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { ErroApi } from '../../shared/services/api.ts'
import { formatarData } from '../../shared/utils/formatar.ts'
import { servicoInstituicao } from '../instituicao/institutionService.ts'
import { diasNoPeriodo } from './calendario.ts'
import type { DadosPeriodoSemAula } from './types.ts'

const SUGESTOES = ['Férias acadêmicas', 'Recesso', 'Feriado', 'Semana acadêmica', 'Ponto facultativo']

interface Propriedades {
  inicio: string
  fim: string
  aoSalvar: (dados: DadosPeriodoSemAula) => Promise<void>
  aoCancelar: () => void
}

/** Formulário do dia ou período sem aula: datas, quem fica sem aula e o motivo. */
export default function FormularioDiaSemAula({ inicio, fim, aoSalvar, aoCancelar }: Propriedades) {
  const instituicoes = useRequisicao(() => servicoInstituicao.listar())
  const [dataInicio, setDataInicio] = useState(inicio)
  const [dataFim, setDataFim] = useState(fim)
  // Vazio = todas as instituições.
  const [selecionadas, setSelecionadas] = useState<number[]>([])
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const valido = dataInicio && dataFim && dataFim >= dataInicio && motivo.trim()
  const dias = dataInicio && dataFim && dataFim >= dataInicio ? diasNoPeriodo(dataInicio, dataFim) : 0

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setSalvando(true)
    setErro(null)
    try {
      await aoSalvar({ data_inicio: dataInicio, data_fim: dataFim, fk_instituicoes: selecionadas, motivo })
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Gaveta
      titulo={dias > 1 ? 'Período sem aula' : 'Dia sem aula'}
      descricao="Nesses dias o sistema não gera viagens para quem ficar sem aula."
      aoFechar={aoCancelar}
      largura="max-w-md"
    >
      <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          {erro && <Alerta mensagem={erro} />}

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-semibold text-marinho">
              De
              <input type="date" required value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="campo" />
            </label>
            <label className="text-sm font-semibold text-marinho">
              Até
              <input type="date" required value={dataFim} min={dataInicio} onChange={(e) => setDataFim(e.target.value)} className="campo" />
            </label>
            <p className="col-span-2 -mt-1 text-xs text-slate-500">
              {dias > 0
                ? dias === 1
                  ? `Um dia: ${formatarData(dataInicio)}.`
                  : `${dias} dias: de ${formatarData(dataInicio)} a ${formatarData(dataFim)}.`
                : 'A data final não pode ser anterior à inicial.'}
            </p>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-marinho">Quem fica sem aula</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={selecionadas.length === 0}
                onClick={() => setSelecionadas([])}
                className={`rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
                  selecionadas.length === 0 ? 'bg-marinho text-white shadow-sm' : 'bg-fundo text-slate-600 hover:text-marinho'
                }`}
              >
                Todas as instituições
              </button>
              {instituicoes.dados?.map((i) => {
                const marcada = selecionadas.includes(i.id)
                return (
                  <button
                    key={i.id}
                    type="button"
                    aria-pressed={marcada}
                    onClick={() =>
                      setSelecionadas((atual) => (marcada ? atual.filter((x) => x !== i.id) : [...atual, i.id]))
                    }
                    className={`rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
                      marcada ? 'bg-laranja text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-marinho'
                    }`}
                  >
                    {marcada && '✓ '}
                    {i.nome}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {selecionadas.length === 0
                ? 'Feriado geral: nenhuma faculdade tem aula.'
                : `Só ${selecionadas.length} faculdade(s) ficam sem aula; as outras seguem normais.`}
            </p>
          </fieldset>

          <div>
            <label className="block text-sm font-semibold text-marinho">
              Motivo
              <input
                required
                maxLength={100}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: Férias acadêmicas"
                className="campo"
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setMotivo(s)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    motivo === s ? 'bg-marinho text-white' : 'bg-fundo text-slate-600 hover:text-marinho'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <Botao type="button" variante="secundario" onClick={aoCancelar}>
            Cancelar
          </Botao>
          <Botao type="submit" disabled={salvando || !valido}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </Botao>
        </footer>
      </form>
    </Gaveta>
  )
}
