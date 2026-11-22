import { useRef, useState, type FormEvent, type ReactNode } from 'react'

import Alerta from '../../shared/components/Alert.tsx'
import { useVerificacaoCadastro } from '../../shared/hooks/useVerificacaoCadastro.ts'
import Botao from '../../shared/components/Button.tsx'
import CampoMoeda from '../../shared/components/MoneyInput.tsx'
import Gaveta from '../../shared/components/Drawer.tsx'
import Icone from '../../shared/components/Icon.tsx'
import { ErroApi } from '../../shared/services/api.ts'
import { formatarCelular, formatarCpf, soDigitos } from '../../shared/utils/formatar.ts'
import type { Area, Coordenada } from '../area/types.ts'
import CamposEndereco, { enderecoDoFormulario, paraApi, validarEndereco } from '../endereco/AddressFields.tsx'
import type { Instituicao } from '../instituicao/types.ts'
import { areaDoPonto, corDoMotorista } from '../mapa/mapUtils.ts'
import { ROTULOS_TURNO, type DadosEstudante, type Estudante, type Turno } from './types.ts'

interface Propriedades {
  estudante: Estudante | null
  instituicoes: Instituicao[]
  areas: Area[]
  aoSalvar: (dados: DadosEstudante) => Promise<void>
  aoFechar: () => void
}

/** Valores do formulário, todos como texto (como vêm dos campos). */
function valoresIniciais(e: Estudante | null) {
  return {
    nome: e?.nome ?? '',
    apelido: e?.apelido ?? '',
    cpf: e ? formatarCpf(e.cpf) : '',
    celular: e ? formatarCelular(e.celular) : '',
    email: e?.email ?? '',
    fk_instituicao: e ? String(e.fk_instituicao) : '',
    fk_parada: e?.fk_parada ? String(e.fk_parada) : '',
    curso: e?.curso ?? '',
    turno: (e?.turno ?? 'noite') as Turno,
    horario_embarque: e?.horario_embarque?.slice(0, 5) ?? '',
    valor_mensal: e ? String(e.valor_mensal) : '',
    dia_vencimento: e ? String(e.dia_vencimento) : '10',
  }
}

type Valores = ReturnType<typeof valoresIniciais>

const texto = (valor: string) => valor.trim() || null

/** Cadastro e edição de passageiro, numa gaveta lateral. Erros da API aparecem no topo. */
export default function FormularioEstudante({ estudante, instituicoes, areas, aoSalvar, aoFechar }: Propriedades) {
  const [valores, setValores] = useState<Valores>(() => valoresIniciais(estudante))
  // CPF inválido ou repetido e celular de outro cadastro: aviso já ao digitar.
  const verificacao = useVerificacaoCadastro(valores.cpf, valores.celular, 'estudante', estudante?.id)
  const [endereco, setEndereco] = useState(() => enderecoDoFormulario(estudante?.endereco))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const rolagem = useRef<HTMLDivElement>(null)

  const mudar = (campo: keyof Valores, valor: string) => setValores((atual) => ({ ...atual, [campo]: valor }))
  const areaPrevista = endereco.posicao ? areaDoPonto(endereco.posicao, areas) : null
  const paradasDaFaculdade = instituicoes.find((i) => String(i.id) === valores.fk_instituicao)?.paradas ?? []

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    const problema = validarEndereco(endereco)
    if (problema) {
      setErro(problema)
      rolagem.current?.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      await aoSalvar({
        nome: valores.nome,
        apelido: texto(valores.apelido),
        cpf: soDigitos(valores.cpf),
        celular: soDigitos(valores.celular),
        email: texto(valores.email),
        fk_instituicao: Number(valores.fk_instituicao),
        fk_parada: valores.fk_parada ? Number(valores.fk_parada) : null,
        curso: texto(valores.curso),
        turno: valores.turno,
        horario_embarque: texto(valores.horario_embarque),
        valor_mensal: Number(valores.valor_mensal),
        dia_vencimento: Number(valores.dia_vencimento),
        endereco: paraApi(endereco),
      })
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Erro inesperado ao salvar.')
      rolagem.current?.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Gaveta
      titulo={estudante ? `Editar ${estudante.nome}` : 'Novo passageiro'}
      descricao="A área (e o motorista) é definida pelo endereço marcado no mapa."
      aoFechar={aoFechar}
      largura="max-w-2xl"
    >
      <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
        <div ref={rolagem} className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
          {erro && <Alerta mensagem={erro} />}

          <Secao titulo="Dados pessoais" icone="usuario">
            <Campo rotulo="Nome completo" className="sm:col-span-2">
              <input required maxLength={100} value={valores.nome} onChange={(e) => mudar('nome', e.target.value)} className="campo" />
            </Campo>
            <Campo rotulo="Apelido" opcional>
              <input maxLength={30} value={valores.apelido} onChange={(e) => mudar('apelido', e.target.value)} className="campo" />
            </Campo>
            <Campo rotulo="CPF">
              <input
                required
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={valores.cpf}
                onChange={(e) => mudar('cpf', formatarCpf(e.target.value))}
                aria-invalid={Boolean(verificacao.avisoCpf)}
                className={`campo ${verificacao.avisoCpf ? 'border-red-300 ring-2 ring-red-100' : ''}`}
              />
              {verificacao.avisoCpf && <span className="mt-1 block text-xs font-semibold text-red-600">{verificacao.avisoCpf}</span>}
            </Campo>
            <Campo rotulo="Celular">
              <input
                required
                inputMode="tel"
                placeholder="(27) 99999-0000"
                value={valores.celular}
                onChange={(e) => mudar('celular', formatarCelular(e.target.value))}
                aria-invalid={Boolean(verificacao.avisoCelular)}
                className={`campo ${verificacao.avisoCelular ? 'border-red-300 ring-2 ring-red-100' : ''}`}
              />
              {verificacao.avisoCelular && <span className="mt-1 block text-xs font-semibold text-red-600">{verificacao.avisoCelular}</span>}
            </Campo>
            <Campo rotulo="E-mail" opcional>
              <input type="email" maxLength={100} value={valores.email} onChange={(e) => mudar('email', e.target.value)} className="campo" />
            </Campo>
          </Secao>

          <Secao titulo="Faculdade" icone="escola">
            <Campo rotulo="Instituição" className="sm:col-span-2">
              <select
                required
                value={valores.fk_instituicao}
                onChange={(e) => setValores((atual) => ({ ...atual, fk_instituicao: e.target.value, fk_parada: '' }))}
                className="campo"
              >
                <option value="" disabled>
                  Selecione...
                </option>
                {instituicoes.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome}
                  </option>
                ))}
              </select>
            </Campo>
            {paradasDaFaculdade.length > 0 && (
              <Campo rotulo="Parada na faculdade" className="sm:col-span-2">
                <select value={valores.fk_parada} onChange={(e) => mudar('fk_parada', e.target.value)} className="campo">
                  <option value="">Parada principal</option>
                  {paradasDaFaculdade.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Onde a van deixa e busca este passageiro (ex.: Biopráticas para os cursos da saúde).
                </span>
              </Campo>
            )}
            {/* Horário de embarque: sai da localização e da rota (não se digita). */}
            <Campo rotulo="Curso" opcional className="sm:col-span-2">
              <input maxLength={50} value={valores.curso} onChange={(e) => mudar('curso', e.target.value)} className="campo" />
            </Campo>
            <div className="sm:col-span-2">
              <p className="text-sm font-semibold text-marinho">Turno</p>
              <div className="mt-1 grid grid-cols-3 gap-1 rounded-xl bg-fundo p-1">
                {(Object.keys(ROTULOS_TURNO) as Turno[]).map((turno) => (
                  <button
                    key={turno}
                    type="button"
                    onClick={() => mudar('turno', turno)}
                    className={`rounded-lg py-2 text-sm font-bold transition-all duration-200 ${
                      valores.turno === turno ? 'bg-white text-laranja shadow-sm' : 'text-slate-500 hover:text-marinho'
                    }`}
                  >
                    {ROTULOS_TURNO[turno]}
                  </button>
                ))}
              </div>
            </div>
          </Secao>

          <Secao titulo="Endereço" icone="pino">
            <CamposEndereco
              valor={endereco}
              aoMudar={setEndereco}
              rotuloMapa="Localização da casa"
              areas={areas}
              rodapeMapa={<PreviaArea posicao={endereco.posicao} area={areaPrevista} />}
            />
          </Secao>

          <Secao titulo="Mensalidade" icone="relatorio">
            <Campo rotulo="Valor mensal">
              <CampoMoeda
                required
                valor={valores.valor_mensal === '' ? null : Number(valores.valor_mensal)}
                aoMudar={(v) => mudar('valor_mensal', v === null ? '' : String(v))}
              />
            </Campo>
            <Campo rotulo="Dia do vencimento">
              <input
                required
                type="number"
                min={1}
                max={28}
                value={valores.dia_vencimento}
                onChange={(e) => mudar('dia_vencimento', e.target.value)}
                className="campo"
              />
            </Campo>
          </Secao>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-100 bg-white px-6 py-4">
          <Botao type="button" variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" disabled={salvando}>
            {salvando ? 'Salvando...' : estudante ? 'Salvar alterações' : 'Cadastrar passageiro'}
          </Botao>
        </footer>
      </form>
    </Gaveta>
  )
}

function PreviaArea({ posicao, area }: { posicao: Coordenada | null; area: Area | null }) {
  if (!posicao) return <span className="font-semibold text-slate-400">Sem localização</span>
  if (!area)
    return <span className="rounded-full bg-amber-100 px-2.5 py-1 font-bold text-amber-800">Fora das áreas atendidas</span>
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-fundo px-2.5 py-1 font-bold text-marinho">
      <span className="h-2 w-2 rounded-full" style={{ background: corDoMotorista(area.fk_motorista) }} />
      Área {area.nome}
      {area.motorista && <span className="font-semibold text-slate-500">· {area.motorista.nome}</span>}
    </span>
  )
}

function Secao({ titulo, icone, children }: { titulo: string; icone: 'usuario' | 'escola' | 'pino' | 'relatorio'; children: ReactNode }) {
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

function Campo({ rotulo, opcional, className = '', children }: { rotulo: string; opcional?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={`block text-sm font-semibold text-marinho ${className}`}>
      {rotulo}
      {opcional && <span className="ml-1 text-xs font-normal text-slate-400">(opcional)</span>}
      {children}
    </label>
  )
}
