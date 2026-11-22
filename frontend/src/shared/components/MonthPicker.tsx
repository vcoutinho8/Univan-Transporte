import { dataIso } from '../utils/formatar.ts'
import Icone from './Icon.tsx'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** "2026-11-01" + 1 → "2026-12-01". */
export function mudarMes(competencia: string, delta: number): string {
  const [ano, mes] = competencia.split('-').map(Number)
  const d = new Date(ano, mes - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export const nomeDoMes = (competencia: string) => `${MESES[Number(competencia.slice(5, 7)) - 1]} de ${competencia.slice(0, 4)}`
const comMaiuscula = (texto: string) => texto[0].toUpperCase() + texto.slice(1)

/**
 * Escolha do mês: setas para o anterior e o próximo, o nome do mês abre o seletor nativo e "Mês
 * atual" volta para hoje. `ate` limita o futuro (ex.: o Financeiro não passa do mês corrente).
 */
export default function SeletorMes({ competencia, aoMudar, ate }: { competencia: string; aoMudar: (c: string) => void; ate?: string }) {
  const atual = `${dataIso().slice(0, 7)}-01`
  const noLimite = ate !== undefined && competencia >= ate
  const seta = 'grid h-9 w-9 place-items-center rounded-xl text-marinho transition-colors hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-30'
  return (
    <div className="flex items-center gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200/70">
      <button type="button" onClick={() => aoMudar(mudarMes(competencia, -1))} className={seta} aria-label="Mês anterior">
        <Icone nome="chevron" className="h-4 w-4 rotate-180" />
      </button>
      <label className="relative flex min-w-40 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-marinho hover:bg-fundo">
        <Icone nome="relogio" className="h-4 w-4 text-laranja" />
        {comMaiuscula(nomeDoMes(competencia))}
        <input
          type="month"
          aria-label="Escolher o mês"
          value={competencia.slice(0, 7)}
          max={ate?.slice(0, 7)}
          onClick={(e) => e.currentTarget.showPicker?.()}
          onChange={(e) => e.target.value && aoMudar(`${e.target.value}-01`)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <button type="button" disabled={noLimite} onClick={() => aoMudar(mudarMes(competencia, 1))} className={seta} aria-label="Próximo mês">
        <Icone nome="chevron" className="h-4 w-4" />
      </button>
      {competencia !== atual && (
        <button type="button" onClick={() => aoMudar(atual)} className="rounded-xl px-3 py-2 text-xs font-bold text-laranja hover:bg-laranja/10">
          Mês atual
        </button>
      )}
    </div>
  )
}
