import { useState, type ReactNode } from 'react'

import Botao from '../../shared/components/Button.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { formatarCep, soDigitos } from '../../shared/utils/formatar.ts'
import type { Area, Coordenada } from '../area/types.ts'
import SeletorLocalizacao from '../mapa/LocationPicker.tsx'
import { buscarCep, enderecoParcialDoPonto, localizarEndereco } from './addressService.ts'
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
  if (!e.numero.trim()) return 'Informe o número da casa (ou marque S/N, sem número).'
  if (!/^[A-Za-z]{2}$/.test(e.estado.trim())) return 'Informe a UF com 2 letras (ex.: ES).'
  if (!e.posicao) return 'Marque o endereço no mapa (é o ponto de partida das viagens).'
  return null
}

type SituacaoBusca = { tipo: 'buscando' | 'ok' | 'erro'; mensagem: string } | null

/** Número de quem não tem número na fachada. */
export const SEM_NUMERO = 'S/N'

/**
 * Campos de endereço com busca pelo CEP e o ponto no mapa, sincronizados nos dois sentidos:
 * CEP/rua/número → "Localizar endereço" põe o pino; arrastar ou clicar no mapa atualiza os campos
 * pelo ponto. O número é obrigatório (ou S/N). `rotuloMapa` diz o que o pino marca.
 */
export default function CamposEndereco({
  valor,
  aoMudar,
  rotuloMapa = 'Localização',
  areas = [],
  rodapeMapa,
}: {
  valor: EnderecoDoFormulario
  aoMudar: (novo: EnderecoDoFormulario) => void
  rotuloMapa?: string
  /** Áreas desenhadas no mapa (o passageiro vê em qual área a casa cai). */
  areas?: Area[]
  rodapeMapa?: ReactNode
}) {
  const [busca, setBusca] = useState<SituacaoBusca>(null)
  const [chaveCentralizar, setChaveCentralizar] = useState('inicio')
  // Coordenada que a BrasilAPI deu para o CEP: reserva quando o mapa não acha a rua.
  const [pontoDoCep, setPontoDoCep] = useState<Coordenada | null>(null)
  const mudar = (campo: keyof EnderecoDoFormulario, novo: string) => aoMudar({ ...valor, [campo]: novo })
  const semNumero = valor.numero === SEM_NUMERO

  async function localizar(endereco: EnderecoDoFormulario = valor, reserva: Coordenada | null = pontoDoCep) {
    setBusca({ tipo: 'buscando', mensagem: 'Procurando o endereço no mapa...' })
    const numero = endereco.numero === SEM_NUMERO ? null : texto(endereco.numero)
    const encontrado = (await localizarEndereco({ ...endereco, numero })) ?? reserva
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
    setBusca({ tipo: 'buscando', mensagem: 'Buscando o CEP...' })
    const dados = await buscarCep(cep)
    if (!dados) {
      setBusca({ tipo: 'erro', mensagem: 'CEP não encontrado. Preencha o endereço à mão.' })
      return
    }
    const { posicao: reserva, ...campos } = dados
    setPontoDoCep(reserva ?? null)
    // Só troca o que o CEP trouxe (CEP de cidade pequena vem sem rua: mantém a digitada).
    const preenchidos = Object.fromEntries(Object.entries(campos).filter(([, v]) => v)) as Partial<EnderecoDoFormulario>
    await localizar({ ...atualizado, ...preenchidos }, reserva ?? null)
  }

  /** Pino arrastado ou clique no mapa: o ponto manda e os campos acompanham. */
  async function aoMoverPino(posicao: Coordenada) {
    const comPino = { ...valor, posicao }
    aoMudar(comPino)
    setBusca({ tipo: 'buscando', mensagem: 'Lendo o endereço deste ponto...' })
    const lido = await enderecoParcialDoPonto(posicao)
    if (!lido?.logradouro) {
      setBusca({ tipo: 'erro', mensagem: 'Ponto marcado. Não achamos a rua aqui: confira os campos.' })
      return
    }
    aoMudar({
      ...comPino,
      logradouro: lido.logradouro,
      bairro: lido.bairro ?? comPino.bairro,
      cidade: lido.cidade ?? comPino.cidade,
      estado: lido.estado ?? comPino.estado,
      cep: lido.cep ? formatarCep(lido.cep) : comPino.cep,
      // S/N continua S/N; o número do mapa só entra se ele souber.
      numero: semNumero ? SEM_NUMERO : (lido.numero ?? comPino.numero),
    })
    const comNumero = lido.numero ? `, ${lido.numero}` : ''
    setBusca({ tipo: 'ok', mensagem: `Endereço atualizado pelo ponto: ${lido.logradouro}${comNumero}. Confira o número.` })
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
      <Campo rotulo="Número">
        <span className="relative block">
          <input
            maxLength={10}
            inputMode="numeric"
            disabled={semNumero}
            value={valor.numero}
            placeholder="Ex.: 120"
            onChange={(e) => mudar('numero', e.target.value)}
            className={`campo pr-16 ${semNumero ? 'bg-fundo text-slate-500' : ''}`}
          />
          <button
            type="button"
            onClick={() => mudar('numero', semNumero ? '' : SEM_NUMERO)}
            aria-pressed={semNumero}
            title={semNumero ? 'Tem número' : 'Sem número'}
            className={`absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-extrabold transition-colors ${
              semNumero ? 'bg-marinho text-white' : 'bg-fundo text-slate-500 hover:bg-slate-200'
            }`}
          >
            S/N
          </button>
        </span>
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
          <SeletorLocalizacao posicao={valor.posicao} aoMudar={(posicao) => void aoMoverPino(posicao)} areas={areas} chaveCentralizar={chaveCentralizar} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className={busca?.tipo === 'erro' ? 'text-amber-700' : busca?.tipo === 'buscando' ? 'animate-brilho text-slate-500' : 'text-slate-500'}>
            {busca?.mensagem ?? (valor.posicao ? 'Arraste o pino: rua, bairro e CEP acompanham o ponto.' : 'Clique no mapa para marcar o ponto.')}
          </span>
          {rodapeMapa}
        </div>
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
