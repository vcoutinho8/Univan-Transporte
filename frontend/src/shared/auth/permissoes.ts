import type { Perfil } from './sessao.ts'

/**
 * O que cada perfil pode fazer na tela (a API confere de novo: aqui só escondemos o que não pode).
 *
 * - admin: tudo, menos a tela "Minha rota" (é do motorista).
 * - auxiliar: apoio ao admin. Vê e cadastra, mas não edita nem inativa cadastros; viagens só
 *   visualiza; mapa e rotas, calendário, chamadas e relatórios com acesso total.
 * - motorista: as próprias viagens (iniciar, embarque e desembarque), as próprias chamadas e a
 *   tela "Minha rota".
 */
export type Acao =
  | 'cadastro.editar' // editar, inativar e reativar passageiros, motoristas e veículos
  | 'viagem.gerar' // gerar o dia, cancelar destino, trocar motorista/veículo
  | 'viagem.operar' // iniciar, embarcar, desembarcar, concluir

const ACOES: Record<Acao, Perfil[]> = {
  'cadastro.editar': ['admin'],
  'viagem.gerar': ['admin'],
  'viagem.operar': ['admin', 'motorista'],
}

/** Telas (caminho do menu) que cada perfil abre. */
const TELAS: Record<string, Perfil[]> = {
  '/': ['admin', 'auxiliar'],
  '/passageiros': ['admin', 'auxiliar'],
  '/motoristas': ['admin', 'auxiliar'],
  '/veiculos': ['admin', 'auxiliar'],
  '/mapa': ['admin', 'auxiliar'],
  '/viagens': ['admin', 'auxiliar', 'motorista'],
  '/calendario': ['admin', 'auxiliar'],
  '/chamadas': ['admin', 'auxiliar', 'motorista'],
  '/relatorios': ['admin', 'auxiliar'],
  '/minha-rota': ['motorista'],
  '/configuracoes': ['admin', 'auxiliar', 'motorista'],
}

export const pode = (perfil: Perfil | undefined, acao: Acao) => Boolean(perfil && ACOES[acao].includes(perfil))

/** Se o perfil abre a tela do caminho (subcaminhos herdam: /relatorios/x segue /relatorios). */
export function abreTela(perfil: Perfil | undefined, caminho: string): boolean {
  if (!perfil) return false
  const base = caminho === '/' ? '/' : `/${caminho.split('/').filter(Boolean)[0] ?? ''}`
  const permitidos = TELAS[base]
  return permitidos ? permitidos.includes(perfil) : true
}

/** Tela inicial de cada perfil depois de entrar. */
export const telaInicial = (perfil: Perfil) => (perfil === 'motorista' ? '/minha-rota' : '/')

export const ROTULOS_PERFIL: Record<Perfil, string> = {
  admin: 'Administrador',
  auxiliar: 'Auxiliar',
  motorista: 'Motorista',
}
