import { useState, type FormEvent } from 'react'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Gaveta from '../../shared/components/Drawer.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { ErroApi } from '../../shared/services/api.ts'
import { servicoMotorista } from '../motorista/driverService.ts'
import { servicoVeiculo } from '../veiculo/vehicleService.ts'
import type { Viagem } from './types.ts'

interface Propriedades {
  viagem: Viagem
  aoSalvar: (dados: { fk_motorista?: number; fk_veiculo?: number }) => Promise<void>
  aoCancelar: () => void
}

/**
 * Troca de motorista e/ou veículo só nesta viagem (folga, van na oficina...). Os cadastros da
 * rota e do motorista não mudam: a próxima viagem gerada volta ao padrão.
 */
export default function FormularioSubstituicao({ viagem, aoSalvar, aoCancelar }: Propriedades) {
  const motoristas = useRequisicao(() => servicoMotorista.listar({ status: 'ativo' }))
  const veiculos = useRequisicao(() => servicoVeiculo.listar({ status: 'ativo' }))
  const [motorista, setMotorista] = useState(viagem.motorista.id)
  const [veiculo, setVeiculo] = useState(viagem.veiculo.id)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const confirmados = viagem.passageiros.total - viagem.passageiros.nao_vai
  const mudou = motorista !== viagem.motorista.id || veiculo !== viagem.veiculo.id

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setSalvando(true)
    setErro(null)
    try {
      await aoSalvar({
        ...(motorista !== viagem.motorista.id && { fk_motorista: motorista }),
        ...(veiculo !== viagem.veiculo.id && { fk_veiculo: veiculo }),
      })
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Gaveta
      titulo="Trocar motorista ou veículo"
      descricao={`${viagem.rota.nome} · ${viagem.sentido === 'ida' ? 'ida' : 'volta'}. Vale só para esta viagem.`}
      aoFechar={aoCancelar}
      largura="max-w-md"
    >
      <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {(erro || motoristas.erro || veiculos.erro) && <Alerta mensagem={erro ?? motoristas.erro ?? veiculos.erro ?? ''} />}

          <label className="block text-sm font-semibold text-marinho">
            Motorista
            <select value={motorista} onChange={(e) => setMotorista(Number(e.target.value))} className="campo">
              {/* O atual fica na lista mesmo que a busca ainda não tenha voltado. */}
              {!motoristas.dados?.some((m) => m.id === viagem.motorista.id) && (
                <option value={viagem.motorista.id}>{viagem.motorista.nome}</option>
              )}
              {motoristas.dados?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-semibold text-marinho">
            Veículo
            <select value={veiculo} onChange={(e) => setVeiculo(Number(e.target.value))} className="campo">
              {!veiculos.dados?.some((v) => v.id === viagem.veiculo.id) && (
                <option value={viagem.veiculo.id}>
                  {viagem.veiculo.placa} · {viagem.veiculo.modelo}
                </option>
              )}
              {veiculos.dados?.map((v) => (
                <option key={v.id} value={v.id} disabled={v.capacidade < confirmados}>
                  {v.placa} · {v.modelo} ({v.capacidade} lugares)
                  {v.capacidade < confirmados ? ' — pequeno demais' : ''}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-500">
              {confirmados} passageiro(s) confirmado(s) nesta viagem.
            </span>
          </label>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <Botao type="button" variante="secundario" onClick={aoCancelar}>
            Cancelar
          </Botao>
          <Botao type="submit" disabled={salvando || !mudou}>
            {salvando ? 'Salvando...' : 'Salvar troca'}
          </Botao>
        </footer>
      </form>
    </Gaveta>
  )
}
