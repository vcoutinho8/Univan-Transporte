/** Formato padrão dos erros devolvidos pela API (ver backend/app/config/erros.py). */
export interface RespostaErroApi {
  mensagem: string
  erros?: { campo: string; mensagem: string }[]
}

export type StatusCadastro = 'ativo' | 'inativo'
