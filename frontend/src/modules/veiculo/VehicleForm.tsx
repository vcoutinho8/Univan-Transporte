import { useState, type FormEvent } from 'react'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Gaveta from '../../shared/components/Drawer.tsx'
import { ErroApi } from '../../shared/services/api.ts'
import {
  CATEGORIAS_VEICULO,
  CORES_VEICULO,
  LISTA_CATEGORIAS_VEICULO,
  obterCategoriaPorCapacidade,
  obterHexCor,
  type CategoriaVeiculo,
  type DadosVeiculo,
  type Veiculo,
} from './types.ts'

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
  const categoriaInicial: CategoriaVeiculo = veiculo
    ? (veiculo.categoria ?? obterCategoriaPorCapacidade(veiculo.capacidade))
    : 'van'

  const corInicial = veiculo?.cor ?? ''
  const corPadraoInicial = corInicial ? obterHexCor(corInicial) : null

  const [categoria, setCategoria] = useState<CategoriaVeiculo>(categoriaInicial)
  // Placa conferida ao digitar (antiga ABC1234 ou Mercosul ABC1D23; hífen e espaço não contam).
  const [placa, setPlaca] = useState(veiculo?.placa ?? '')
  const placaLimpa = placa.replace(/[^A-Z0-9]/g, '')
  const placaInvalida = placaLimpa.length >= 7 ? !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placaLimpa) : placa.length > 0 && placaLimpa.length === 0
  const [capacidade, setCapacidade] = useState<string>(
    veiculo ? String(veiculo.capacidade) : String(CATEGORIAS_VEICULO[categoriaInicial].min),
  )
  const [cor, setCor] = useState<string>(corPadraoInicial ? corPadraoInicial.nome : corInicial)
  const [usandoOutraCor, setUsandoOutraCor] = useState<boolean>(
    Boolean(corInicial && !corPadraoInicial),
  )
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const limites = CATEGORIAS_VEICULO[categoria]

  function aoMudarCategoria(novaCategoria: CategoriaVeiculo) {
    setCategoria(novaCategoria)
    const novaFaixa = CATEGORIAS_VEICULO[novaCategoria]
    const valorAtual = Number(capacidade)
    if (!capacidade || Number.isNaN(valorAtual) || valorAtual < novaFaixa.min || valorAtual > novaFaixa.max) {
      setCapacidade(String(novaFaixa.min))
    }
  }

  function selecionarCorPadrao(nomeCor: string) {
    const jaSelecionada = !usandoOutraCor && cor.toLowerCase() === nomeCor.toLowerCase()
    setUsandoOutraCor(false)
    setCor(jaSelecionada ? '' : nomeCor)
  }

  function ativarOutraCor() {
    if (usandoOutraCor) {
      setUsandoOutraCor(false)
      setCor('')
    } else {
      setUsandoOutraCor(true)
      if (obterHexCor(cor)) {
        setCor('')
      }
    }
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const formulario = new FormData(evento.currentTarget)
    const capacidadeNumerica = Number(capacidade)

    if (
      Number.isNaN(capacidadeNumerica) ||
      capacidadeNumerica < limites.min ||
      capacidadeNumerica > limites.max
    ) {
      setErro(`Para a categoria ${limites.rotulo}, informe entre ${limites.min} e ${limites.max} lugares.`)
      return
    }

    setSalvando(true)
    setErro(null)
    try {
      await aoSalvar({
        placa: String(formulario.get('placa')),
        categoria,
        modelo: String(formulario.get('modelo')),
        cor: cor.trim() || null,
        capacidade: capacidadeNumerica,
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
      descricao="Doblò, van, micro-ônibus ou ônibus da frota."
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
                value={placa}
                onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                aria-invalid={placaInvalida}
                className={`campo uppercase ${placaInvalida ? 'border-red-300 ring-2 ring-red-100' : ''}`}
              />
              {placaInvalida && (
                <span className="mt-1 block text-xs font-semibold text-red-600">Placa inválida: use ABC1234 ou ABC1D23 (Mercosul).</span>
              )}
            </label>

            <label className="text-sm font-semibold text-marinho">
              Categoria
              <select
                name="categoria"
                value={categoria}
                onChange={(e) => aoMudarCategoria(e.target.value as CategoriaVeiculo)}
                className="campo"
              >
                {LISTA_CATEGORIAS_VEICULO.map((item) => (
                  <option key={item.valor} value={item.valor}>
                    {item.rotulo} ({item.min} a {item.max} lugares)
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-semibold text-marinho sm:col-span-2">
              Capacidade (lugares)
              <input
                name="capacidade"
                type="number"
                required
                min={limites.min}
                max={limites.max}
                value={capacidade}
                onChange={(e) => setCapacidade(e.target.value)}
                className="campo"
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Faixa para {limites.rotulo}: {limites.min} a {limites.max} lugares
              </span>
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

            <div className="sm:col-span-2">
              <span className="text-sm font-semibold text-marinho">
                Cor <span className="text-xs font-normal text-slate-400">(opcional)</span>
              </span>

              <div className="mt-2 flex flex-wrap gap-2">
                {CORES_VEICULO.map((opcao) => {
                  const selecionada = !usandoOutraCor && cor.trim().toLowerCase() === opcao.nome.toLowerCase()
                  return (
                    <button
                      key={opcao.nome}
                      type="button"
                      onClick={() => selecionarCorPadrao(opcao.nome)}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        selecionada
                          ? 'border-laranja bg-laranja/10 text-marinho ring-2 ring-laranja/30'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-fundo'
                      }`}
                    >
                      <span
                        className={`h-3.5 w-3.5 rounded-full ${opcao.borda ? 'border border-slate-300' : ''}`}
                        style={{ backgroundColor: opcao.hex }}
                      />
                      {opcao.nome}
                    </button>
                  )
                })}

                <button
                  type="button"
                  onClick={ativarOutraCor}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    usandoOutraCor
                      ? 'border-laranja bg-laranja/10 text-marinho ring-2 ring-laranja/30'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-fundo'
                  }`}
                >
                  Outra
                </button>
              </div>

              {usandoOutraCor && (
                <input
                  name="cor"
                  maxLength={30}
                  autoFocus
                  value={cor}
                  onChange={(e) => setCor(e.target.value)}
                  placeholder="Digite o nome da cor (ex.: Bege)"
                  className="campo mt-2"
                />
              )}
            </div>
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