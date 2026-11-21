import { useEffect, useState } from 'react'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Cartao from '../../shared/components/Card.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { baixarArquivo, criarPdf } from '../../shared/pdf/gerarPdf.ts'
import { ErroApi } from '../../shared/services/api.ts'
import { baixarCsv } from '../../shared/utils/csv.ts'
import { dataIso, formatarCelular, formatarCpf, formatarData, formatarHorario } from '../../shared/utils/formatar.ts'
import { PERIODOS_RAPIDOS, periodoPadrao, validarPeriodo } from '../../shared/utils/periodo.ts'
import { ROTULOS_TURNO, type Turno } from '../estudante/types.ts'
import { servicoInstituicao } from '../instituicao/institutionService.ts'
import { AGRUPAMENTOS, montarPdfEstudantes, type Agrupamento } from './activeStudentsPdf.ts'
import { servicoRelatorio } from './reportService.ts'
import type { EstudanteDoRelatorio } from './types.ts'

type Situacao = '' | 'com_bairro' | 'sem_bairro'

const SITUACOES: Record<Exclude<Situacao, ''>, { rotulo: string; aceita: (e: EstudanteDoRelatorio) => boolean }> = {
  com_bairro: { rotulo: 'Com bairro', aceita: (e) => e.area !== null },
  sem_bairro: { rotulo: 'Sem bairro', aceita: (e) => e.area === null },
}

const CABECALHO_CSV = [
  'Nome', 'CPF', 'Celular', 'E-mail', 'Instituição', 'Curso', 'Turno', 'Bairro', 'Embarque',
  'Mensalidade', 'Vencimento (dia)', 'Presenças', 'Faltas', 'Avisos',
]

/** Linha do CSV: documentos formatados e valor com vírgula, como o Excel em português espera. */
export function linhaCsv(e: EstudanteDoRelatorio): (string | number)[] {
  return [
    e.nome,
    formatarCpf(e.cpf),
    formatarCelular(e.celular),
    e.email ?? '',
    e.instituicao.nome,
    e.curso ?? '',
    ROTULOS_TURNO[e.turno],
    e.area?.nome ?? 'Sem bairro',
    e.horario_embarque ? formatarHorario(e.horario_embarque) : '',
    Number(e.valor_mensal).toFixed(2).replace('.', ','),
    e.dia_vencimento,
    e.presencas,
    e.faltas,
    e.avisos,
  ]
}

interface Filtros {
  inicio: string
  fim: string
  instituicao: number | ''
  turno: Turno | ''
  situacao: Situacao
  agrupar: Agrupamento
}

const filtrosIniciais = (): Filtros => ({
  ...periodoPadrao(),
  instituicao: '',
  turno: '',
  situacao: '',
  agrupar: 'nenhum',
})

interface Resultado {
  url: string
  arquivo: Blob
  estudantes: EstudanteDoRelatorio[]
  chave: string
  geradoEm: string
}

const chaveDe = (f: Filtros) => JSON.stringify(f)

/**
 * Relatório de passageiros ativos. A tela abre vazia, só com os filtros: o administrador escolhe
 * o que quer ver e clica em "Gerar relatório". O resultado aparece como PDF na própria tela, pronto
 * para baixar (ou exportar em CSV).
 */
export default function RelatorioEstudantesAtivos() {
  const [filtros, setFiltros] = useState<Filtros>(filtrosIniciais)
  /** Gerou, mas nenhum passageiro atende aos filtros: guarda a chave dos filtros usados. */
  const [semResultado, setSemResultado] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const instituicoes = useRequisicao(() => servicoInstituicao.listar())

  // Libera a memória do PDF anterior quando um novo é gerado ou a tela fecha.
  useEffect(() => {
    if (!resultado) return
    return () => URL.revokeObjectURL(resultado.url)
  }, [resultado])

  const alterar = <C extends keyof Filtros>(campo: C, valor: Filtros[C]) => setFiltros((f) => ({ ...f, [campo]: valor }))

  const nomeInstituicao = instituicoes.dados?.find((i) => i.id === filtros.instituicao)?.nome
  const descricaoFiltros = [
    nomeInstituicao && { rotulo: 'Instituição', valor: nomeInstituicao },
    filtros.turno && { rotulo: 'Turno', valor: ROTULOS_TURNO[filtros.turno] },
    filtros.situacao && { rotulo: 'Situação', valor: SITUACOES[filtros.situacao].rotulo },
  ].filter((f): f is { rotulo: string; valor: string } => Boolean(f))

  const erroPeriodo = validarPeriodo({ inicio: filtros.inicio, fim: filtros.fim })
  const periodoTexto = `${formatarData(filtros.inicio || dataIso())} a ${formatarData(filtros.fim || dataIso())}`

  async function gerar() {
    if (erroPeriodo) return
    setGerando(true)
    setErro(null)
    setSemResultado(null)
    try {
      const dados = await servicoRelatorio.estudantesAtivos({
        data_inicio: filtros.inicio,
        data_fim: filtros.fim,
        fk_instituicao: filtros.instituicao,
        turno: filtros.turno,
      })
      const situacao = filtros.situacao
      const estudantes = situacao ? dados.estudantes.filter(SITUACOES[situacao].aceita) : dados.estudantes
      if (estudantes.length === 0) {
        setResultado(null)
        setSemResultado(chaveDe(filtros))
        return
      }
      const agora = new Date()
      const geradoEm = `${formatarData(dataIso(agora))} às ${agora.toTimeString().slice(0, 5)}`
      const arquivo = await criarPdf(
        montarPdfEstudantes(
          estudantes,
          filtros.agrupar,
          descricaoFiltros,
          geradoEm,
          { inicio: filtros.inicio, fim: filtros.fim },
        ),
      )
      setResultado({ url: URL.createObjectURL(arquivo), arquivo, estudantes, chave: chaveDe(filtros), geradoEm })
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Não foi possível gerar o relatório. Tente de novo.')
    } finally {
      setGerando(false)
    }
  }

  const desatualizado = resultado !== null && resultado.chave !== chaveDe(filtros)
  const nomeArquivo = `passageiros-ativos-${dataIso()}`
  const campo = 'campo font-normal'

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Cartao titulo="Filtros do relatório">
        {/* Período: sempre obrigatório */}
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl bg-fundo/70 p-4">
          <label className="text-sm font-semibold text-marinho">
            De
            <input
              type="date"
              required
              value={filtros.inicio}
              max={filtros.fim || undefined}
              onChange={(e) => alterar('inicio', e.target.value)}
              className={`${campo} bg-white`}
            />
          </label>
          <label className="text-sm font-semibold text-marinho">
            Até
            <input
              type="date"
              required
              value={filtros.fim}
              min={filtros.inicio || undefined}
              onChange={(e) => alterar('fim', e.target.value)}
              className={`${campo} bg-white`}
            />
          </label>
          <div className="flex flex-wrap gap-1.5 pb-1">
            {PERIODOS_RAPIDOS.map((p) => {
              const calculado = p.calcular(new Date())
              const ativo = calculado.inicio === filtros.inicio && calculado.fim === filtros.fim
              return (
                <button
                  key={p.rotulo}
                  type="button"
                  onClick={() => setFiltros((f) => ({ ...f, ...calculado }))}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    ativo ? 'bg-marinho text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-marinho'
                  }`}
                >
                  {p.rotulo}
                </button>
              )
            })}
          </div>
          <p className={`w-full text-xs ${erroPeriodo ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
            {erroPeriodo ?? `Presenças, faltas e avisos de cada passageiro são contados de ${periodoTexto}.`}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <label className="text-sm font-semibold text-marinho xl:col-span-2">
            Instituição
            <select
              value={filtros.instituicao}
              onChange={(e) => alterar('instituicao', e.target.value ? Number(e.target.value) : '')}
              className={campo}
            >
              <option value="">Todas as instituições</option>
              {instituicoes.dados?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-marinho">
            Turno
            <select value={filtros.turno} onChange={(e) => alterar('turno', e.target.value as Turno | '')} className={campo}>
              <option value="">Todos os turnos</option>
              {(Object.keys(ROTULOS_TURNO) as Turno[]).map((t) => (
                <option key={t} value={t}>
                  {ROTULOS_TURNO[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-marinho">
            Situação
            <select value={filtros.situacao} onChange={(e) => alterar('situacao', e.target.value as Situacao)} className={campo}>
              <option value="">Com e sem bairro</option>
              {(Object.keys(SITUACOES) as Exclude<Situacao, ''>[]).map((s) => (
                <option key={s} value={s}>
                  {SITUACOES[s].rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-marinho">
            Agrupar por
            <select value={filtros.agrupar} onChange={(e) => alterar('agrupar', e.target.value as Agrupamento)} className={campo}>
              {(Object.keys(AGRUPAMENTOS) as Agrupamento[]).map((a) => (
                <option key={a} value={a}>
                  {AGRUPAMENTOS[a].rotulo}
                </option>
              ))}
            </select>
          </label>
        </div>


        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">PDF em folha A4 em pé, pronto para imprimir.</p>
          <div className="flex gap-2">
            <Botao
              variante="secundario"
              onClick={() => {
                setFiltros(filtrosIniciais())
                setSemResultado(null)
              }}
            >
              Limpar filtros
            </Botao>
            <Botao onClick={() => void gerar()} disabled={gerando || Boolean(erroPeriodo)}>
              <Icone nome="documento" className="h-4 w-4" />
              {gerando ? 'Gerando...' : resultado ? 'Gerar de novo' : 'Gerar relatório'}
            </Botao>
          </div>
        </div>
      </Cartao>

      {erro && <Alerta mensagem={erro} aoFechar={() => setErro(null)} />}

      {/* Resultado, nenhum resultado ou espaço vazio */}
      {semResultado && !resultado ? (
        <div className="grid min-h-[45vh] place-items-center rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/60 p-8 text-center">
          <div className="max-w-md">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-100 text-amber-600">
              <Icone nome="alerta" className="h-8 w-8" />
            </span>
            <h2 className="mt-4 text-lg font-extrabold text-marinho">Nenhum passageiro atende a esses filtros</h2>
            <p className="mt-2 text-sm text-slate-600">
              A combinação escolhida não trouxe resultado, então não há relatório para gerar. Tente ampliar a busca:
            </p>
            <ul className="mt-3 space-y-1 text-left text-sm text-slate-600">
              {descricaoFiltros.length > 0 && (
                <li>• Tire um dos filtros ({descricaoFiltros.map((f) => f.valor).join(', ')}).</li>
              )}
              <li>• Troque a situação para "Com e sem bairro".</li>
              <li>• Confira se a instituição tem passageiros ativos nesse turno.</li>
            </ul>
            {semResultado !== chaveDe(filtros) && (
              <p className="mt-3 text-xs font-semibold text-amber-700">Você mudou os filtros: clique em Gerar relatório de novo.</p>
            )}
          </div>
        </div>
      ) : resultado ? (
        <Cartao
          semEspaco
          titulo={`${resultado.estudantes.length} passageiro(s) · gerado em ${resultado.geradoEm}`}
          acoes={
            <div className="flex gap-2">
              <Botao
                variante="secundario"
                onClick={() => baixarCsv(`${nomeArquivo}.csv`, CABECALHO_CSV, resultado.estudantes.map(linhaCsv))}
              >
                Exportar CSV
              </Botao>
              <Botao onClick={() => baixarArquivo(resultado.arquivo, `${nomeArquivo}.pdf`)}>
                <Icone nome="baixar" className="h-4 w-4" />
                Baixar PDF
              </Botao>
            </div>
          }
        >
          {desatualizado && (
            <div className="px-5 pb-3">
              <Alerta tipo="aviso" mensagem='Você mudou os filtros depois de gerar. Clique em "Gerar de novo" para atualizar o relatório.' />
            </div>
          )}
          <iframe title="Relatório em PDF" src={resultado.url} className="h-[75vh] w-full rounded-b-2xl border-t border-slate-100" />
        </Cartao>
      ) : (
        <div className="grid min-h-[45vh] place-items-center rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 p-8 text-center">
          <div className="max-w-md">
            <span className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-laranja/10 text-laranja ${gerando ? 'animate-pulse' : ''}`}>
              <Icone nome="documento" className="h-8 w-8" />
            </span>
            <h2 className="mt-4 text-lg font-extrabold text-marinho">
              {gerando ? 'Montando seu relatório...' : 'Seu relatório aparece aqui'}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {gerando
                ? 'Buscando os passageiros e preparando o PDF. Leva só alguns segundos.'
                : `Defina o período, escolha a instituição e o turno e clique em Gerar relatório. Sem outros filtros, entram todos os passageiros ativos, com a frequência de ${periodoTexto}.`}
            </p>
            {!gerando && (
              <Botao className="mt-5" onClick={() => void gerar()} disabled={Boolean(erroPeriodo)}>
                <Icone nome="documento" className="h-4 w-4" />
                Gerar relatório
              </Botao>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
