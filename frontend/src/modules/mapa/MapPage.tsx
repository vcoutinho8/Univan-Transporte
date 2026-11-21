import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import Alerta from '../../shared/components/Alert.tsx'
import Icone, { type NomeIcone } from '../../shared/components/Icon.tsx'
import CabecalhoPagina from '../../shared/components/PageHeader.tsx'
import { useRequisicao } from '../../shared/hooks/useRequest.ts'
import AbaBairros from '../area/AreasTab.tsx'
import { servicoArea } from '../area/areaService.ts'
import type { Area } from '../area/types.ts'
import { servicoEstudante } from '../estudante/studentService.ts'
import type { Estudante } from '../estudante/types.ts'
import { servicoInstituicao } from '../instituicao/institutionService.ts'
import type { Instituicao } from '../instituicao/types.ts'
import { servicoMotorista } from '../motorista/driverService.ts'
import type { Motorista } from '../motorista/types.ts'
import AbaRotas from '../rota/RoutesTab.tsx'
import { servicoRota } from '../rota/routeService.ts'
import type { Rota } from '../rota/types.ts'
import AbaGeral from './GeneralTab.tsx'
import { ContextoMapa, type DadosMapa } from './mapContext.tsx'
import { MapaBase } from './MapLayers.tsx'
import { coordenadaDo } from './mapUtils.ts'

type Aba = 'geral' | 'rotas' | 'bairros'

const ABAS: { chave: Aba; rotulo: string; icone: NomeIcone; descricao: string }[] = [
  { chave: 'geral', rotulo: 'Visão geral', icone: 'mapa', descricao: 'Onde mora cada passageiro e os bairros de cada motorista.' },
  { chave: 'rotas', rotulo: 'Rotas', icone: 'rota', descricao: 'Cada rota com os passageiros na ordem de embarque até a faculdade.' },
  { chave: 'bairros', rotulo: 'Bairros', icone: 'camadas', descricao: 'Contorno dos bairros no mapa e o motorista de cada um.' },
]

// Referências fixas para "ainda sem dados" (um [] novo a cada render recarregaria as buscas).
const SEM_AREAS: Area[] = []
const SEM_ESTUDANTES: Estudante[] = []
const SEM_INSTITUICOES: Instituicao[] = []
const SEM_MOTORISTAS: Motorista[] = []
const SEM_ROTAS: Rota[] = []

/**
 * Tela "Mapa e rotas" (RF4 + RF6): um mapa só, com três abas.
 * - Visão geral: passageiros, bairros e faculdades;
 * - Rotas: cadastro das rotas e a sequência de embarque de cada uma;
 * - Bairros: contorno dos bairros (clicar no bairro ou desenhar) e motorista responsável.
 * A aba e o que está aberto ficam na URL (?aba=rotas&rota=3), então os links funcionam.
 */
export default function PaginaMapa() {
  const [parametros, setParametros] = useSearchParams()
  const abaUrl = parametros.get('aba')
  const aba: Aba = ABAS.find((a) => a.chave === abaUrl)?.chave ?? 'geral'
  const [painel, setPainel] = useState<HTMLElement | null>(null)

  const areas = useRequisicao(() => servicoArea.listar())
  const estudantes = useRequisicao(() => servicoEstudante.listar({ status: 'ativo' }))
  const instituicoes = useRequisicao(() => servicoInstituicao.listar())
  const motoristas = useRequisicao(() => servicoMotorista.listar({ status: 'ativo' }))
  const rotas = useRequisicao(() => servicoRota.listar())
  const erro = areas.erro ?? estudantes.erro ?? rotas.erro ?? instituicoes.erro ?? motoristas.erro

  const recarregarAreas = areas.recarregar
  const recarregarEstudantes = estudantes.recarregar
  const recarregarRotas = rotas.recarregar
  const recarregar = useCallback(async () => {
    // Salvar bairro ou rota muda quem está em cada área e em cada rota: recarrega os três.
    await Promise.all([recarregarAreas(), recarregarEstudantes(), recarregarRotas()])
  }, [recarregarAreas, recarregarEstudantes, recarregarRotas])

  const dados = useMemo<DadosMapa>(() => {
    const todasAreas = areas.dados ?? SEM_AREAS
    const ativos = estudantes.dados ?? SEM_ESTUDANTES
    return {
      areas: todasAreas,
      ativas: todasAreas.filter((a) => a.status === 'ativo'),
      estudantes: ativos,
      comLocal: ativos.filter((e) => coordenadaDo(e) !== null),
      instituicoes: instituicoes.dados ?? SEM_INSTITUICOES,
      motoristas: motoristas.dados ?? SEM_MOTORISTAS,
      rotas: rotas.dados ?? SEM_ROTAS,
      carregando: areas.carregando || estudantes.carregando || rotas.carregando,
      recarregar,
      recarregarInstituicoes: instituicoes.recarregar,
    }
  }, [
    areas.dados,
    estudantes.dados,
    instituicoes.dados,
    motoristas.dados,
    rotas.dados,
    areas.carregando,
    estudantes.carregando,
    rotas.carregando,
    recarregar,
    instituicoes.recarregar,
  ])

  const abaAtual = ABAS.find((a) => a.chave === aba)!

  return (
    <ContextoMapa.Provider value={{ dados, painel }}>
      <CabecalhoPagina
        titulo="Mapa e rotas"
        descricao={abaAtual.descricao}
        acoes={
          <nav
            className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200/70"
            aria-label="Abas"
          >
            {ABAS.map((item) => (
              <button
                key={item.chave}
                onClick={() => setParametros({ aba: item.chave })}
                aria-current={item.chave === aba ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all duration-200 ${
                  item.chave === aba ? 'bg-laranja text-white shadow-md shadow-laranja/30' : 'text-marinho hover:bg-fundo'
                }`}
              >
                <Icone nome={item.icone} className="h-4 w-4" />
                {item.rotulo}
              </button>
            ))}
          </nav>
        }
      />

      {erro && (
        <div className="mb-4">
          <Alerta mensagem={erro} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        {/* As abas mandam o painel delas para cá (PainelLateral). */}
        <div ref={setPainel} className="space-y-4 lg:h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-1" />

        <div className="relative overflow-hidden rounded-2xl shadow-sm ring-1 ring-slate-200/70">
          <MapaBase className="h-[70vh] min-h-[420px] lg:h-[calc(100vh-8rem)]">
            {aba === 'geral' && <AbaGeral />}
            {aba === 'rotas' && <AbaRotas />}
            {aba === 'bairros' && <AbaBairros />}
          </MapaBase>

          <div className="pointer-events-none absolute bottom-4 left-4 z-[500] flex flex-wrap gap-3 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-600 shadow-md backdrop-blur">
            <Legenda classe="bg-laranja" rotulo="Passageiro" />
            <Legenda classe="bg-yellow-500" rotulo="Fora dos bairros" />
            <Legenda classe="bg-marinho" rotulo="Faculdade" />
          </div>
        </div>
      </div>
    </ContextoMapa.Provider>
  )
}

function Legenda({ classe, rotulo }: { classe: string; rotulo: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${classe}`} />
      {rotulo}
    </span>
  )
}
