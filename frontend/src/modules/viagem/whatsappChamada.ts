import { formatarData, formatarHorario } from '../../shared/utils/formatar.ts'
import { ROTULOS_TURNO } from '../estudante/types.ts'
import type { Motorista } from '../motorista/types.ts'
import type { Veiculo } from '../veiculo/types.ts'
import type { ResumoJornada } from './tripGrouping.ts'
import type { Chamada, ViagemDetalhe } from './types.ts'

export interface PassageiroMensagem {
  nome: string
  horario: string | null
  bairro: string
}

export interface DadosMensagemChamada {
  jornada: ResumoJornada
  detalhes: ViagemDetalhe[]
  motoristaCompleto?: Motorista | null
  veiculosCompletos?: Veiculo[]
}

function formatarLinhaPassageiro(p: PassageiroMensagem, indice: number): string {
  const horario = p.horario ? formatarHorario(p.horario) : null
  const info = [horario, p.bairro].filter(Boolean).join(' · ')
  return `${indice + 1}. ${p.nome}${info ? ` _(${info})_` : ''}`
}

function extrairPassageiro(chamada: Chamada): PassageiroMensagem {
  return {
    nome: chamada.estudante.nome,
    horario: chamada.horario_previsto,
    bairro: chamada.estudante.endereco.bairro,
  }
}

/**
 * Monta o texto formatado da chamada para compartilhamento em grupos do WhatsApp,
 * listando apenas os passageiros previstos para irem no dia (excluindo quem avisou que não vai).
 */
export function montarMensagemChamada({
  jornada,
  detalhes,
  motoristaCompleto,
  veiculosCompletos = [],
}: DadosMensagemChamada): string {
  const ida = jornada.chave.sentido === 'ida'
  const turnoTexto = ROTULOS_TURNO[jornada.chave.turno].toUpperCase()
  const sentidoTexto = ida ? 'IDA' : 'VOLTA'
  const dataFormatada = formatarData(jornada.chave.data)

  const apelido = motoristaCompleto?.apelido?.trim()
  const nomeMotorista = apelido
    ? `${jornada.motorista.nome} ("${apelido}")`
    : jornada.motorista.nome

  const mapaVeiculos = new Map(veiculosCompletos.map((v) => [v.id, v]))
  const descricoesVeiculos = jornada.veiculos.map((v) => {
    const completo = mapaVeiculos.get(v.id)
    const cor = completo?.cor ?? motoristaCompleto?.veiculo?.cor ?? null
    return `${v.modelo}${cor ? ` (${cor})` : ''} · Placa ${v.placa}`
  })

  const viagensAtivas = jornada.viagens.filter((v) => v.status !== 'cancelada')
  const destinos = [...new Set(viagensAtivas.map((v) => v.rota.instituicao.nome))]
  const saidaPrevista = jornada.horario_previsto ? formatarHorario(jornada.horario_previsto) : 'Não definida'

  const viagensAtivasIds = new Set(viagensAtivas.map((v) => v.id))
  const passageirosPrevistos = detalhes
    .filter((d) => viagensAtivasIds.has(d.id))
    .flatMap((d) => d.chamadas)
    .filter((c) => c.status !== 'nao_vai')
    .sort(
      (a, b) =>
        (a.horario_previsto ?? '99').localeCompare(b.horario_previsto ?? '99') ||
        a.estudante.nome.localeCompare(b.estudante.nome, 'pt-BR'),
    )
    .map(extrairPassageiro)

  const linhas: string[] = [
    `🚐 *CHAMADA UNIVAN — ${turnoTexto} (${sentidoTexto})*`,
    `📅 *Data:* ${dataFormatada}`,
    `👨‍✈️ *Motorista:* ${nomeMotorista}`,
    `🚘 *Veículo:* ${descricoesVeiculos.join(' / ')}`,
    `🏫 *Destino(s):* ${destinos.join(', ') || 'Nenhum destino ativo'}`,
    `⏰ *Saída prevista:* ${saidaPrevista}`,
    '',
    `👥 *PASSAGEIROS PREVISTOS (${passageirosPrevistos.length}):*`,
    ...(passageirosPrevistos.length > 0
      ? passageirosPrevistos.map(formatarLinhaPassageiro)
      : ['_Nenhum passageiro previsto para esta viagem._']),
  ]

  return linhas.join('\n')
}

/** Abre o WhatsApp (App ou Web) com a mensagem preenchida para o usuário selecionar o grupo. */
export function abrirWhatsAppComMensagem(mensagem: string): void {
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(mensagem)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}