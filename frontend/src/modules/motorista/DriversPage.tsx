import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { pode } from '../../shared/auth/permissoes.ts'
import { useAviso, useConfirmacao } from '../../shared/components/NoticeModal.tsx'
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
import { formatarCelular, formatarCpf, formatarData, iniciais } from '../../shared/utils/formatar.ts'
import { servicoVeiculo } from '../veiculo/vehicleService.ts'
import FormularioMotorista from './DriverForm.tsx'
import { servicoMotorista } from './driverService.ts'
import { diasParaVencer, situacaoCnh, type SituacaoCnh } from './driverUtils.ts'
import type { DadosMotorista, Motorista } from './types.ts'

type Aviso = { mensagem: string; tipo: 'erro' | 'aviso' | 'sucesso' }
type EstadoFormulario = { modo: 'fechado' } | { modo: 'novo' } | { modo: 'editar'; motorista: Motorista }

/** Tela de motoristas (RF2): lista com busca e filtros, cadastro, edição, inativação e reativação. */
export default function PaginaMotoristas() {
  // Editar, inativar e reativar: só o administrador (o auxiliar consulta e cadastra).
  const podeEditar = pode(useSessao().usuario?.perfil, 'cadastro.editar')
  const [parametros, setParametros] = useSearchParams()
  const [filtroStatus, setFiltroStatus] = useState<StatusCadastro | ''>('ativo')
  const [filtroCnh, setFiltroCnh] = useState<SituacaoCnh | ''>('')
  const [filtroVeiculo, setFiltroVeiculo] = useState<'' | 'com-veiculo' | 'sem-veiculo'>('')
  const [busca, setBusca] = useState('')

  // ?novo=1 (atalho vindo de links/painel) já abre o formulário de cadastro.
  const [formulario, setFormulario] = useState<EstadoFormulario>(() =>
    parametros.get('novo') ? { modo: 'novo' } : { modo: 'fechado' },
  )
  // Retorno de salvar/inativar em popup, no padrão do sistema.
  const avisos = useAviso()
  const confirmacao = useConfirmacao()
  const setAviso = (a: Aviso) =>
    avisos.mostrar({
      tipo: a.tipo,
      titulo: a.tipo === 'erro' ? 'Não foi possível concluir' : a.tipo === 'aviso' ? 'Salvo, com um alerta' : 'Pronto!',
      descricao: a.mensagem,
    })

  const motoristas = useRequisicao(() => servicoMotorista.listar({ status: filtroStatus }), [filtroStatus])
  const veiculos = useRequisicao(() => servicoVeiculo.listar({ status: 'ativo' }))

  const filtrados = useMemo(() => {
    return (motoristas.dados ?? []).filter((m) => {
      if (filtroCnh && situacaoCnh(m.cnh_validade) !== filtroCnh) return false
      if (filtroVeiculo === 'com-veiculo' && m.fk_veiculo === null) return false
      if (filtroVeiculo === 'sem-veiculo' && m.fk_veiculo !== null) return false

      return combinaBusca([m.nome, m.apelido, m.cpf, m.celular, m.cnh, m.veiculo?.placa, m.veiculo?.modelo], busca)
    })
  }, [motoristas.dados, busca, filtroCnh, filtroVeiculo])

  const paginacao = usePaginacao(filtrados, `${busca}|${filtroCnh}|${filtroVeiculo}|${filtroStatus}`)

  function fecharFormulario() {
    setFormulario({ modo: 'fechado' })
    if (parametros.get('novo')) setParametros({}, { replace: true })
  }

  async function salvar(dados: DadosMotorista) {
    const salvo =
      formulario.modo === 'editar'
        ? await servicoMotorista.atualizar(formulario.motorista.id, dados)
        : await servicoMotorista.cadastrar(dados)

    const veiculoInfo = salvo.veiculo ? `com veículo padrão ${salvo.veiculo.placa}` : 'sem veículo padrão vinculado'
    setAviso({
      mensagem: `Motorista ${salvo.nome} ${formulario.modo === 'editar' ? 'atualizado(a)' : 'cadastrado(a)'} (${veiculoInfo}).`,
      tipo: 'sucesso',
    })
    fecharFormulario()
    await motoristas.recarregar()
  }

  async function executar(acao: () => Promise<Motorista>, mensagemSucesso: string) {
    try {
      await acao()
      setAviso({ mensagem: mensagemSucesso, tipo: 'sucesso' })
      await motoristas.recarregar()
    } catch (e) {
      setAviso({ mensagem: e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado.', tipo: 'erro' })
    }
  }

  async function inativar(motorista: Motorista) {
    if (!(await confirmacao.confirmar({ titulo: `Inativar o motorista ${motorista.nome}?`, descricao: `O histórico de viagens será mantido.`, botao: 'Inativar', perigo: true }))) return
    void executar(() => servicoMotorista.inativar(motorista.id), `Motorista ${motorista.nome} inativado(a).`)
  }

  function reativar(motorista: Motorista) {
    void executar(() => servicoMotorista.reativar(motorista.id), `Motorista ${motorista.nome} reativado(a).`)
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Motoristas"
        descricao="Quem dirige as vans e micro-ônibus, com CNH, validade da habilitação e veículo padrão."
        acoes={
          <Botao onClick={() => setFormulario({ modo: 'novo' })}>
            <Icone nome="mais" className="h-4 w-4" />
            Novo motorista
          </Botao>
        }
      />

      {avisos.modal}
      {confirmacao.modal}

      {formulario.modo !== 'fechado' && (
        <FormularioMotorista
          motorista={formulario.modo === 'editar' ? formulario.motorista : null}
          veiculos={veiculos.dados ?? []}
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
              <span className="sr-only">Buscar motorista</span>
              <Icone
                nome="busca"
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, apelido, CPF, CNH ou placa"
                className="campo mt-0 rounded-full bg-fundo pl-9"
              />
            </label>

            <select
              aria-label="Situação da CNH"
              value={filtroCnh}
              onChange={(e) => setFiltroCnh(e.target.value as SituacaoCnh | '')}
              className="campo mt-0 w-auto"
            >
              <option value="">Todas as CNHs</option>
              <option value="valida">CNH em dia</option>
              <option value="vencendo">CNH a vencer em breve</option>
              <option value="vencida">CNH vencida</option>
            </select>

            <select
              aria-label="Veículo vinculado"
              value={filtroVeiculo}
              onChange={(e) => setFiltroVeiculo(e.target.value as '' | 'com-veiculo' | 'sem-veiculo')}
              className="campo mt-0 w-auto"
            >
              <option value="">Todos os vínculos</option>
              <option value="com-veiculo">Com veículo padrão</option>
              <option value="sem-veiculo">Sem veículo vinculado</option>
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
        {motoristas.erro ? (
          <div className="px-5 pb-5">
            <Alerta mensagem={motoristas.erro} />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-y border-slate-100 bg-[#f7f7f7] text-xs font-bold text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-3">Motorista</th>
                  <th className="px-5 py-3">Contato / CPF</th>
                  <th className="px-5 py-3">CNH / Validade</th>
                  <th className="px-5 py-3">Veículo vinculado</th>
                  <th className="px-5 py-3">Situação</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {motoristas.carregando &&
                  [1, 2, 3, 4].map((n) => (
                    <tr key={n}>
                      <td colSpan={6} className="px-5 py-3">
                        <div className="esqueleto h-9" />
                      </td>
                    </tr>
                  ))}
                {!motoristas.carregando && filtrados.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <AvisoSemResultado
                        titulo="Nenhum motorista encontrado"
                        filtros={[
                          busca.trim() && `Busca: "${busca.trim()}"`,
                          filtroCnh && `CNH: ${{ valida: 'em dia', vencendo: 'a vencer', vencida: 'vencida' }[filtroCnh]}`,
                          filtroVeiculo && (filtroVeiculo === 'com-veiculo' ? 'Com veículo' : 'Sem veículo'),
                          filtroStatus !== 'ativo' && `Situação: ${filtroStatus === 'inativo' ? 'Inativos' : 'Todos'}`,
                        ].filter((f): f is string => Boolean(f))}
                        aoLimpar={() => {
                          setBusca('')
                          setFiltroCnh('')
                          setFiltroVeiculo('')
                          setFiltroStatus('ativo')
                        }}
                      />
                    </td>
                  </tr>
                )}
                {!motoristas.carregando &&
                  paginacao.visiveis.map((motorista, indice) => {
                    const statusValidade = situacaoCnh(motorista.cnh_validade)
                    const diasRestantes = diasParaVencer(motorista.cnh_validade)

                    return (
                      <tr
                        key={motorista.id}
                        className="animate-surgir transition-colors hover:bg-fundo/50"
                        style={{ animationDelay: `${Math.min(indice * 30, 300)}ms` }}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-laranja/10 text-xs font-extrabold text-laranja">
                              {iniciais(motorista.nome)}
                            </span>
                            <div className="min-w-0">
                              <p className="font-bold text-marinho">
                                {motorista.nome}
                                {motorista.apelido && (
                                  <span className="ml-1 font-semibold text-slate-400">"{motorista.apelido}"</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-3 whitespace-nowrap">
                          <p className="font-semibold text-slate-700">{formatarCelular(motorista.celular ?? '')}</p>
                          <p className="text-xs text-slate-500">CPF: {formatarCpf(motorista.cpf)}</p>
                        </td>

                        <td className="px-5 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-800">{motorista.cnh}</span>
                            {statusValidade === 'valida' && (
                              <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                                Em dia
                              </span>
                            )}
                            {statusValidade === 'vencendo' && (
                              <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                                Vence em {diasRestantes}d
                              </span>
                            )}
                            {statusValidade === 'vencida' && (
                              <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">
                                Vencida
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">Validade: {formatarData(motorista.cnh_validade)}</p>
                        </td>

                        <td className="px-5 py-3">
                          {motorista.veiculo ? (
                            <div>
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-fundo px-2.5 py-1 text-xs font-bold whitespace-nowrap text-marinho">
                                <Icone nome="van" className="h-3.5 w-3.5 text-laranja" />
                                {motorista.veiculo.placa}
                              </span>
                              <p className="mt-0.5 text-xs text-slate-500 truncate max-w-48">
                                {motorista.veiculo.modelo} ({motorista.veiculo.capacidade} lug.)
                              </p>
                            </div>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                              Sem vínculo
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-3">
                          <EtiquetaStatus status={motorista.status} />
                        </td>

                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-1">
                            <Link
                              to={`/mapa?aba=rotas&motorista=${motorista.id}`}
                              title="Ver rotas"
                              aria-label={`Ver rotas de ${motorista.nome}`}
                              className="rounded-lg p-2 text-marinho transition-colors hover:bg-fundo hover:text-laranja"
                            >
                              <Icone nome="rota" className="h-4 w-4" />
                            </Link>

                            {podeEditar && (
                              <>
                                <Botao
                                  variante="fantasma"
                                  className="px-2"
                                  title="Editar"
                                  aria-label={`Editar ${motorista.nome}`}
                                  onClick={() => setFormulario({ modo: 'editar', motorista })}
                                >
                                  <Icone nome="editar" className="h-4 w-4" />
                                </Botao>

                                {motorista.status === 'ativo' ? (
                                  <Botao
                                    variante="perigo"
                                    className="px-3 py-1.5"
                                    onClick={() => inativar(motorista)}
                                  >
                                    Inativar
                                  </Botao>
                                ) : (
                                  <Botao
                                    variante="secundario"
                                    className="px-3 py-1.5"
                                    onClick={() => reativar(motorista)}
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
        {!motoristas.carregando && <RodapePaginacao paginacao={paginacao} rotulo="motorista(s)" />}
      </Cartao>
    </>
  )
}
