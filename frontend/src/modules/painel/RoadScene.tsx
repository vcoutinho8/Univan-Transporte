import type { ReactNode } from 'react'

/**
 * Cena animada da faixa de boas-vindas: a van do UniVan na estrada, com a paisagem passando
 * em camadas (morros longe e devagar, prédios e coqueiros no meio, pontos de embarque perto e
 * rápido). De noite aparecem estrelas, lua e o farol aceso; de dia, o sol.
 * Tudo em SVG/CSS, sem imagem externa. Quem pede "reduzir movimento" vê a cena parada.
 */

export type Periodo = 'manha' | 'tarde' | 'noite'

export function periodoDoDia(hora = new Date().getHours()): Periodo {
  if (hora >= 5 && hora < 12) return 'manha'
  if (hora >= 12 && hora < 18) return 'tarde'
  return 'noite'
}

/** Céu atrás do conteúdo: estrelas e lua de noite, sol de dia. */
export function Ceu({ periodo }: { periodo: Periodo }) {
  if (periodo === 'noite') {
    return (
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {ESTRELAS.map(([x, y, atraso, tamanho], i) => (
          <span
            key={i}
            className="absolute animate-piscar rounded-full bg-white"
            style={{ left: `${x}%`, top: `${y}%`, width: tamanho, height: tamanho, animationDelay: `${atraso}s` }}
          />
        ))}
        <span className="absolute top-6 right-[38%] h-10 w-10 rounded-full bg-amber-50 shadow-[0_0_40px_10px_rgba(255,247,214,0.25)]">
          <span className="absolute top-1 right-0 h-8 w-8 rounded-full bg-marinho-escuro/80" />
        </span>
      </div>
    )
  }
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <span
        className={`absolute h-24 w-24 rounded-full blur-[2px] ${
          periodo === 'manha' ? 'top-5 right-[36%] bg-amber-200/80' : 'top-16 right-[30%] bg-orange-300/80'
        } shadow-[0_0_80px_30px_rgba(253,186,116,0.35)]`}
      />
    </div>
  )
}

// Posições fixas (não aleatórias a cada render): [x %, y %, atraso s, tamanho px].
const ESTRELAS: [number, number, number, number][] = [
  [8, 14, 0, 2], [15, 32, 1.2, 1.5], [24, 10, 2.1, 2], [31, 26, 0.6, 1.5], [42, 8, 1.8, 2], [47, 30, 2.6, 1.5],
  [55, 16, 0.3, 2], [63, 6, 1.5, 1.5], [70, 24, 2.3, 2], [78, 12, 0.9, 1.5], [86, 28, 1.9, 2], [93, 9, 0.4, 1.5],
  [36, 44, 2.8, 1.5], [59, 40, 1.1, 1.5], [88, 46, 2.4, 1.5], [4, 40, 1.6, 1.5],
]

export default function CenaEstrada({ periodo }: { periodo: Periodo }) {
  const noite = periodo === 'noite'
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 overflow-hidden" aria-hidden="true">
      {/* Morros ao longe */}
      <Camada classe="animate-rolar-lento bottom-8 h-20 text-white/[0.07]">
        <Morros />
      </Camada>
      {/* Cidade e coqueiros */}
      <Camada classe="animate-rolar-medio bottom-8 h-24 text-white/[0.12]">
        <Cidade />
      </Camada>

      {/* Estrada */}
      <div className="absolute inset-x-0 bottom-0 h-9 border-t border-white/10 bg-marinho-escuro/70">
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 animate-faixa bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.55)_0_28px,transparent_28px_56px)]" />
      </div>

      {/* Pontos de embarque passando rápido, na beira da pista */}
      <Camada classe="animate-rolar-rapido bottom-8 h-12 text-white">
        <PontosDeEmbarque />
      </Camada>

      {/* A van fica parada na tela: o mundo é que passa. */}
      <div className="absolute bottom-3 left-[12%] w-36 animate-sacolejo sm:left-[18%]">
        {noite && (
          <div className="absolute top-[22px] left-[128px] h-10 w-40 bg-[linear-gradient(90deg,rgba(255,244,190,0.55),transparent)] [clip-path:polygon(0_40%,100%_0,100%_100%,0_60%)]" />
        )}
        <Fumaca />
        <Van farolAceso={noite} />
      </div>
    </div>
  )
}

/** Duas cópias lado a lado, rolando metade da largura: a emenda fica invisível. */
function Camada({ classe, children }: { classe: string; children: ReactNode }) {
  return (
    <div className={`absolute left-0 flex w-[200%] ${classe}`}>
      <div className="h-full w-1/2">{children}</div>
      <div className="h-full w-1/2">{children}</div>
    </div>
  )
}

function Morros() {
  return (
    <svg viewBox="0 0 1200 80" preserveAspectRatio="none" className="h-full w-full" fill="currentColor">
      <path d="M0 80 V52 C80 30 150 22 230 40 C300 56 360 18 450 24 C540 30 580 60 680 46 C770 34 820 8 920 20 C1010 30 1080 56 1200 52 V80 Z" />
    </svg>
  )
}

function Cidade() {
  const predios: [number, number, number][] = [
    [40, 26, 46], [70, 20, 62], [94, 30, 38], [300, 24, 54], [328, 18, 70], [350, 28, 44], [380, 22, 58],
    [620, 26, 50], [650, 20, 66], [676, 32, 40], [900, 24, 60], [926, 18, 48], [1110, 28, 56], [1140, 22, 42],
  ]
  const coqueiros = [180, 230, 480, 520, 790, 840, 1010, 1180]
  return (
    <svg viewBox="0 0 1200 96" preserveAspectRatio="none" className="h-full w-full" fill="currentColor">
      {predios.map(([x, largura, altura]) => (
        <rect key={x} x={x} y={96 - altura} width={largura} height={altura} rx={2} />
      ))}
      {coqueiros.map((x) => (
        <g key={x} transform={`translate(${x} 96)`}>
          <path d="M0 0 C2 -18 6 -30 10 -42 L13 -41 C9 -29 6 -17 4 0 Z" />
          <path d="M11 -42 C0 -46 -10 -42 -16 -34 C-6 -40 4 -40 11 -40 Z" />
          <path d="M11 -42 C22 -48 32 -44 38 -36 C28 -42 18 -41 11 -40 Z" />
          <path d="M11 -42 C6 -54 -4 -58 -12 -56 C-2 -52 6 -48 11 -41 Z" />
          <path d="M11 -42 C18 -54 28 -58 36 -55 C26 -52 18 -48 12 -41 Z" />
        </g>
      ))}
    </svg>
  )
}

function PontosDeEmbarque() {
  const posicoes = [120, 520, 880]
  return (
    <svg viewBox="0 0 1200 48" preserveAspectRatio="xMidYMax meet" className="h-full w-full">
      {posicoes.map((x) => (
        <g key={x} transform={`translate(${x} 0)`}>
          <rect x={7} y={22} width={2} height={26} fill="rgba(255,255,255,0.5)" />
          <path d="M8 2 C2 2 -1 7 -1 11 C-1 17 8 25 8 25 C8 25 17 17 17 11 C17 7 14 2 8 2 Z" fill="#F2600C" />
          <circle cx={8} cy={11} r={3.2} fill="#fff" />
          {/* passageiro esperando */}
          <circle cx={26} cy={30} r={3.2} fill="rgba(255,255,255,0.75)" />
          <rect x={23} y={34} width={6} height={13} rx={3} fill="rgba(255,255,255,0.75)" />
        </g>
      ))}
    </svg>
  )
}

function Fumaca() {
  return (
    <div className="absolute top-[38px] -left-1">
      {[0, 0.45, 0.9].map((atraso) => (
        <span
          key={atraso}
          className="absolute h-3 w-3 animate-fumaca rounded-full bg-white/50"
          style={{ animationDelay: `${atraso}s` }}
        />
      ))}
    </div>
  )
}

function Roda({ cx }: { cx: number }) {
  return (
    <g transform={`translate(${cx} 50)`}>
      <circle r={9.5} fill="#1f2937" />
      <g className="animate-girar" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
        <circle r={5} fill="#cbd5e1" />
        {[0, 60, 120].map((angulo) => (
          <rect key={angulo} x={-0.8} y={-5} width={1.6} height={10} fill="#64748b" transform={`rotate(${angulo})`} />
        ))}
      </g>
      <circle r={1.6} fill="#1f2937" />
    </g>
  )
}

/** A van do UniVan, de lado, com o chapéu de formatura no teto. */
function Van({ farolAceso }: { farolAceso: boolean }) {
  return (
    <svg viewBox="0 0 140 64" className="relative w-full drop-shadow-[0_6px_8px_rgba(0,0,0,0.35)]">
      {/* chapéu de formatura */}
      <g transform="translate(52 2)">
        <path d="M0 6 L14 0 L28 6 L14 12 Z" fill="#102D40" />
        <path d="M6 8.5 V13 C10 15.5 18 15.5 22 13 V8.5 L14 12 Z" fill="#1B3C59" />
        <path d="M26 6.5 V12" stroke="#F2600C" strokeWidth={1.4} />
      </g>
      {/* carroceria */}
      <path d="M8 46 V24 Q8 14 18 14 H90 Q97 14 103 20 L118 33 Q131 35 132 42 V47 Q132 51 128 51 H12 Q8 51 8 47 Z" fill="#F2600C" />
      <path d="M8 40 H132" stroke="rgba(255,255,255,0.55)" strokeWidth={2.5} />
      {/* janelas */}
      <rect x={14} y={19} width={21} height={12} rx={2.5} fill="#DBEAFE" />
      <rect x={39} y={19} width={21} height={12} rx={2.5} fill="#DBEAFE" />
      <rect x={64} y={19} width={21} height={12} rx={2.5} fill="#DBEAFE" />
      <path d="M90 19 H99 L112 32 H90 Z" fill="#BFDBFE" />
      {/* passageiros nas janelas */}
      {[24, 49, 74].map((x) => (
        <circle key={x} cx={x} cy={27} r={3} fill="#1B3C59" opacity={0.55} />
      ))}
      <text x={47} y={38} fontSize={6} fontWeight={800} fill="#fff" letterSpacing={0.8}>
        UNIVAN
      </text>
      {/* faróis */}
      <circle cx={129} cy={39} r={2.6} fill={farolAceso ? '#FFF7C2' : '#FDE68A'} />
      <rect x={8} y={30} width={3} height={6} rx={1} fill="#EF4444" />
      <Roda cx={33} />
      <Roda cx={106} />
    </svg>
  )
}
