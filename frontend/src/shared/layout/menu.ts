import type { NomeIcone } from '../components/Icon.tsx'

/**
 * Menu lateral do sistema, organizado pelos requisitos do documento do MVP (docs/documentacao-mvp.pdf).
 *
 * `pronto: false` indica uma tela ainda não construída: o item aparece no menu com a etiqueta
 * "Em breve" e a rota abre a PaginaEmConstrucao, explicando o que a tela vai fazer.
 * Quando a tela ficar pronta, troque para `pronto: true` e registre a página em App.tsx.
 */
export interface ItemMenu {
  para: string
  rotulo: string
  icone: NomeIcone
  requisito: string
  descricao: string
  pronto: boolean
}

export interface GrupoMenu {
  titulo: string
  itens: ItemMenu[]
}

export const MENU: GrupoMenu[] = [
  {
    titulo: 'Geral',
    itens: [
      {
        para: '/',
        rotulo: 'Painel',
        icone: 'painel',
        requisito: 'RF5',
        descricao: 'Visão geral da operação: frota, passageiros, rotas e viagens do dia.',
        pronto: true,
      },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      {
        para: '/passageiros',
        rotulo: 'Passageiros',
        icone: 'passageiros',
        requisito: 'RF2',
        descricao:
          'Cadastro, edição, consulta e desativação de passageiros, com instituição, turno e ponto de embarque.',
        pronto: false,
      },
      {
        para: '/motoristas',
        rotulo: 'Motoristas',
        icone: 'motorista',
        requisito: 'RF2',
        descricao: 'Cadastro de motoristas com CNH, validade da CNH e veículo padrão.',
        pronto: false,
      },
      {
        para: '/veiculos',
        rotulo: 'Veículos',
        icone: 'van',
        requisito: 'RF2',
        descricao: 'Vans, micro-ônibus e ônibus da frota.',
        pronto: true,
      },
    ],
  },
  {
    titulo: 'Operação',
    itens: [
      {
        para: '/rotas',
        rotulo: 'Rotas',
        icone: 'rota',
        requisito: 'RF4',
        descricao: 'Pontos de embarque, sequência das paradas, horários previstos e motorista/veículo de cada rota.',
        pronto: false,
      },
      {
        para: '/viagens',
        rotulo: 'Viagens',
        icone: 'viagem',
        requisito: 'RF3',
        descricao: 'Criação e consulta das viagens por data e turno, com início e encerramento.',
        pronto: false,
      },
      {
        para: '/chamadas',
        rotulo: 'Chamadas',
        icone: 'chamada',
        requisito: 'RF3',
        descricao:
          'Lista de passageiros esperados em cada viagem, com registro de presença, ausência e ocorrências.',
        pronto: false,
      },
    ],
  },
  {
    titulo: 'Acompanhamento',
    itens: [
      {
        para: '/mapa',
        rotulo: 'Mapa',
        icone: 'mapa',
        requisito: 'RF6',
        descricao: 'Pontos de embarque em mapa interativo (Leaflet + OpenStreetMap) e sequência das paradas.',
        pronto: false,
      },
      {
        para: '/relatorios',
        rotulo: 'Relatórios',
        icone: 'relatorio',
        requisito: 'RF5',
        descricao: 'Passageiros atendidos, ausências e viagens por período, rota e turno.',
        pronto: false,
      },
    ],
  },
]

export const ITENS_MENU = MENU.flatMap((grupo) => grupo.itens)
