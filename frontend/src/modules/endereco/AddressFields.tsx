import { useState, type ReactNode } from 'react'

import Botao from '../../shared/components/Button.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { formatarCep, soDigitos } from '../../shared/utils/formatar.ts'
import type { Coordenada } from '../area/types.ts'
import SeletorLocalizacao from '../mapa/LocationPicker.tsx'
import { buscarCep, localizarEndereco } from './addressService.ts'
import type { DadosEndereco, Endereco } from './types.ts'

/** Endereço como está no formulário (texto) + o ponto marcado no mapa. */
export interface EnderecoDoFormulario {
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  estado: string
  posicao: Coordenada | null
}

export function enderecoDoFormulario(e: Endereco | null | undefined, ufPadrao = 'ES'): EnderecoDoFormulario {
  return {
    cep: e ? formatarCep(e.cep) : '',
    logradouro: e?.logradouro ?? '',
    numero: e?.numero ?? '',
    complemento: e?.complemento ?? '',
    bairro: e?.bairro ?? '',
    cidade: e?.cidade ?? '',
    estado: e?.estado ?? ufPadrao,
    posicao: e?.latitude != null && e?.longitude != null ? [e.latitude, e.longitude] : null,
  }
}

/** Nada preenchido (o endereço é opcional neste cadastro). */
export const enderecoVazio = (e: EnderecoDoFormulario) =>
  !soDigitos(e.cep) && !e.logradouro.trim() && !e.bairro.trim() && !e.numero.trim() && !e.posicao

const texto = (valor: string) => valor.trim() || null

export function paraApi(e: EnderecoDoFormulario): DadosEndereco {
  return {
    cep: soDigitos(e.cep),
    logradouro: e.logradouro.trim(),
    numero: texto(e.numero),
    complemento: texto(e.complemento),
    bairro: e.bairro.trim(),
    cidade: e.cidade.trim(),
    estado: e.estado.trim().toUpperCase(),
    latitude: e.posicao?.[0] ?? null,
    longitude: e.posicao?.[1] ?? null,
  }
}

/** Mensagem do que falta, ou null se o endereço estiver completo. */
export function validarEndereco(e: EnderecoDoFormulario): string | null {
  if (soDigitos(e.cep).length !== 8) return 'Informe o CEP com 8 números.'
  if (!e.logradouro.trim() || !e.bairro.trim() || !e.cidade.trim()) return 'Preencha rua, bairro e cidade.'
  if (!/^[A-Za-z]{2}$/.test(e.estado.trim())) return 'Informe a UF com 2 letras (ex.: ES).'
  if (!e.posicao) return 'Marque o endereço no mapa (é o ponto de partida das viagens).'
  return null
}

type SituacaoBusca = { tipo: 'buscando' | 'ok' | 'erro'; mensagem: string } | null

/**
 * Campos de endereço com busca pelo CEP e o ponto no mapa (clique ou arraste o pino).
 * `rotuloMapa` diz o que o pino marca (ex.: "Casa / garagem").
 */
export default function CamposEndereco({
  valor,
  aoMudar,
  rotuloMapa = 'Localização',
}: {
  valor: EnderecoDoFormulario
  aoMudar: (novo: EnderecoDoFormulario) => void
  rotuloMapa?: string
}) {
  const [busca, setBusca] = useState<SituacaoBusca>(null)
  const [chaveCentralizar, setChaveCentralizar] = useState('inicio')
  const mudar = (campo: keyof EnderecoDoFormulario, novo: string) => aoMudar({ ...valor, [campo]: novo })

  async function localizar(endereco: EnderecoDoFormulario = valor) {
    setBusca({ tipo: 'buscando', mensagem: 'Procurando o endereço no mapa...' })
    const encontrado = await localizarEndereco({ ...endereco, numero: texto(endereco.numero) })
    if (encontrado) {
      aoMudar({ ...endereco, posicao: encontrado })
      setChaveCentralizar(String(Date.now()))
      setBusca({ tipo: 'ok', mensagem: 'Endereço encontrado. Confira o pino e arraste se precisar.' })
    } else {
      aoMudar(endereco)
      setBusca({ tipo: 'erro', mensagem: 'Não encontramos o endereço. Clique no mapa para marcar.' })
    }
  }

  async function aoMudarCep(digitado: string) {
    const cep = formatarCep(digitado)
    const atualizado = { ...valor, cep }
    aoMudar(atualizado)
    if (soDigitos(cep).length !== 8) return
    const dados = await buscarCep(cep)
    if (!dados) {
      setBusca({ tipo: 'erro', mensagem: 'CEP não encontrado. Preencha o endereço à mão.' })
      return
    }
    await localizar({ ...atualizado, ...dados })
  }

  return (
    <>
      <Campo rotulo="CEP">
        <input inputMode="numeric" placeholder="00000-000" value={valor.cep} onChange={(e) => void aoMudarCep(e.target.value)} className="campo" />
      </Campo>
      <Campo rotulo="Bairro">
        <input maxLength={50} value={valor.bairro} onChange={(e) => mudar('bairro', e.target.value)} className="campo" />
      </Campo>
      <Campo rotulo="Rua" className="sm:col-span-2">
        <input maxLength={100} value={valor.logradouro} onChange={(e) => mudar('logradouro', e.target.value)} className="campo" />
      </Campo>
      <Campo rotulo="Número" opcional>
        <input maxLength={10} value={valor.numero} onChange={(e) => mudar('numero', e.target.value)} className="campo" />
      </Campo>
      <Campo rotulo="Complemento" opcional>
        <input maxLength={60} value={valor.complemento} onChange={(e) => mudar('complemento', e.target.value)} className="campo" />
      </Campo>
      <Campo rotulo="Cidade">
        <input maxLength={50} value={valor.cidade} onChange={(e) => mudar('cidade', e.target.value)} className="campo" />
      </Campo>
      <Campo rotulo="UF">
        <input maxLength={2} value={valor.estado} onChange={(e) => mudar('estado', e.target.value.toUpperCase())} className="campo uppercase" />
      </Campo>
      <div className="sm:col-span-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-marinho">{rotuloMapa}</p>
          <Botao type="button" variante="secundario" className="px-3 py-1.5" onClick={() => void localizar()} disabled={busca?.tipo === 'buscando'}>
            <Icone nome="busca" className="h-4 w-4" />
            Localizar endereço
          </Botao>
        </div>
        <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
          <SeletorLocalizacao
            posicao={valor.posicao}
            aoMudar={(posicao) => {
              aoMudar({ ...valor, posicao })
              setBusca(null)
            }}
            areas={[]}
            chaveCentralizar={chaveCentralizar}
          />
        </div>
        <p
          className={`mt-2 text-xs ${
            busca?.tipo === 'erro' ? 'text-amber-700' : busca?.tipo === 'buscando' ? 'animate-brilho text-slate-500' : 'text-slate-500'
          }`}
        >
          {busca?.mensagem ?? (valor.posicao ? 'Arraste o pino para ajustar.' : 'Clique no mapa para marcar o ponto.')}
        </p>
      </div>
    </>
  )
}

function Campo({ rotulo, opcional, className = '', children }: { rotulo: string; opcional?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={`block text-sm font-semibold text-marinho ${className}`}>
      {rotulo}
      {opcional && <span className="ml-1 text-xs font-normal text-slate-400">(opcional)</span>}
      {children}
    </label>
  )
}
