import { useState } from 'react'

import type { DiaDaSemana } from './types.ts'

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function diaCurto(iso: string) {
  const [a, m, d] = iso.split('-').map(Number)
  return { semana: DIAS[new Date(a, m - 1, d).getDay()], dia: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}` }
}

/** Topo "redondo" do eixo: 0, 5, 10, 20, 50, 100... acima do maior valor. */
function topoDaEscala(maior: number) {
  if (maior <= 4) return 4
  const passo = 10 ** Math.floor(Math.log10(maior))
  const topo = Math.ceil(maior / passo) * passo
  return topo % 2 === 0 ? topo : topo + passo // par: a linha do meio fica num número inteiro
}

/**
 * Passageiros transportados por dia, nos últimos 7 dias: uma barra por dia (uma série só, sem
 * legenda). Passando o mouse (ou o foco do teclado) numa barra, o balão mostra presentes, faltas,
 * avisos e viagens. Há uma tabela equivalente para leitores de tela.
 */
export default function GraficoSemana({ dias, hoje }: { dias: DiaDaSemana[]; hoje: string }) {
  const [ativo, setAtivo] = useState<number | null>(null)
  const topo = topoDaEscala(Math.max(...dias.map((d) => d.presentes), 0))
  const linhas = [0, 0.5, 1].map((f) => Math.round(topo * f))
  const total = dias.reduce((s, d) => s + d.presentes, 0)
  const registrados = dias.reduce((s, d) => s + d.presentes + d.ausentes, 0)
  const presenca = registrados ? Math.round((total / registrados) * 100) : null
  const indiceHoje = dias.findIndex((d) => d.data === hoje)

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <p className="text-3xl font-extrabold tracking-tight text-marinho tabular-nums">{total}</p>
          <p className="text-xs font-semibold text-slate-500">passageiros transportados em 7 dias</p>
        </div>
        {presenca !== null && (
          <div>
            <p className="text-3xl font-extrabold tracking-tight text-marinho tabular-nums">{presenca}%</p>
            <p className="text-xs font-semibold text-slate-500">de presença (embarcou ÷ registrados)</p>
          </div>
        )}
      </div>

      <div className="relative h-48" role="img" aria-label={`Passageiros transportados por dia: ${dias.map((d) => `${diaCurto(d.data).dia} ${d.presentes}`).join(', ')}`}>
        {/* Grade discreta com os valores do eixo */}
        {linhas.map((v) => (
          <div key={v} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${(v / topo) * 100}%` }}>
            <span className="w-6 -translate-y-1/2 text-right text-[10px] text-slate-400 tabular-nums">{v}</span>
            <span className={`h-px flex-1 ${v === 0 ? 'bg-slate-300' : 'bg-slate-100'}`} />
          </div>
        ))}

        <div className="absolute inset-y-0 right-0 left-8 grid grid-cols-7 gap-[2px]">
          {dias.map((d, i) => {
            const altura = topo ? (d.presentes / topo) * 100 : 0
            const eHoje = i === indiceHoje
            const { semana, dia } = diaCurto(d.data)
            return (
              <button
                key={d.data}
                type="button"
                onMouseEnter={() => setAtivo(i)}
                onMouseLeave={() => setAtivo(null)}
                onFocus={() => setAtivo(i)}
                onBlur={() => setAtivo(null)}
                aria-label={`${semana} ${dia}: ${d.presentes} transportados`}
                className="group relative flex h-full flex-col justify-end px-[18%] outline-none"
              >
                <span
                  className={`block w-full rounded-t-[4px] transition-all duration-500 ${
                    ativo === i ? 'bg-[#d94f08]' : eHoje ? 'bg-laranja' : 'bg-laranja/80'
                  } ${d.presentes === 0 ? 'h-[2px] rounded-none bg-slate-200' : ''}`}
                  style={d.presentes ? { height: `${altura}%` } : undefined}
                />
                {eHoje && d.presentes > 0 && ativo === null && (
                  <span
                    className="absolute left-1/2 -translate-x-1/2 text-xs font-extrabold text-marinho tabular-nums"
                    style={{ bottom: `calc(${altura}% + 4px)` }}
                  >
                    {d.presentes}
                  </span>
                )}
                {ativo === i && (
                  <span
                    className={`pointer-events-none absolute z-10 w-44 rounded-xl bg-marinho p-3 text-left text-xs text-white shadow-xl ${
                      i >= dias.length - 2 ? 'right-0' : i <= 1 ? 'left-0' : 'left-1/2 -translate-x-1/2'
                    }`}
                    style={{ bottom: `calc(${Math.max(altura, 8)}% + 10px)` }}
                  >
                    <span className="block font-bold capitalize">
                      {semana}, {dia}
                    </span>
                    <span className="mt-1.5 flex justify-between">
                      <span className="text-white/70">Transportados</span>
                      <strong className="tabular-nums">{d.presentes}</strong>
                    </span>
                    <span className="flex justify-between">
                      <span className="text-white/70">Faltaram</span>
                      <span className="tabular-nums">{d.ausentes}</span>
                    </span>
                    <span className="flex justify-between">
                      <span className="text-white/70">Avisaram que não iam</span>
                      <span className="tabular-nums">{d.nao_vai}</span>
                    </span>
                    {d.pendentes > 0 && (
                      <span className="flex justify-between">
                        <span className="text-white/70">A registrar</span>
                        <span className="tabular-nums">{d.pendentes}</span>
                      </span>
                    )}
                    <span className="mt-1 flex justify-between border-t border-white/15 pt-1">
                      <span className="text-white/70">Viagens</span>
                      <span className="tabular-nums">{d.viagens}</span>
                    </span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-2 ml-8 grid grid-cols-7 gap-[2px] text-center">
        {dias.map((d, i) => {
          const { semana, dia } = diaCurto(d.data)
          return (
            <span key={d.data} className={`text-[11px] leading-tight ${i === indiceHoje ? 'font-extrabold text-marinho' : 'text-slate-500'}`}>
              <span className="block capitalize">{i === indiceHoje ? 'Hoje' : semana}</span>
              <span className="block text-slate-400">{dia}</span>
            </span>
          )
        })}
      </div>

      {/* A mesma informação em tabela, para leitores de tela */}
      <table className="sr-only">
        <caption>Passageiros por dia nos últimos 7 dias</caption>
        <thead>
          <tr>
            <th>Dia</th>
            <th>Transportados</th>
            <th>Faltaram</th>
            <th>Avisaram</th>
            <th>Viagens</th>
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => (
            <tr key={d.data}>
              <td>{diaCurto(d.data).dia}</td>
              <td>{d.presentes}</td>
              <td>{d.ausentes}</td>
              <td>{d.nao_vai}</td>
              <td>{d.viagens}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
