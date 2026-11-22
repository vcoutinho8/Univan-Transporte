import type { NomeIcone } from '../../shared/components/Icon.tsx'

export type CategoriaRelatorio = 'Passageiros' | 'Viagens' | 'Calendário' | 'Frequência' | 'Frota e motoristas' | 'Financeiro'

export interface DefinicaoRelatorio {
  /** Também é o endereço: /relatorios/<id>. */
  id: string
  titulo: string
  descricao: string
  icone: NomeIcone
  categoria: CategoriaRelatorio
  /** `false` = aparece no catálogo como "Em breve". */
  disponivel: boolean
}

/** Ordem das seções no catálogo. */
export const CATEGORIAS: CategoriaRelatorio[] = ['Passageiros', 'Viagens', 'Calendário', 'Frequência', 'Frota e motoristas', 'Financeiro']

/**
 * Todos os relatórios do módulo, prontos ou planejados. Para lançar um relatório novo: crie o
 * componente, registre-o em ReportViewPage.tsx e troque `disponivel` para `true`.
 */
export const RELATORIOS: DefinicaoRelatorio[] = [
  // ---------------------------------------------------------------- Passageiros
  {
    id: 'passageiros-ativos',
    titulo: 'Passageiros ativos',
    descricao: 'Matriculados e ativos, por instituição, turno e bairro, com presenças e faltas no período.',
    icone: 'passageiros',
    categoria: 'Passageiros',
    disponivel: true,
  },
  {
    id: 'historico-passageiro',
    titulo: 'Histórico do passageiro',
    descricao: 'Dia a dia de um passageiro: ida e volta, presença, avisos e horário de embarque.',
    icone: 'chamada',
    categoria: 'Passageiros',
    disponivel: false,
  },
  {
    id: 'faltas-sem-aviso',
    titulo: 'Faltas sem aviso',
    descricao: 'Quem mais falta sem avisar, para conversar com o passageiro.',
    icone: 'alerta',
    categoria: 'Passageiros',
    disponivel: false,
  },

  // ---------------------------------------------------------------- Viagens
  {
    id: 'viagens-periodo',
    titulo: 'Viagens por período',
    descricao: 'Total de viagens por situação, rota, turno, motorista e sentido.',
    icone: 'mala',
    categoria: 'Viagens',
    disponivel: false,
  },
  {
    id: 'pontualidade',
    titulo: 'Pontualidade',
    descricao: 'Saída real comparada com o horário previsto, com atraso médio por rota e motorista.',
    icone: 'relogio',
    categoria: 'Viagens',
    disponivel: false,
  },
  {
    id: 'ocupacao',
    titulo: 'Ocupação dos veículos',
    descricao: 'Média de passageiros presentes por viagem dividida pela capacidade do veículo.',
    icone: 'van',
    categoria: 'Viagens',
    disponivel: false,
  },
  {
    id: 'substituicoes',
    titulo: 'Substituições',
    descricao: 'Viagens feitas com motorista ou veículo diferente do cadastro da rota.',
    icone: 'troca',
    categoria: 'Viagens',
    disponivel: false,
  },

  // ---------------------------------------------------------------- Frequência
  {
    id: 'frequencia-passageiro',
    titulo: 'Frequência por passageiro',
    descricao: 'Presenças, faltas sem aviso, avisos de "não vou" e percentual de presença.',
    icone: 'tendencia',
    categoria: 'Frequência',
    disponivel: false,
  },
  {
    id: 'frequencia-rota',
    titulo: 'Frequência por rota e turno',
    descricao: 'Quais rotas, turnos e instituições têm mais ausências.',
    icone: 'rota',
    categoria: 'Frequência',
    disponivel: false,
  },
  {
    id: 'avisos-nao-vou',
    titulo: 'Antecedência dos avisos',
    descricao: 'Quanto tempo antes da saída cada passageiro avisa que não vai.',
    icone: 'relogio',
    categoria: 'Frequência',
    disponivel: false,
  },

  // ---------------------------------------------------------------- Frota e motoristas
  {
    id: 'cnh-vencendo',
    titulo: 'CNH vencendo',
    descricao: 'Motoristas com CNH vencida ou vencendo nos próximos 30 ou 60 dias.',
    icone: 'cnh',
    categoria: 'Frota e motoristas',
    disponivel: false,
  },
  {
    id: 'dias-sem-aula',
    titulo: 'Dias sem aula',
    descricao: 'Feriados, recessos e férias acadêmicas do período, com os dias úteis sem viagem.',
    icone: 'viagem',
    categoria: 'Calendário',
    disponivel: true,
  },

  // ---------------------------------------------------------------- Financeiro
  {
    id: 'inadimplentes',
    titulo: 'Inadimplentes',
    descricao: 'Mensalidades em aberto e vencidas, com dias de atraso.',
    icone: 'dinheiro',
    categoria: 'Financeiro',
    disponivel: false,
  },
  {
    id: 'resultado-mes',
    titulo: 'Resultado do mês',
    descricao: 'Receitas menos despesas por competência.',
    icone: 'relatorio',
    categoria: 'Financeiro',
    disponivel: false,
  },
]

export const buscarRelatorio = (id: string | undefined) => RELATORIOS.find((r) => r.id === id)
