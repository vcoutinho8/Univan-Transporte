import { useState, type FormEvent } from 'react'

import { servicoConta } from '../../modules/configuracao/accountService.ts'
import Alerta from '../components/Alert.tsx'
import Botao from '../components/Button.tsx'
import Modal from '../components/Modal.tsx'
import { ErroApi } from '../services/api.ts'
import { useSessao } from './useSessao.ts'

/**
 * Primeiro acesso (ou senha resetada pelo gestor): a pessoa entrou com a senha padrão 123456 e
 * cria a dela antes de seguir. Não fecha sem trocar; dá para sair da conta.
 */
export default function TrocaDeSenhaObrigatoria() {
  const { usuario, atualizarUsuario, sair } = useSessao()
  const [nova, setNova] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  if (!usuario?.trocar_senha) return null

  async function salvar(e?: FormEvent) {
    e?.preventDefault()
    if (nova !== repetida) return setErro('As duas senhas não são iguais.')
    setSalvando(true)
    setErro(null)
    try {
      await servicoConta.alterarMinha({ senha_atual: '123456', senha_nova: nova })
      atualizarUsuario({ trocar_senha: false })
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagemCompleta : 'Não foi possível trocar a senha.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo={`Bem-vindo(a), ${usuario.nome.split(' ')[0]}!`}
      descricao="Você entrou com a senha padrão. Crie a sua senha para continuar."
      icone="cadeado"
      aoFechar={() => undefined}
      acoes={
        <>
          <Botao variante="secundario" onClick={sair}>
            Sair
          </Botao>
          <Botao disabled={salvando || nova.length < 6 || !repetida} onClick={() => void salvar()}>
            {salvando ? 'Salvando...' : 'Criar minha senha'}
          </Botao>
        </>
      }
    >
      <form onSubmit={(e) => void salvar(e)} className="space-y-3">
        {erro && <Alerta mensagem={erro} />}
        <label className="block text-sm font-semibold text-marinho">
          Nova senha <span className="font-normal text-slate-400">(mínimo 6)</span>
          <input type="password" autoFocus autoComplete="new-password" minLength={6} value={nova} onChange={(e) => setNova(e.target.value)} className="campo" />
        </label>
        <label className="block text-sm font-semibold text-marinho">
          Repita a nova senha
          <input type="password" autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} className="campo" />
        </label>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}
