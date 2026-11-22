import { useState, type FormEvent } from 'react'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Gaveta from '../../shared/components/Drawer.tsx'
import { ErroApi } from '../../shared/services/api.ts'
import CamposEndereco, { enderecoDoFormulario, paraApi, validarEndereco } from '../endereco/AddressFields.tsx'
import { servicoInstituicao } from '../instituicao/institutionService.ts'
import type { Instituicao } from '../instituicao/types.ts'
import { Campo } from './UserForm.tsx'

/** Nova faculdade de destino (ou alteração): nome e endereço; o pino vira o ponto de parada. */
export default function FormularioInstituicao({
  instituicao,
  aoSalvar,
  aoFechar,
}: {
  instituicao: Instituicao | null
  aoSalvar: () => void
  aoFechar: () => void
}) {
  const [nome, setNome] = useState(instituicao?.nome ?? '')
  const [endereco, setEndereco] = useState(() => enderecoDoFormulario(instituicao?.endereco))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const problema = validarEndereco(endereco)
    if (problema) return setErro(problema)
    setErro(null)
    setSalvando(true)
    try {
      const dados = { nome, endereco: paraApi(endereco) }
      if (instituicao) await servicoInstituicao.alterar(instituicao.id, dados)
      else await servicoInstituicao.criar(dados)
      aoSalvar()
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Gaveta
      titulo={instituicao ? `Editar ${instituicao.nome}` : 'Nova instituição'}
      descricao="Faculdade de destino: o pino no mapa é onde a van para."
      aoFechar={aoFechar}
      largura="max-w-xl"
    >
      <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          {erro && <Alerta mensagem={erro} />}
          <Campo rotulo="Nome">
            <input required maxLength={100} value={nome} onChange={(e) => setNome(e.target.value)} className="campo" placeholder="Ex.: FAESA - Campus Vitória" />
          </Campo>
          <CamposEndereco valor={endereco} aoMudar={setEndereco} rotuloMapa="Ponto de parada no mapa" />
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <Botao type="button" variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" disabled={salvando}>
            {salvando ? 'Salvando...' : instituicao ? 'Salvar' : 'Criar instituição'}
          </Botao>
        </footer>
      </form>
    </Gaveta>
  )
}
