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
    titulo: 'UniVan',
    itens: [
      { para: '/univan', rotulo: 'Painel', icone: 'painel', requisito: 'SaaS', descricao: 'Gestores ativos e pagamentos da assinatura.', pronto: true },
      { para: '/univan/gestores', rotulo: 'Gestores', icone: 'empresa', requisito: 'SaaS', descricao: 'Empresas que assinam o app.', pronto: true },
      { para: '/univan/pagamentos', rotulo: 'Pagamentos', icone: 'dinheiro', requisito: 'SaaS', descricao: 'Assinatura de cada gestor, mês a mês.', pronto: true },
    ],
  },
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
        pronto: true,
      },
      {
        para: '/motoristas',
        rotulo: 'Motoristas',
        icone: 'motorista',
        requisito: 'RF2',
        descricao: 'Cadastro de motoristas com CNH, validade da CNH e veículo padrão.',
        pronto: true,
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
        para: '/minha-rota',
        rotulo: 'Minha rota',
        icone: 'navegar',
        requisito: 'RF3 · RF6',
        descricao: 'A viagem do motorista no mapa: próxima parada, navegação e embarque.',
        pronto: true,
      },
      {
        para: '/mapa',
        rotulo: 'Mapa e rotas',
        icone: 'mapa',
        requisito: 'RF4 · RF6',
        descricao:
          'Um mapa só com três abas: visão geral dos passageiros, rotas com a sequência de embarque e o desenho dos bairros.',
        pronto: true,
      },
      {
        para: '/viagens',
        rotulo: 'Viagens',
        icone: 'mala',
        requisito: 'RF3',
        descricao: 'Criação e consulta das viagens por data e turno, com início e encerramento.',
        pronto: true,
      },
      {
        para: '/calendario',
        rotulo: 'Calendário',
        icone: 'viagem',
        requisito: 'RF3',
        descricao: 'Feriados, recessos e férias acadêmicas: nesses dias não há viagem.',
        pronto: true,
      },
      {
        para: '/chamadas',
        rotulo: 'Chamadas',
        icone: 'megafone',
        requisito: 'RF3',
        descricao: 'Aviso prévio: quem vai e quem avisou que não vai em cada viagem do dia.',
        pronto: true,
      },
    ],
  },
  {
    titulo: 'Acompanhamento',
    itens: [
      {
        para: '/financas',
        rotulo: 'Financeiro',
        icone: 'dinheiro',
        requisito: 'RF7',
        descricao: 'Mensalidades dos passageiros (a receber) e gastos com motoristas, veículos e outros (a pagar).',
        pronto: true,
      },
      {
        para: '/relatorios',
        rotulo: 'Relatórios',
        icone: 'relatorio',
        requisito: 'RF5',
        descricao: 'Passageiros matriculados e ativos, por instituição, turno, bairro e rota.',
        pronto: true,
      },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [
      {
        para: '/configuracoes',
        rotulo: 'Configurações',
        icone: 'engrenagem',
        requisito: 'RF1',
        descricao: 'Minha conta (e-mail, senha) e, para o administrador, usuários e instituições.',
        pronto: true,
      },
    ],
  },
]

export const ITENS_MENU = MENU.flatMap((grupo) => grupo.itens)
