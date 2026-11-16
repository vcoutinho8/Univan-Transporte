/** Endereço (tabela `endereco`), como devolvido pela API (EnderecoResposta). */
export interface Endereco {
  id: number
  cep: string
  logradouro: string
  numero: string | null
  complemento: string | null
  bairro: string
  cidade: string
  estado: string
  latitude: number | null
  longitude: number | null
}

/** Endereço enviado nos cadastros (EnderecoEntrada): sem id. */
export type DadosEndereco = Omit<Endereco, 'id'>
