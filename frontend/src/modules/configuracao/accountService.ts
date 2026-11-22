import type { Perfil } from '../../shared/auth/sessao.ts'
import { requisitar } from '../../shared/services/api.ts'
import type { DadosEndereco, Endereco } from '../endereco/types.ts'

/** Usuário na tela de Configurações (o admin vê todos). */
export interface UsuarioDetalhe {
  id: number
  nome: string
  login: string
  perfil: Perfil
  fk_empresa: number
  fk_motorista: number | null
  email: string | null
  cpf: string | null
  status: 'ativo' | 'inativo'
  ultimo_acesso: string | null
}

/** A conta de quem está logado. Do motorista, o CPF e a casa vêm do cadastro dele. */
export interface MinhaConta extends UsuarioDetalhe {
  endereco: Endereco | null
}

export interface DadosUsuario {
  nome?: string
  login?: string
  senha?: string
  perfil?: Perfil
  fk_motorista?: number | null
  email?: string | null
  cpf?: string | null
  status?: 'ativo' | 'inativo'
}

export const servicoConta = {
  minha: () => requisitar<MinhaConta>('/usuarios/eu'),
  /** E-mail, senha (com a atual) e, motorista, a casa. O CPF não muda por aqui. */
  alterarMinha: (dados: { email?: string | null; senha_atual?: string; senha_nova?: string; endereco?: DadosEndereco }) =>
    requisitar<MinhaConta>('/usuarios/eu', { metodo: 'PATCH', corpo: dados }),

  // Só o admin:
  listar: () => requisitar<UsuarioDetalhe[]>('/usuarios'),
  criar: (dados: DadosUsuario & { nome: string; login: string; senha: string; perfil: Perfil }) =>
    requisitar<UsuarioDetalhe>('/usuarios', { metodo: 'POST', corpo: dados }),
  alterar: (id: number, dados: DadosUsuario) => requisitar<UsuarioDetalhe>(`/usuarios/${id}`, { metodo: 'PUT', corpo: dados }),
}
