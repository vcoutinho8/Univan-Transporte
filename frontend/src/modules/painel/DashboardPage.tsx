import { Link } from 'react-router-dom'

import Alerta from '../../shared/components/Alert.tsx'
import Cartao from '../../shared/components/Card.tsx'
import Icone from '../../shared/components/Icon.tsx'
import CabecalhoPagina from '../../shared/components/PageHeader.tsx'
import CartaoIndicador from '../../shared/components/StatCard.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import { ITENS_MENU } from '../../shared/layout/menu.ts'
import { servicoPainel } from './dashboardService.ts'
import type { ViagensDoDia } from './types.ts'

const SITUACOES_VIAGEM: { chave: keyof ViagensDoDia; rotulo: string; cor: string }[] = [
  { chave: 'agendada', rotulo: 'Agendadas', cor: 'bg-marinho' },
  { chave: 'em_andamento', rotulo: 'Em andamento', cor: 'bg-laranja' },
  { chave: 'concluida', rotulo: 'Concluídas', cor: 'bg-emerald-500' },
  { chave: 'cancelada', rotulo: 'Canceladas', cor: 'bg-slate-300' },
]

/** Tela inicial (RF5): indicadores da operação, viagens do dia e situação do sistema. */
export default function PaginaPainel() {
  const resumo = useRequisicao(() => servicoPainel.resumo())
  const saude = useRequisicao(() => servicoPainel.saude())
  const dados = resumo.dados

  const viagens = dados?.viagens_hoje
  const totalViagens = viagens ? Object.values(viagens).reduce((soma, n) => soma + n, 0) : 0
  const telasProntas = ITENS_MENU.filter((item) => item.pronto).length

  return (
    <>
      <CabecalhoPagina titulo="Painel" descricao="Visão geral da operação do transporte universitário." />

      {resumo.erro && (
        <div className="mb-6">
          <Alerta mensagem={resumo.erro} />
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoIndicador
          rotulo="Passageiros ativos"
          valor={dados?.estudantes_ativos}
          icone="passageiros"
          tom="laranja"
          detalhe="Estudantes com cadastro ativo"
        />
        <CartaoIndicador
          rotulo="Motoristas ativos"
          valor={dados?.motoristas_ativos}
          icone="motorista"
          tom="marinho"
          detalhe="Equipe disponível"
        />
        <CartaoIndicador
          rotulo="Veículos ativos"
          valor={dados?.veiculos_ativos}
          icone="van"
          tom="verde"
          detalhe="Ver a frota"
          para="/veiculos"
        />
        <CartaoIndicador
          rotulo="Rotas ativas"
          valor={dados?.rotas_ativas}
          icone="rota"
          tom="ambar"
          detalhe="Motorista + instituição + turno"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Cartao titulo="Viagens de hoje" className="lg:col-span-2">
          {totalViagens === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              {resumo.carregando ? 'Carregando...' : 'Nenhuma viagem gerada para hoje.'}
            </p>
          ) : (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-fundo">
                {SITUACOES_VIAGEM.map(({ chave, cor }) => (
                  <div key={chave} className={cor} style={{ width: `${((viagens?.[chave] ?? 0) / totalViagens) * 100}%` }} />
                ))}
              </div>
              <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {SITUACOES_VIAGEM.map(({ chave, rotulo, cor }) => (
                  <li key={chave}>
                    <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <span className={`h-2.5 w-2.5 rounded-full ${cor}`} />
                      {rotulo}
                    </p>
                    <p className="mt-1 text-2xl font-extrabold text-marinho tabular-nums">{viagens?.[chave] ?? 0}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Cartao>

        <Cartao titulo="Pontos de atenção">
          <ul className="space-y-3 text-sm">
            {!dados ? null : dados.estudantes_sem_area > 0 ? (
              <li className="flex gap-3 rounded-xl bg-amber-50 p-3 text-amber-800">
                <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>{dados.estudantes_sem_area}</strong> passageiro(s) sem área definida. O endereço não caiu
                  em nenhuma área de motorista.
                </span>
              </li>
            ) : (
              <li className="flex gap-3 rounded-xl bg-emerald-50 p-3 text-emerald-800">
                <Icone nome="ok" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Todos os passageiros têm área definida.</span>
              </li>
            )}
            <li className="flex items-center gap-3 rounded-xl bg-fundo p-3 text-slate-600">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  saude.dados?.banco === 'conectado' ? 'bg-emerald-500' : saude.carregando ? 'bg-slate-300' : 'bg-red-500'
                }`}
              />
              <span>
                {saude.carregando
                  ? 'Verificando conexão...'
                  : saude.erro
                    ? 'API fora do ar.'
                    : `API ok · banco ${saude.dados?.banco}`}
              </span>
            </li>
          </ul>
        </Cartao>
      </div>

      <Cartao titulo="Andamento do MVP" className="mt-6" acoes={<span className="text-sm text-slate-500">{telasProntas} de {ITENS_MENU.length} telas prontas</span>}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ITENS_MENU.map((item) => (
            <li key={item.para}>
              <Link
                to={item.para}
                className="flex items-center gap-3 rounded-xl p-3 ring-1 ring-slate-200/70 transition-colors hover:bg-fundo"
              >
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                    item.pronto ? 'bg-laranja/10 text-laranja' : 'bg-fundo text-slate-400'
                  }`}
                >
                  <Icone nome={item.icone} className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-marinho">{item.rotulo}</span>
                  <span className="text-xs text-slate-500">
                    {item.requisito} · {item.pronto ? 'Pronto' : 'Em breve'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Cartao>
    </>
  )
}
