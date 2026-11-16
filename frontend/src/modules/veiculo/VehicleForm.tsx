import { useState, type FormEvent } from 'react'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Gaveta from '../../shared/components/Drawer.tsx'
import { ErroApi } from '../../shared/services/api.ts'
import type { DadosVeiculo, Veiculo } from './types.ts'

interface Propriedades {
  /** Se informado, o formulário abre preenchido para edição. */
  veiculo?: Veiculo | null
  aoSalvar: (dados: DadosVeiculo) => Promise<void>
  aoCancelar: () => void
}

/**
 * Formulário de cadastro e edição de veículo, numa gaveta lateral. Não pede a empresa: o
 * veículo é cadastrado na empresa de quem está usando o sistema. Erros da API aparecem no topo.
 */
export default function FormularioVeiculo({ veiculo, aoSalvar, aoCancelar }: Propriedades) {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const formulario = new FormData(evento.currentTarget)
    setSalvando(true)
    setErro(null)
    try {
      await aoSalvar({
        placa: String(formulario.get('placa')),
        modelo: String(formulario.get('modelo')),
        cor: String(formulario.get('cor')) || null,
        capacidade: Number(formulario.get('capacidade')),
      })
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Gaveta
      titulo={veiculo ? `Editar veículo ${veiculo.placa}` : 'Novo veículo'}
      descricao="Van, micro-ônibus ou ônibus da frota."
      aoFechar={aoCancelar}
    >
      <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {erro && <Alerta mensagem={erro} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-marinho">
              Placa
              <input
                name="placa"
                required
                maxLength={8}
                placeholder="ABC1D23"
                defaultValue={veiculo?.placa}
                className="campo uppercase"
              />
            </label>
            <label className="text-sm font-semibold text-marinho">
              Capacidade (lugares)
              <input name="capacidade" type="number" required min={1} defaultValue={veiculo?.capacidade} className="campo" />
            </label>
            <label className="text-sm font-semibold text-marinho sm:col-span-2">
              Modelo
              <input
                name="modelo"
                required
                maxLength={50}
                placeholder="Sprinter 416"
                defaultValue={veiculo?.modelo}
                className="campo"
              />
            </label>
            <label className="text-sm font-semibold text-marinho">
              Cor <span className="text-xs font-normal text-slate-400">(opcional)</span>
              <input name="cor" maxLength={30} placeholder="Branca" defaultValue={veiculo?.cor ?? ''} className="campo" />
            </label>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <Botao type="button" variante="secundario" onClick={aoCancelar}>
            Cancelar
          </Botao>
          <Botao type="submit" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </Botao>
        </footer>
      </form>
    </Gaveta>
  )
}
