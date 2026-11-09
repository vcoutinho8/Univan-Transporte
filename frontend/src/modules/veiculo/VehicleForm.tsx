import { useState, type FormEvent } from 'react'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Cartao from '../../shared/components/Card.tsx'
import { ErroApi } from '../../shared/services/api.ts'
import type { Empresa } from '../empresa/types.ts'
import type { DadosVeiculo, Veiculo } from './types.ts'

interface Propriedades {
  empresas: Empresa[]
  /** Se informado, o formulário abre preenchido para edição. */
  veiculo?: Veiculo | null
  aoSalvar: (dados: DadosVeiculo) => Promise<void>
  aoCancelar: () => void
}

/** Formulário de cadastro e edição de veículo. Erros da API aparecem no topo do formulário. */
export default function FormularioVeiculo({ empresas, veiculo, aoSalvar, aoCancelar }: Propriedades) {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const formulario = new FormData(evento.currentTarget)
    setSalvando(true)
    setErro(null)
    try {
      await aoSalvar({
        fk_empresa: Number(formulario.get('fk_empresa')),
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
    <Cartao titulo={veiculo ? `Editar veículo ${veiculo.placa}` : 'Novo veículo'} className="mb-6">
      {/* `key` recria o formulário ao trocar de veículo, renovando os valores iniciais. */}
      <form key={veiculo?.id ?? 'novo'} onSubmit={enviar} className="space-y-4">
        {erro && <Alerta mensagem={erro} />}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-semibold text-marinho">
            Empresa
            <select name="fk_empresa" required className="campo" defaultValue={veiculo?.fk_empresa ?? ''}>
              <option value="" disabled>
                Selecione...
              </option>
              {empresas.map((empresa) => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.nome_fantasia ?? empresa.razao_social}
                </option>
              ))}
            </select>
          </label>
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
            Cor
            <input name="cor" maxLength={30} placeholder="Branca" defaultValue={veiculo?.cor ?? ''} className="campo" />
          </label>
          <label className="text-sm font-semibold text-marinho">
            Capacidade (lugares)
            <input
              name="capacidade"
              type="number"
              required
              min={1}
              defaultValue={veiculo?.capacidade}
              className="campo"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={aoCancelar}>
            Cancelar
          </Botao>
          <Botao type="submit" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </Botao>
        </div>
      </form>
    </Cartao>
  )
}
