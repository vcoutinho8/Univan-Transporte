import { useEffect, useState, type FormEvent } from 'react'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Gaveta from '../../shared/components/Drawer.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { ErroApi } from '../../shared/services/api.ts'
import { formatarCep } from '../../shared/utils/formatar.ts'
import CamposEndereco, { enderecoDoFormulario, paraApi, validarEndereco } from '../endereco/AddressFields.tsx'
import { localizarEndereco } from '../endereco/addressService.ts'
import { servicoInstituicao, type FaculdadeDoCatalogo } from '../instituicao/institutionService.ts'
import type { Instituicao } from '../instituicao/types.ts'
import { Campo } from './UserForm.tsx'

const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ')

/**
 * Nova faculdade de destino (ou alteração): busque no cadastro oficial do MEC pelo estado e o
 * nome e o endereço já vêm preenchidos; o pino no mapa vira o ponto de parada.
 */
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

  // Busca no catálogo (só para cadastrar uma nova).
  const [uf, setUf] = useState(endereco.estado || 'ES')
  const [termo, setTermo] = useState('')
  const [achadas, setAchadas] = useState<FaculdadeDoCatalogo[] | null>(null)
  useEffect(() => {
    if (instituicao) return
    const espera = window.setTimeout(() => {
      servicoInstituicao
        .catalogo(uf, termo)
        .then(setAchadas)
        .catch(() => setAchadas([]))
    }, 300)
    return () => window.clearTimeout(espera)
  }, [uf, termo, instituicao])

  async function escolher(f: FaculdadeDoCatalogo) {
    setNome(f.nome)
    setTermo('')
    setAchadas(null)
    const novo = {
      ...endereco,
      cep: formatarCep(f.cep),
      logradouro: f.logradouro,
      numero: f.numero || 'S/N',
      bairro: f.bairro,
      cidade: f.municipio,
      estado: f.uf,
    }
    setEndereco(novo)
    const posicao = await localizarEndereco({ ...novo, numero: f.numero || null })
    if (posicao) setEndereco({ ...novo, posicao })
  }

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
          {!instituicao && (
            <section className="rounded-2xl bg-fundo/70 p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-bold text-marinho">
                <Icone nome="busca" className="h-4 w-4 text-laranja" />
                Buscar no cadastro oficial do MEC
              </p>
              <div className="flex gap-2">
                <select value={uf} onChange={(e) => setUf(e.target.value)} className="campo w-24 shrink-0" aria-label="Estado">
                  {UFS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
                <input value={termo} onChange={(e) => setTermo(e.target.value)} className="campo" placeholder="Nome, sigla ou cidade (ex.: UVV)" />
              </div>
              {achadas && (
                <ul className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl bg-white ring-1 ring-slate-200">
                  {achadas.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">Nenhuma faculdade encontrada em {uf}.</li>}
                  {achadas.map((f) => (
                    <li key={f.codigo}>
                      <button type="button" onClick={() => void escolher(f)} className="w-full px-3 py-2.5 text-left hover:bg-laranja/5">
                        <span className="block text-sm font-semibold text-marinho">
                          {f.nome}
                          {f.sigla && <span className="ml-1 font-normal text-slate-400">({f.sigla})</span>}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {f.municipio} · {f.logradouro}
                          {f.numero ? `, ${f.numero}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-slate-400">Fonte: Censo da Educação Superior 2024 (INEP/MEC). Não achou? Preencha abaixo à mão.</p>
            </section>
          )}
          <Campo rotulo="Nome">
            <input required maxLength={100} value={nome} onChange={(e) => setNome(e.target.value)} className="campo" placeholder="Ex.: FAESA - Campus Vitória" />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <CamposEndereco valor={endereco} aoMudar={setEndereco} rotuloMapa="Ponto de parada no mapa" />
          </div>
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
