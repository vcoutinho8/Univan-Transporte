import { useCallback, useState } from 'react'

import Botao from './Button.tsx'
import type { NomeIcone } from './Icon.tsx'
import Modal from './Modal.tsx'

export type TipoAviso = 'sucesso' | 'erro' | 'aviso' | 'info'

export interface Aviso {
  tipo: TipoAviso
  titulo: string
  /** Frase principal, abaixo do título. */
  descricao?: string
  /** Detalhes em lista (ex.: rotas que não geraram viagem). */
  itens?: string[]
}

const ESTILO: Record<TipoAviso, { icone: NomeIcone; tom: 'verde' | 'vermelho' | 'laranja' | 'marinho' }> = {
  sucesso: { icone: 'ok', tom: 'verde' },
  erro: { icone: 'alerta', tom: 'vermelho' },
  aviso: { icone: 'alerta', tom: 'laranja' },
  info: { icone: 'relogio', tom: 'marinho' },
}

/** Modal de aviso: o jeito padrão de dar retorno ao usuário (sucesso, erro, atenção). */
export function ModalAviso({ aviso, aoFechar }: { aviso: Aviso; aoFechar: () => void }) {
  const estilo = ESTILO[aviso.tipo]
  return (
    <Modal
      titulo={aviso.titulo}
      descricao={aviso.descricao}
      icone={estilo.icone}
      tom={estilo.tom}
      aoFechar={aoFechar}
      acoes={<Botao onClick={aoFechar}>Entendi</Botao>}
    >
      {aviso.itens && aviso.itens.length > 0 && (
        <ul className="space-y-1.5 rounded-xl bg-fundo/60 px-4 py-3 text-sm text-marinho">
          {aviso.itens.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-slate-400">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

/**
 * Estado de aviso da tela: `mostrar(aviso)` abre o modal; `modal` é o elemento a renderizar.
 * Uso: const avisos = useAviso() … avisos.mostrar({ tipo: 'sucesso', titulo: '…' }) … {avisos.modal}
 */
export function useAviso() {
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const fechar = useCallback(() => setAviso(null), [])
  return {
    mostrar: setAviso,
    /** Atalho para erro de API: usa a mensagem já traduzida. */
    erro: (descricao: string, titulo = 'Não foi possível concluir') => setAviso({ tipo: 'erro', titulo, descricao }),
    modal: aviso ? <ModalAviso aviso={aviso} aoFechar={fechar} /> : null,
  }
}

interface PedidoConfirmacao {
  titulo: string
  descricao?: string
  /** Texto do botão que confirma (ex.: "Inativar"). */
  botao?: string
  /** Ação que apaga ou desliga algo: botão vermelho. */
  perigo?: boolean
  /** Pede um texto antes de confirmar (ex.: o nome de uma parada nova). */
  campo?: { rotulo: string; placeholder?: string }
}

/**
 * Confirmação no padrão do sistema (no lugar do confirm/prompt do navegador).
 * Uso: const confirmacao = useConfirmacao() … if (!(await confirmacao.confirmar({ titulo: 'Inativar?' }))) return
 * … const nome = await confirmacao.pedirTexto({ titulo: 'Nova parada', campo: { rotulo: 'Nome' } }) … {confirmacao.modal}
 */
export function useConfirmacao() {
  const [pedido, setPedido] = useState<(PedidoConfirmacao & { responder: (texto: string | null) => void }) | null>(null)
  const [texto, setTexto] = useState('')

  const perguntar = useCallback(
    (opcoes: PedidoConfirmacao) =>
      new Promise<string | null>((resolver) => {
        setTexto('')
        setPedido({
          ...opcoes,
          responder: (resposta) => {
            setPedido(null)
            resolver(resposta)
          },
        })
      }),
    [],
  )

  const modal = pedido ? (
    <Modal
      titulo={pedido.titulo}
      descricao={pedido.descricao}
      icone={pedido.perigo ? 'alerta' : pedido.campo ? 'editar' : 'ok'}
      tom={pedido.perigo ? 'vermelho' : 'laranja'}
      aoFechar={() => pedido.responder(null)}
      acoes={
        <>
          <Botao variante="secundario" onClick={() => pedido.responder(null)}>
            Cancelar
          </Botao>
          <Botao
            variante={pedido.perigo ? 'perigo' : 'primario'}
            disabled={Boolean(pedido.campo) && !texto.trim()}
            onClick={() => pedido.responder(pedido.campo ? texto.trim() : 'ok')}
          >
            {pedido.botao ?? 'Confirmar'}
          </Botao>
        </>
      }
    >
      {pedido.campo && (
        <label className="block text-sm font-semibold text-marinho">
          {pedido.campo.rotulo}
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && texto.trim() && pedido.responder(texto.trim())}
            placeholder={pedido.campo.placeholder}
            className="campo"
          />
        </label>
      )}
    </Modal>
  ) : null

  return {
    /** true se a pessoa confirmou. */
    confirmar: async (opcoes: PedidoConfirmacao) => (await perguntar(opcoes)) !== null,
    /** O texto digitado, ou null se cancelou. */
    pedirTexto: (opcoes: PedidoConfirmacao & { campo: { rotulo: string; placeholder?: string } }) => perguntar(opcoes),
    modal,
  }
}
