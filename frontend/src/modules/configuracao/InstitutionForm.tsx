import { useEffect, useState } from 'react'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Gaveta from '../../shared/components/Drawer.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { useConfirmacao } from '../../shared/components/NoticeModal.tsx'
import { ErroApi } from '../../shared/services/api.ts'
import { formatarCep } from '../../shared/utils/formatar.ts'
import type { Coordenada } from '../area/types.ts'
import { buscarCep, localizarEndereco } from '../endereco/addressService.ts'
import type { DadosEndereco } from '../endereco/types.ts'
import { servicoInstituicao, type FaculdadeDoCatalogo } from '../instituicao/institutionService.ts'
import type { Instituicao } from '../instituicao/types.ts'

const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ')

/** Onde fica a faculdade: o mapa pelo endereço; sem achar, o ponto do CEP (BrasilAPI). */
async function localizar(f: FaculdadeDoCatalogo): Promise<Coordenada | null> {
  const endereco = { logradouro: f.logradouro, numero: f.numero || null, cidade: f.municipio, estado: f.uf }
  return (await localizarEndereco(endereco)) ?? (await buscarCep(f.cep))?.posicao ?? null
}

/**
 * Faculdade de destino: escolhida no cadastro oficial do MEC (nada é digitado à mão, para não
 * ter nome nem endereço errado). O ponto de parada e os portões ficam no Mapa e rotas › Faculdades.
 */
export default function FormularioInstituicao({
  instituicao,
  aoSalvar,
  aoFechar,
}: {
  instituicao: Instituicao | null
  aoSalvar: (mensagem: string) => void
  aoFechar: () => void
}) {
  const confirmacao = useConfirmacao()
  const [escolhida, setEscolhida] = useState<FaculdadeDoCatalogo | null>(null)
  const [uf, setUf] = useState(instituicao?.endereco.estado ?? 'ES')
  const [termo, setTermo] = useState('')
  const [achadas, setAchadas] = useState<FaculdadeDoCatalogo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    const espera = window.setTimeout(() => {
      servicoInstituicao
        .catalogo(uf, termo)
        .then(setAchadas)
        .catch(() => setAchadas([]))
    }, 300)
    return () => window.clearTimeout(espera)
  }, [uf, termo])

  async function salvar() {
    if (!escolhida) return
    setErro(null)
    setSalvando(true)
    try {
      const posicao = await localizar(escolhida)
      const endereco: DadosEndereco = {
        cep: escolhida.cep,
        logradouro: escolhida.logradouro,
        numero: escolhida.numero || 'S/N',
        complemento: null,
        bairro: escolhida.bairro || 'Centro',
        cidade: escolhida.municipio,
        estado: escolhida.uf,
        latitude: posicao?.[0] ?? null,
        longitude: posicao?.[1] ?? null,
      }
      if (instituicao) await servicoInstituicao.alterar(instituicao.id, { nome: escolhida.nome, endereco })
      else await servicoInstituicao.criar({ nome: escolhida.nome, endereco })
      aoSalvar(
        posicao
          ? `${escolhida.nome} salva. Ajuste o portão em Mapa e rotas › Faculdades, se precisar.`
          : `${escolhida.nome} salva, mas sem localização: marque o ponto em Mapa e rotas › Faculdades.`,
      )
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir() {
    if (!instituicao) return
    const sim = await confirmacao.confirmar({
      titulo: `Excluir ${instituicao.nome}?`,
      descricao: 'Só dá para excluir se nenhum passageiro, rota ou dia sem aula usa esta faculdade.',
      botao: 'Excluir',
      perigo: true,
    })
    if (!sim) return
    try {
      await servicoInstituicao.excluir(instituicao.id)
      aoSalvar(`${instituicao.nome} excluída.`)
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Não foi possível excluir.')
    }
  }

  const atual = escolhida
    ? { nome: escolhida.nome, linha: `${escolhida.logradouro}${escolhida.numero ? `, ${escolhida.numero}` : ''} · ${escolhida.bairro}`, cidade: `${escolhida.municipio}/${escolhida.uf} · ${formatarCep(escolhida.cep)}` }
    : instituicao
      ? {
          nome: instituicao.nome,
          linha: `${instituicao.endereco.logradouro}, ${instituicao.endereco.numero ?? 'S/N'} · ${instituicao.endereco.bairro}`,
          cidade: `${instituicao.endereco.cidade}/${instituicao.endereco.estado} · ${formatarCep(instituicao.endereco.cep)}`,
        }
      : null

  return (
    <Gaveta
      titulo={instituicao ? 'Editar instituição' : 'Nova instituição'}
      descricao="Escolha a faculdade no cadastro oficial do MEC."
      aoFechar={aoFechar}
      largura="max-w-xl"
    >
      {confirmacao.modal}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          {erro && <Alerta mensagem={erro} />}

          {/* A faculdade escolhida (ou a atual, na edição) */}
          {atual ? (
            <section className="flex items-start gap-3 rounded-2xl bg-marinho p-4 text-white">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15">
                <Icone nome="escola" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-widest text-white/50 uppercase">{escolhida ? 'Escolhida' : 'Cadastrada'}</p>
                <p className="font-extrabold">{atual.nome}</p>
                <p className="text-sm text-white/70">{atual.linha}</p>
                <p className="text-xs text-white/50">{atual.cidade}</p>
              </div>
            </section>
          ) : (
            <p className="rounded-2xl bg-laranja/5 p-4 text-sm text-marinho ring-1 ring-laranja/20">
              Escolha a faculdade na lista abaixo: o nome e o endereço oficiais entram sozinhos.
            </p>
          )}

          <section>
            <p className="mb-2 flex items-center gap-2 text-sm font-bold text-marinho">
              <Icone nome="busca" className="h-4 w-4 text-laranja" />
              {instituicao ? 'Trocar pela faculdade do MEC' : 'Buscar no cadastro oficial do MEC'}
            </p>
            <div className="flex gap-2">
              <select value={uf} onChange={(e) => setUf(e.target.value)} className="campo mt-0 w-24 shrink-0" aria-label="Estado">
                {UFS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
              <input value={termo} onChange={(e) => setTermo(e.target.value)} className="campo mt-0" placeholder="Nome, sigla ou cidade (ex.: UVV)" />
            </div>
            <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl bg-white ring-1 ring-slate-200">
              {achadas === null && <li className="px-3 py-3 text-sm text-slate-400">Carregando...</li>}
              {achadas?.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">Nenhuma faculdade encontrada em {uf}.</li>}
              {achadas?.map((f) => (
                <li key={f.codigo}>
                  <button
                    type="button"
                    onClick={() => setEscolhida(f)}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors ${escolhida?.codigo === f.codigo ? 'bg-laranja/10' : 'hover:bg-laranja/5'}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-marinho">
                        {f.nome}
                        {f.sigla && <span className="ml-1 font-normal text-slate-400">({f.sigla})</span>}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {f.municipio} · {f.logradouro}
                        {f.numero ? `, ${f.numero}` : ''}
                      </span>
                    </span>
                    {escolhida?.codigo === f.codigo && <Icone nome="ok" className="h-4 w-4 shrink-0 text-laranja" />}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-400">Fonte: Censo da Educação Superior 2024 (INEP/MEC).</p>
          </section>
        </div>
        <footer className="flex items-center gap-2 border-t border-slate-100 px-6 py-4">
          {instituicao && (
            <Botao type="button" variante="fantasma" className="mr-auto text-red-500 hover:bg-red-50" onClick={() => void excluir()}>
              <Icone nome="alerta" className="h-4 w-4" />
              Excluir
            </Botao>
          )}
          <Botao type="button" variante="secundario" className={instituicao ? '' : 'ml-auto'} onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="button" disabled={!escolhida || salvando} onClick={() => void salvar()}>
            {salvando ? 'Salvando...' : instituicao ? 'Salvar' : 'Cadastrar'}
          </Botao>
        </footer>
      </div>
    </Gaveta>
  )
}
