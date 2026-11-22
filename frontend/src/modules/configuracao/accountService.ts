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
  /** Ainda com a senha padrão (não entrou para trocar). */
  trocar_senha: boolean
}

/** A conta de quem está logado. Do motorista, o CPF e a casa vêm do cadastro dele. */
export interface MinhaConta extends UsuarioDetalhe {
  endereco: Endereco | null
}

/** Novo acesso: o login é o CPF (o do motorista vem do cadastro dele) e a senha começa 123456. */
export interface NovoUsuario {
  nome: string
  perfil: Perfil
  cpf?: string | null
  fk_motorista?: number | null
  email?: string | null
}

export const servicoConta = {
  minha: () => requisitar<MinhaConta>('/usuarios/eu'),
  /** Nome e CPF (menos o motorista), e-mail, senha (com a atual) e, motorista, a casa. */
  alterarMinha: (dados: {
    nome?: string
    cpf?: string | null
    email?: string | null
    senha_atual?: string
    senha_nova?: string
    endereco?: DadosEndereco
  }) => requisitar<MinhaConta>('/usuarios/eu', { metodo: 'PATCH', corpo: dados }),

  // Só o gestor:
  listar: () => requisitar<UsuarioDetalhe[]>('/usuarios'),
  criar: (dados: NovoUsuario) => requisitar<UsuarioDetalhe>('/usuarios', { metodo: 'POST', corpo: dados }),
  alterar: (id: number, dados: { nome?: string; cpf?: string | null; status?: 'ativo' | 'inativo' }) =>
    requisitar<UsuarioDetalhe>(`/usuarios/${id}`, { metodo: 'PUT', corpo: dados }),
  /** Volta para a senha padrão (123456); a pessoa cria a dela no próximo login. */
  resetarSenha: (id: number) => requisitar<UsuarioDetalhe>(`/usuarios/${id}/resetar-senha`, { metodo: 'POST' }),
}
