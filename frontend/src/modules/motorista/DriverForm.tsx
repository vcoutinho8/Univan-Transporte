import { useRef, useState, type FormEvent, type ReactNode } from 'react'

import Alerta from '../../shared/components/Alert.tsx'
import Botao from '../../shared/components/Button.tsx'
import Gaveta from '../../shared/components/Drawer.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { ErroApi } from '../../shared/services/api.ts'
import type { StatusCadastro } from '../../shared/types/api.ts'
import { formatarCelular, formatarCpf, formatarData, soDigitos } from '../../shared/utils/formatar.ts'
import type { Veiculo } from '../veiculo/types.ts'
import { cnhValida, cpfValido, diasParaVencer, situacaoCnh } from './driverUtils.ts'
import type { DadosMotorista, Motorista } from './types.ts'

interface Propriedades {
  motorista: Motorista | null
  veiculos: Veiculo[]
  aoSalvar: (dados: DadosMotorista) => Promise<void>
  aoFechar: () => void
}

function valoresIniciais(m: Motorista | null) {
  return {
    nome: m?.nome ?? '',
    apelido: m?.apelido ?? '',
    cpf: m ? formatarCpf(m.cpf) : '',
    celular: m?.celular ? formatarCelular(m.celular) : '',
    cnh: m?.cnh ?? '',
    cnh_validade: m?.cnh_validade?.slice(0, 10) ?? '',
    fk_veiculo: m?.fk_veiculo ? String(m.fk_veiculo) : '',
    status: (m?.status ?? 'ativo') as StatusCadastro,
  }
}

type Valores = ReturnType<typeof valoresIniciais>

/** Cadastro e edição de motorista, numa gaveta lateral com validações completas. */
export default function FormularioMotorista({ motorista, veiculos, aoSalvar, aoFechar }: Propriedades) {
  const [valores, setValores] = useState<Valores>(() => valoresIniciais(motorista))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const rolagem = useRef<HTMLDivElement>(null)

  const mudar = (campo: keyof Valores, valor: string) => setValores((atual) => ({ ...atual, [campo]: valor }))

  // Validação em tempo real de documentos e CNH
  const digitosCpf = soDigitos(valores.cpf)
  const cpfCompleto = digitosCpf.length === 11
  const cpfCorreto = cpfCompleto ? cpfValido(digitosCpf) : null

  const digitosCnh = soDigitos(valores.cnh)
  const cnhCompleta = digitosCnh.length === 11
  const cnhCorreta = cnhCompleta ? cnhValida(digitosCnh) : null

  const temValidade = Boolean(valores.cnh_validade)
  const diasValidade = temValidade ? diasParaVencer(valores.cnh_validade) : null
  const statusCnh = temValidade ? situacaoCnh(valores.cnh_validade) : null

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setSalvando(true)
    setErro(null)

    const nomeLimpo = valores.nome.trim()
    if (!nomeLimpo) {
      setErro('Informe o nome do motorista.')
      setSalvando(false)
      rolagem.current?.scrollTo?.({ top: 0, behavior: 'smooth' })
      return
    }

    if (!cpfCompleto || !cpfValido(digitosCpf)) {
      setErro('CPF inválido. Confira os 11 números digitados.')
      setSalvando(false)
      rolagem.current?.scrollTo?.({ top: 0, behavior: 'smooth' })
      return
    }

    const digitosCelular = soDigitos(valores.celular)
    if (digitosCelular.length < 10 || digitosCelular.length > 11) {
      setErro('Celular inválido. Informe DDD + número (10 ou 11 dígitos).')
      setSalvando(false)
      rolagem.current?.scrollTo?.({ top: 0, behavior: 'smooth' })
      return
    }

    if (!cnhCompleta || !cnhValida(digitosCnh)) {
      setErro('CNH inválida. Confira o número do registro (11 dígitos).')
      setSalvando(false)
      rolagem.current?.scrollTo?.({ top: 0, behavior: 'smooth' })
      return
    }

    if (!valores.cnh_validade) {
      setErro('Informe a data de validade da CNH.')
      setSalvando(false)
      rolagem.current?.scrollTo?.({ top: 0, behavior: 'smooth' })
      return
    }

    if (valores.status === 'ativo' && diasValidade !== null && diasValidade < 0) {
      setErro(`CNH vencida em ${formatarData(valores.cnh_validade)}. Atualize a validade para cadastrar ou ativar o motorista.`)
      setSalvando(false)
      rolagem.current?.scrollTo?.({ top: 0, behavior: 'smooth' })
      return
    }

    try {
      await aoSalvar({
        nome: nomeLimpo,
        apelido: valores.apelido.trim() || null,
        cpf: digitosCpf,
        celular: digitosCelular,
        cnh: digitosCnh,
        cnh_validade: valores.cnh_validade,
        fk_veiculo: valores.fk_veiculo ? Number(valores.fk_veiculo) : null,
        status: valores.status,
      })
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado ao salvar.')
      rolagem.current?.scrollTo?.({ top: 0, behavior: 'smooth' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Gaveta
      titulo={motorista ? `Editar ${motorista.nome}` : 'Novo motorista'}
      descricao="Cadastro de quem dirige, CNH, veículo padrão e situação."
      aoFechar={aoFechar}
      largura="max-w-xl"
    >
      <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
        <div ref={rolagem} className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
          {erro && <Alerta mensagem={erro} />}

          <Secao titulo="Dados pessoais" icone="usuario">
            <Campo rotulo="Nome completo" className="sm:col-span-2">
              <input
                required
                maxLength={100}
                placeholder="Ex.: Carlos Eduardo Martins"
                value={valores.nome}
                onChange={(e) => mudar('nome', e.target.value)}
                className="campo"
              />
            </Campo>

            <Campo rotulo="Apelido" opcional>
              <input
                maxLength={30}
                placeholder="Ex.: Cadu"
                value={valores.apelido}
                onChange={(e) => mudar('apelido', e.target.value)}
                className="campo"
              />
            </Campo>

            <Campo rotulo="CPF">
              <input
                required
                inputMode="numeric"
                maxLength={14}
                placeholder="000.000.000-00"
                value={valores.cpf}
                onChange={(e) => mudar('cpf', formatarCpf(e.target.value))}
                className="campo"
              />
              {cpfCorreto === true && (
                <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <Icone nome="ok" className="h-3.5 w-3.5" /> CPF válido
                </span>
              )}
              {cpfCorreto === false && (
                <span className="mt-1 text-xs font-semibold text-rose-600">Dígitos do CPF não conferem</span>
              )}
            </Campo>

            <Campo rotulo="Celular" className="sm:col-span-2">
              <input
                required
                inputMode="tel"
                maxLength={15}
                placeholder="(27) 99999-0000"
                value={valores.celular}
                onChange={(e) => mudar('celular', formatarCelular(e.target.value))}
                className="campo"
              />
            </Campo>
          </Secao>

          <Secao titulo="Habilitação (CNH)" icone="relatorio">
            <Campo rotulo="Número do registro da CNH">
              <input
                required
                inputMode="numeric"
                maxLength={11}
                placeholder="11 números da CNH"
                value={valores.cnh}
                onChange={(e) => mudar('cnh', soDigitos(e.target.value))}
                className="campo"
              />
              {cnhCorreta === true && (
                <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <Icone nome="ok" className="h-3.5 w-3.5" /> CNH válida
                </span>
              )}
              {cnhCorreta === false && (
                <span className="mt-1 text-xs font-semibold text-rose-600">Número de CNH inválido</span>
              )}
            </Campo>

            <Campo rotulo="Validade da CNH">
              <input
                type="date"
                required
                value={valores.cnh_validade}
                onChange={(e) => mudar('cnh_validade', e.target.value)}
                className="campo"
              />
              {statusCnh === 'valida' && (
                <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <Icone nome="ok" className="h-3.5 w-3.5" /> CNH em dia
                </span>
              )}
              {statusCnh === 'vencendo' && diasValidade !== null && (
                <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-600">
                  <Icone nome="alerta" className="h-3.5 w-3.5" /> Vence em {diasValidade} dia(s)
                </span>
              )}
              {statusCnh === 'vencida' && (
                <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-rose-600">
                  <Icone nome="alerta" className="h-3.5 w-3.5" /> CNH vencida
                </span>
              )}
            </Campo>
          </Secao>

          <Secao titulo="Veículo padrão e situação" icone="van">
            <Campo rotulo="Veículo padrão vinculado" opcional className="sm:col-span-2">
              <select
                value={valores.fk_veiculo}
                onChange={(e) => mudar('fk_veiculo', e.target.value)}
                className="campo"
              >
                <option value="">Nenhum veículo vinculado</option>
                {veiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa} · {v.modelo} ({v.capacidade} lugares)
                  </option>
                ))}
              </select>
            </Campo>

            <div className="sm:col-span-2">
              <p className="text-sm font-semibold text-marinho">Situação cadastral</p>
              <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl bg-fundo p-1">
                {(['ativo', 'inativo'] as const).map((sit) => (
                  <button
                    key={sit}
                    type="button"
                    onClick={() => mudar('status', sit)}
                    className={`rounded-lg py-2 text-xs font-bold transition-all ${
                      valores.status === sit
                        ? 'bg-white text-marinho shadow-sm'
                        : 'text-slate-500 hover:text-marinho'
                    }`}
                  >
                    {sit === 'ativo' ? 'Ativo' : 'Inativo (desativado)'}
                  </button>
                ))}
              </div>
            </div>
          </Secao>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <Botao type="button" variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" disabled={salvando}>
            {salvando ? 'Salvando...' : motorista ? 'Salvar alterações' : 'Cadastrar motorista'}
          </Botao>
        </footer>
      </form>
    </Gaveta>
  )
}

function Secao({
  titulo,
  icone,
  children,
}: {
  titulo: string
  icone: 'usuario' | 'relatorio' | 'van'
  children: ReactNode
}) {
  return (
    <fieldset>
      <legend className="mb-3 flex items-center gap-2 text-xs font-extrabold tracking-widest text-slate-400 uppercase">
        <Icone nome={icone} className="h-4 w-4 text-laranja" />
        {titulo}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

function Campo({
  rotulo,
  opcional,
  className = '',
  children,
}: {
  rotulo: string
  opcional?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <label className={`block text-sm font-semibold text-marinho ${className}`}>
      {rotulo}
      {opcional && <span className="ml-1 text-xs font-normal text-slate-400">(opcional)</span>}
      {children}
    </label>
  )
}
