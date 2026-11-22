import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { pode } from '../../shared/auth/permissoes.ts'
import { combinaBusca } from '../../shared/utils/busca.ts'
import { useSessao } from '../../shared/auth/useSessao.ts'
import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import AvisoSemResultado from '../../shared/components/NoResults.tsx'
import Cartao from '../../shared/components/Card.tsx'
import Icone from '../../shared/components/Icon.tsx'
import CabecalhoPagina from '../../shared/components/PageHeader.tsx'
import RodapePaginacao from '../../shared/components/Pagination.tsx'
import EtiquetaStatus from '../../shared/components/StatusBadge.tsx'
import { usePaginacao } from '../../shared/hooks/usePagination.ts'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { ErroApi } from '../../shared/services/api.ts'
import type { StatusCadastro } from '../../shared/types/api.ts'
import { formatarCelular, formatarCpf, formatarHorario, iniciais } from '../../shared/utils/formatar.ts'
import { servicoArea } from '../area/areaService.ts'
import { servicoInstituicao } from '../instituicao/institutionService.ts'
import { corDoMotorista } from '../mapa/mapUtils.ts'
import FormularioEstudante from './StudentForm.tsx'
import RotinaPassageiro from './StudentRoutine.tsx'
import { servicoEstudante } from './studentService.ts'
import { ROTULOS_TURNO, type DadosEstudante, type Estudante, type Turno } from './types.ts'

type Aviso = { mensagem: string; tipo: 'erro' | 'aviso' | 'sucesso' }
type EstadoFormulario = { modo: 'fechado' } | { modo: 'novo' } | { modo: 'editar'; estudante: Estudante }

/** Valor do filtro de área: uma área, os sem área ou todas. */
const SEM_AREA = 'sem-area'

/** Tela de passageiros (RF2): lista com busca e filtros, cadastro, edição, inativação e reativação. */
export default function PaginaEstudantes() {
  // Editar, inativar e reativar: só o administrador (o auxiliar consulta e cadastra).
  const podeEditar = pode(useSessao().usuario?.perfil, 'cadastro.editar')
  const [parametros, setParametros] = useSearchParams()
  const [filtroStatus, setFiltroStatus] = useState<StatusCadastro | ''>('ativo')
  const [filtroTurno, setFiltroTurno] = useState<Turno | ''>('')
  const [filtroArea, setFiltroArea] = useState('')
  const [busca, setBusca] = useState('')
  // Clique na linha: a rotina do passageiro (dias, horários, rota e motorista).
  const [rotina, setRotina] = useState<Estudante | null>(null)
  // ?novo=1 (atalho do painel) já abre o formulário de cadastro.
  const [formulario, setFormulario] = useState<EstadoFormulario>(() =>
    parametros.get('novo') ? { modo: 'novo' } : { modo: 'fechado' },
  )
  const [aviso, setAviso] = useState<Aviso | null>(null)

  const estudantes = useRequisicao(() => servicoEstudante.listar({ status: filtroStatus }), [filtroStatus])
  const instituicoes = useRequisicao(() => servicoInstituicao.listar())
  const areas = useRequisicao(() => servicoArea.listar({ status: 'ativo' }))

  const filtrados = useMemo(() => {
    return (estudantes.dados ?? []).filter((e) => {
      if (filtroTurno && e.turno !== filtroTurno) return false
      if (filtroArea === SEM_AREA && e.fk_area !== null) return false
      if (filtroArea && filtroArea !== SEM_AREA && e.fk_area !== Number(filtroArea)) return false
      return combinaBusca([e.nome, e.apelido, e.cpf, e.celular, e.curso, e.instituicao.nome, e.endereco.bairro, e.endereco.cidade, e.area?.nome], busca)
    })
  }, [estudantes.dados, busca, filtroTurno, filtroArea])

  const paginacao = usePaginacao(filtrados, `${busca}|${filtroTurno}|${filtroArea}|${filtroStatus}`)
  const areaPorId = useMemo(() => new Map((areas.dados ?? []).map((a) => [a.id, a])), [areas.dados])

  // Filtros ativos, em texto, para o aviso de "nenhum passageiro" (o padrão "Ativos" não conta).
  const filtrosAtivos = [
    busca.trim() && `Busca: "${busca.trim()}"`,
    filtroTurno && `Turno: ${ROTULOS_TURNO[filtroTurno]}`,
    filtroArea === SEM_AREA ? 'Sem área' : filtroArea && `Bairro: ${areaPorId.get(Number(filtroArea))?.nome ?? ''}`,
    filtroStatus !== 'ativo' && `Situação: ${filtroStatus === 'inativo' ? 'Inativos' : 'Todos'}`,
  ].filter((f): f is string => Boolean(f))

  function limparFiltros() {
    setBusca('')
    setFiltroTurno('')
    setFiltroArea('')
    setFiltroStatus('ativo')
  }

  function fecharFormulario() {
    setFormulario({ modo: 'fechado' })
    if (parametros.get('novo')) setParametros({}, { replace: true })
  }

  async function salvar(dados: DadosEstudante) {
    const salvo =
      formulario.modo === 'editar'
        ? await servicoEstudante.atualizar(formulario.estudante.id, dados)
        : await servicoEstudante.cadastrar(dados)
    const ondeFicou = salvo.area ? `na área ${salvo.area.nome}` : 'fora das áreas atendidas'
    setAviso({
      mensagem: `${salvo.nome} ${formulario.modo === 'editar' ? 'atualizado(a)' : 'cadastrado(a)'} ${ondeFicou}.`,
      tipo: salvo.area ? 'sucesso' : 'aviso',
    })
    fecharFormulario()
    await estudantes.recarregar()
  }

  async function executar(acao: () => Promise<Estudante>, mensagemSucesso: string) {
    try {
      await acao()
      setAviso({ mensagem: mensagemSucesso, tipo: 'sucesso' })
      await estudantes.recarregar()
    } catch (e) {
      setAviso({ mensagem: e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado.', tipo: 'erro' })
    }
  }

  function inativar(estudante: Estudante) {
    if (!window.confirm(`Inativar ${estudante.nome}? O histórico será mantido.`)) return
    void executar(() => servicoEstudante.inativar(estudante.id), `${estudante.nome} inativado(a).`)
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Passageiros"
        descricao="Estudantes atendidos, onde moram e em qual área de motorista cada um está."
        acoes={
          <Botao onClick={() => setFormulario({ modo: 'novo' })}>
            <Icone nome="mais" className="h-4 w-4" />
            Novo passageiro
          </Botao>
        }
      />

      {aviso && (
        <div className="mb-4 animate-surgir">
          <Alerta mensagem={aviso.mensagem} tipo={aviso.tipo} aoFechar={() => setAviso(null)} />
        </div>
      )}

      {rotina && (
        <RotinaPassageiro
          estudante={rotina}
          motoristaDaArea={rotina.fk_area ? (areaPorId.get(rotina.fk_area)?.fk_motorista ?? null) : null}
          aoFechar={() => setRotina(null)}
          aoEditar={
            podeEditar
              ? () => {
                  setFormulario({ modo: 'editar', estudante: rotina })
                  setRotina(null)
                }
              : undefined
          }
        />
      )}
      {formulario.modo !== 'fechado' && (
        <FormularioEstudante
          estudante={formulario.modo === 'editar' ? formulario.estudante : null}
          instituicoes={instituicoes.dados ?? []}
          areas={areas.dados ?? []}
          aoSalvar={salvar}
          aoFechar={fecharFormulario}
        />
      )}

      <Cartao
        semEspaco
        preencherTela
        acoes={
          <div className="flex w-full flex-wrap items-center gap-3">
            <label className="relative min-w-56 flex-1">
              <span className="sr-only">Buscar passageiro</span>
              <Icone nome="busca" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, CPF, curso, instituição ou bairro"
                className="campo mt-0 rounded-full bg-fundo pl-9"
              />
            </label>
            <select aria-label="Turno" value={filtroTurno} onChange={(e) => setFiltroTurno(e.target.value as Turno | '')} className="campo mt-0 w-auto">
              <option value="">Todos os turnos</option>
              {(Object.keys(ROTULOS_TURNO) as Turno[]).map((t) => (
                <option key={t} value={t}>
                  {ROTULOS_TURNO[t]}
                </option>
              ))}
            </select>
            <select aria-label="Área" value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)} className="campo mt-0 w-auto">
              <option value="">Todas as áreas</option>
              <option value={SEM_AREA}>Sem área</option>
              {areas.dados?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
            <select
              aria-label="Situação"
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as StatusCadastro | '')}
              className="campo mt-0 w-auto"
            >
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
              <option value="">Todos</option>
            </select>
          </div>
        }
      >
        {estudantes.erro ? (
          <div className="px-5 pb-5">
            <Alerta mensagem={estudantes.erro} />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-y border-slate-100 bg-[#f7f7f7] text-xs font-bold text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-3">Passageiro</th>
                  <th className="px-5 py-3">Instituição</th>
                  <th className="px-5 py-3">Turno</th>
                  <th className="px-5 py-3">Área</th>
                  <th className="px-5 py-3">Situação</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {estudantes.carregando &&
                  [1, 2, 3, 4].map((n) => (
                    <tr key={n}>
                      <td colSpan={6} className="px-5 py-3">
                        <div className="esqueleto h-9" />
                      </td>
                    </tr>
                  ))}
                {!estudantes.carregando && filtrados.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <AvisoSemResultado titulo="Nenhum passageiro encontrado" filtros={filtrosAtivos} aoLimpar={limparFiltros} />
                    </td>
                  </tr>
                )}
                {!estudantes.carregando &&
                  paginacao.visiveis.map((estudante, indice) => {
                    const area = estudante.fk_area ? areaPorId.get(estudante.fk_area) : undefined
                    return (
                      <tr
                        key={estudante.id}
                        onClick={() => setRotina(estudante)}
                        title="Ver a rotina"
                        className="animate-surgir cursor-pointer transition-colors hover:bg-fundo/50"
                        style={{ animationDelay: `${Math.min(indice * 30, 300)}ms` }}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-laranja/10 text-xs font-extrabold text-laranja">
                              {iniciais(estudante.nome)}
                            </span>
                            <div className="min-w-0">
                              <p className="font-bold text-marinho">
                                {estudante.nome}
                                {estudante.apelido && <span className="ml-1 font-semibold text-slate-400">"{estudante.apelido}"</span>}
                              </p>
                              <p className="text-xs whitespace-nowrap text-slate-500">
                                {formatarCpf(estudante.cpf)} · {formatarCelular(estudante.celular)}
                              </p>
                              <p className="text-xs whitespace-nowrap text-slate-400">
                                {estudante.endereco.bairro} · {estudante.endereco.cidade}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <p className="max-w-56 truncate font-semibold" title={estudante.instituicao.nome}>
                            {estudante.instituicao.nome}
                          </p>
                          <p className="text-xs text-slate-500">{estudante.curso ?? '—'}</p>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          {ROTULOS_TURNO[estudante.turno]}
                          <p className="text-xs text-slate-500">embarque {formatarHorario(estudante.horario_embarque)}</p>
                        </td>
                        <td className="px-5 py-3">
                          {estudante.area ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-fundo px-2.5 py-1 text-xs font-bold whitespace-nowrap text-marinho">
                              <span className="h-2 w-2 rounded-full" style={{ background: corDoMotorista(area?.fk_motorista) }} />
                              {estudante.area.nome}
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                              Sem área
                            </span>
                          )}
                          {area?.motorista && <p className="mt-1 text-xs whitespace-nowrap text-slate-500">{area.motorista.nome}</p>}
                        </td>
                        <td className="px-5 py-3">
                          <EtiquetaStatus status={estudante.status} />
                        </td>
                        <td className="px-5 py-3" onClick={(evento) => evento.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {estudante.endereco.latitude !== null && (
                              <Link
                                to={`/mapa?passageiro=${estudante.id}`}
                                title="Ver no mapa"
                                aria-label={`Ver ${estudante.nome} no mapa`}
                                className="rounded-lg p-2 text-marinho transition-colors hover:bg-fundo hover:text-laranja"
                              >
                                <Icone nome="pino" className="h-4 w-4" />
                              </Link>
                            )}
                            {podeEditar && (
                              <>
                                <Botao
                                  variante="fantasma"
                                  className="px-2"
                                  title="Editar"
                                  aria-label={`Editar ${estudante.nome}`}
                                  onClick={() => setFormulario({ modo: 'editar', estudante })}
                                >
                                  <Icone nome="editar" className="h-4 w-4" />
                                </Botao>
                                {estudante.status === 'ativo' ? (
                                  <Botao variante="perigo" className="px-3 py-1.5" onClick={() => inativar(estudante)}>
                                    Inativar
                                  </Botao>
                                ) : (
                                  <Botao
                                    variante="secundario"
                                    className="px-3 py-1.5"
                                    onClick={() => void executar(() => servicoEstudante.reativar(estudante.id), `${estudante.nome} reativado(a).`)}
                                  >
                                    Reativar
                                  </Botao>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
        {!estudantes.carregando && <RodapePaginacao paginacao={paginacao} rotulo="passageiro(s)" />}
      </Cartao>
    </>
  )
}
