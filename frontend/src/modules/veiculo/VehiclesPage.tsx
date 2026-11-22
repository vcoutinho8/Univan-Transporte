import { useMemo, useState } from 'react'

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
import { servicoMotorista } from '../motorista/driverService.ts'
import { servicoVeiculo } from './vehicleService.ts'
import { obterHexCor, type DadosVeiculo, type Veiculo } from './types.ts'
import FormularioVeiculo from './VehicleForm.tsx'

type Aviso = { mensagem: string; tipo: 'erro' | 'sucesso' }

/** Formulário fechado, cadastro de um novo veículo ou edição de um existente. */
type EstadoFormulario = { modo: 'fechado' } | { modo: 'novo' } | { modo: 'editar'; veiculo: Veiculo }

/** Tela de veículos (RF2): lista com busca e filtro, cadastro, edição, inativação e reativação. */
export default function PaginaVeiculos() {
  // Editar, inativar e reativar: só o administrador (o auxiliar consulta e cadastra).
  const podeEditar = pode(useSessao().usuario?.perfil, 'cadastro.editar')
  const [filtroStatus, setFiltroStatus] = useState<StatusCadastro | ''>('ativo')
  const [busca, setBusca] = useState('')
  const [formulario, setFormulario] = useState<EstadoFormulario>({ modo: 'fechado' })
  // Retorno de salvar/inativar em popup, no padrão do sistema.
  const avisos = useAviso()
  const confirmacao = useConfirmacao()
  const setAviso = (a: Aviso) =>
    avisos.mostrar({
      tipo: a.tipo,
      titulo: a.tipo === 'erro' ? 'Ops, algo não deu certo' : 'Tudo certo!',
      descricao: a.mensagem,
    })

  const veiculos = useRequisicao(() => servicoVeiculo.listar({ status: filtroStatus }), [filtroStatus])
  // Quem dirige cada veículo (veículo padrão do motorista), para mostrar nas ações.
  const motoristas = useRequisicao(() => servicoMotorista.listar())
  // Um veículo pode ter mais de um motorista (o veículo padrão de cada um).
  const motoristasDoVeiculo = new Map<number, string[]>()
  for (const m of motoristas.dados ?? []) {
    if (m.fk_veiculo !== null) motoristasDoVeiculo.set(m.fk_veiculo, [...(motoristasDoVeiculo.get(m.fk_veiculo) ?? []), m.nome])
  }
  const colunas = podeEditar ? 7 : 6

  // A busca é feita na própria tela, sobre a lista já carregada.
  const veiculosFiltrados = useMemo(() => {
    return (veiculos.dados ?? []).filter((v) => combinaBusca([v.placa, v.modelo, v.cor], busca))
  }, [veiculos.dados, busca])

  const paginacao = usePaginacao(veiculosFiltrados, `${busca}|${filtroStatus}`)

  async function salvar(dados: DadosVeiculo) {
    const salvo =
      formulario.modo === 'editar'
        ? await servicoVeiculo.atualizar(formulario.veiculo.id, dados)
        : await servicoVeiculo.cadastrar(dados)
    setAviso({
      mensagem:
        formulario.modo === 'editar'
          ? `As informações do ${salvo.modelo} (${salvo.placa}) foram atualizadas.`
          : `O ${salvo.modelo} (${salvo.placa}) já faz parte da frota e pode ser vinculado a um motorista.`,
      tipo: 'sucesso',
    })
    setFormulario({ modo: 'fechado' })
    await veiculos.recarregar()
  }

  async function executar(acao: () => Promise<Veiculo>, mensagemSucesso: string) {
    try {
      await acao()
      setAviso({ mensagem: mensagemSucesso, tipo: 'sucesso' })
      await veiculos.recarregar()
    } catch (e) {
      setAviso({ mensagem: e instanceof ErroApi ? e.mensagemCompleta : 'Algo saiu diferente do esperado. Tente de novo em instantes.', tipo: 'erro' })
    }
  }

  async function inativar(veiculo: Veiculo) {
    if (!(await confirmacao.confirmar({ titulo: `Inativar o veículo ${veiculo.placa}?`, descricao: `O histórico será mantido.`, botao: 'Inativar', perigo: true }))) return
    void executar(() => servicoVeiculo.inativar(veiculo.id), `O ${veiculo.modelo} (${veiculo.placa}) saiu da frota ativa. O histórico continua guardado.`)
  }

  function reativar(veiculo: Veiculo) {
    const ultimo = filtroStatus === 'inativo' && (veiculos.dados ?? []).length <= 1
    void executar(() => servicoVeiculo.reativar(veiculo.id), `O ${veiculo.modelo} (${veiculo.placa}) voltou para a frota ativa.`).then(() => {
      if (ultimo) setFiltroStatus('ativo') // não sobrou inativo: volta para os ativos
    })
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Veículos"
        descricao="Vans, micro-ônibus e ônibus da frota."
        acoes={
          <Botao onClick={() => setFormulario({ modo: 'novo' })}>
            <Icone nome="mais" className="h-4 w-4" />
            Novo veículo
          </Botao>
        }
      />

      {avisos.modal}
      {confirmacao.modal}

      {formulario.modo !== 'fechado' && (
        <FormularioVeiculo
          veiculo={formulario.modo === 'editar' ? formulario.veiculo : null}
          aoSalvar={salvar}
          aoCancelar={() => setFormulario({ modo: 'fechado' })}
        />
      )}

      <Cartao
        semEspaco
        preencherTela
        acoes={
          <div className="flex w-full flex-wrap items-center gap-3">
            <label className="relative min-w-56 flex-1">
              <span className="sr-only">Buscar veículo</span>
              <Icone nome="busca" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por placa, modelo ou cor"
                className="campo mt-0 rounded-full bg-fundo pl-9"
              />
            </label>
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
        {veiculos.erro ? (
          <div className="px-5 pb-5">
            <Alerta mensagem={veiculos.erro} />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-y border-slate-100 bg-[#f7f7f7] text-xs font-bold text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-3">Placa</th>
                  <th className="px-5 py-3">Modelo</th>
                  <th className="px-5 py-3">Cor</th>
                  <th className="px-5 py-3 text-right">Lugares</th>
                  <th className="px-5 py-3">Situação</th>
                  <th className="px-5 py-3">Motorista vinculado</th>
                  {podeEditar && <th className="px-5 py-3 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {veiculos.carregando && (
                  <tr>
                    <td colSpan={colunas} className="px-5 py-8 text-center text-slate-500">
                      Carregando...
                    </td>
                  </tr>
                )}
                {!veiculos.carregando && veiculosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={colunas}>
                      <AvisoSemResultado
                        titulo="Nenhum veículo encontrado"
                        filtros={[
                          busca.trim() && `Busca: "${busca.trim()}"`,
                          filtroStatus !== 'ativo' && `Situação: ${filtroStatus === 'inativo' ? 'Inativos' : 'Todos'}`,
                        ].filter((f): f is string => Boolean(f))}
                        aoLimpar={() => {
                          setBusca('')
                          setFiltroStatus('ativo')
                        }}
                      />
                    </td>
                  </tr>
                )}
                {!veiculos.carregando &&
                  paginacao.visiveis.map((veiculo, indice) => {
                    const corVisual = obterHexCor(veiculo.cor)
                    return (
                      <tr
                        key={veiculo.id}
                        className="animate-surgir transition-colors hover:bg-fundo/50"
                        style={{ animationDelay: `${Math.min(indice * 30, 300)}ms` }}
                      >
                        <td className="px-5 py-3 font-mono font-bold text-marinho">{veiculo.placa}</td>
                        <td className="px-5 py-3">{veiculo.modelo}</td>
                        <td className="px-5 py-3">
                          {veiculo.cor ? (
                            <span className="inline-flex items-center gap-2">
                              {corVisual && (
                                <span
                                  className={`h-3 w-3 rounded-full ${
                                    corVisual.borda ? 'border border-slate-300' : ''
                                  }`}
                                  style={{ backgroundColor: corVisual.hex }}
                                />
                              )}
                              {veiculo.cor}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">{veiculo.capacidade}</td>
                        <td className="px-5 py-3">
                          <EtiquetaStatus status={veiculo.status} />
                        </td>
                        <td className="px-5 py-3">
                          {motoristasDoVeiculo.get(veiculo.id) ? (
                            <div className="flex flex-wrap gap-1">
                              {motoristasDoVeiculo.get(veiculo.id)!.map((nome) => (
                                <span key={nome} className="inline-flex items-center gap-1.5 rounded-full bg-fundo px-2.5 py-1 text-xs font-bold text-marinho">
                                  <Icone nome="motorista" className="h-3.5 w-3.5 shrink-0 text-laranja" />
                                  {nome}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Sem motorista</span>
                          )}
                        </td>
                        {podeEditar && (
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                              <>
                                <Botao
                                  variante="fantasma"
                                  className="px-2"
                                  aria-label={`Editar ${veiculo.placa}`}
                                  title="Editar"
                                  onClick={() => setFormulario({ modo: 'editar', veiculo })}
                                >
                                  <Icone nome="editar" className="h-4 w-4" />
                                </Botao>
                                {veiculo.status === 'ativo' ? (
                                  <Botao variante="perigo" className="px-3 py-1.5" onClick={() => inativar(veiculo)}>
                                    Inativar
                                  </Botao>
                                ) : (
                                  <Botao variante="secundario" className="px-3 py-1.5" onClick={() => reativar(veiculo)}>
                                    Reativar
                                  </Botao>
                                )}
                              </>
                          </div>
                        </td>
                        )}
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
        {!veiculos.carregando && !veiculos.erro && <RodapePaginacao paginacao={paginacao} rotulo="veículo(s)" />}
      </Cartao>
    </>
  )
}