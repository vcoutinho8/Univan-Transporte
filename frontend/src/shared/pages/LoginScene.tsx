import { useId } from 'react'

interface Propriedades {
  /** Faixa baixa (celular), enquadrada só na van e na estrada. */
  compacta?: boolean
  /** Acelera a estrada (usuário digitando ou entrando). */
  acelerando?: boolean
}

/**
 * Cena do login: a van laranja vindo de frente pela estrada de linhas laranja, com os faróis
 * acesos. Com o mouse em cima, a cena mexe de leve (parallax, pelas variáveis --px/--py do
 * elemento pai). Só SVG + CSS; com "reduzir movimento" ligado no sistema, tudo fica parado.
 */
export default function CenaVanNaEstrada({ compacta = false, acelerando = false }: Propriedades) {
  // IDs únicos: a página pode ter duas cenas (celular e notebook) e os gradientes não podem colidir.
  const base = `cena${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const id = (nome: string) => `${base}-${nome}`
  const url = (nome: string) => `url(#${id(nome)})`

  const fx = 200 // ponto de fuga
  const fy = 228
  const faixas: [number, number, string][] = [
    [-120, 1.5, '1.6s'],
    [40, 3, '1.1s'],
    [130, 2, '1.3s'],
    [270, 2, '1.3s'],
    [360, 3, '1.1s'],
    [520, 1.5, '1.6s'],
  ]

  return (
    <svg
      viewBox={compacta ? '0 200 400 240' : '0 0 400 520'}
      preserveAspectRatio="xMidYMid slice"
      className={`h-full w-full ${acelerando ? 'login-rapido' : ''}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id('ceu')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b2233" />
          <stop offset="0.55" stopColor="#1B3C59" />
          <stop offset="1" stopColor="#102D40" />
        </linearGradient>
        <linearGradient id={id('chao')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#102D40" />
          <stop offset="1" stopColor="#0b2233" />
        </linearGradient>
        <linearGradient id={id('linha')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2600c" stopOpacity="0" />
          <stop offset="0.35" stopColor="#f2600c" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ff8a45" />
        </linearGradient>
        <linearGradient id={id('corpo')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff9a5a" />
          <stop offset="0.55" stopColor="#f2600c" />
          <stop offset="1" stopColor="#d94f08" />
        </linearGradient>
        <linearGradient id={id('lateral')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9550b" />
          <stop offset="1" stopColor="#a63d07" />
        </linearGradient>
        <linearGradient id={id('vidro')} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#2d5d80" />
          <stop offset="1" stopColor="#0b2233" />
        </linearGradient>
        <linearGradient id={id('farol')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ffe8a3" />
        </linearGradient>
        <linearGradient id={id('feixe')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6d5" stopOpacity="0.4" />
          <stop offset="0.3" stopColor="#fff3c4" stopOpacity="0.2" />
          <stop offset="1" stopColor="#fff3c4" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id('brilho')}>
          <stop offset="0" stopColor="#f2600c" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f2600c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('halo')}>
          <stop offset="0" stopColor="#fff3c4" stopOpacity="0.8" />
          <stop offset="1" stopColor="#fff3c4" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Céu, estrelas, brilho no horizonte e cidade (mexem pouco com o mouse) */}
      <rect width="400" height="520" fill={url('ceu')} />
      <g className="login-parallax-fundo">
        {[
          [40, 40], [96, 92], [150, 30], [250, 60], [318, 34], [362, 110], [70, 150], [330, 170], [205, 120],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.6 : 1} fill="#fff" className="login-estrela" style={{ animationDelay: `${i * 0.4}s` }} />
        ))}
        <ellipse cx={fx} cy={fy} rx="230" ry="70" fill={url('brilho')} />
        <g fill="#ffffff" opacity="0.07">
          <rect x="18" y="190" width="22" height="38" />
          <rect x="44" y="172" width="16" height="56" />
          <rect x="64" y="200" width="26" height="28" />
          <rect x="96" y="182" width="14" height="46" />
          <rect x="286" y="186" width="18" height="42" />
          <rect x="308" y="168" width="14" height="60" />
          <rect x="326" y="196" width="28" height="32" />
          <rect x="358" y="180" width="20" height="48" />
        </g>
      </g>

      {/* Estrada: linhas laranja correndo em direção a quem olha */}
      <rect y={fy} width="400" height={520 - fy} fill={url('chao')} />
      <line x1="0" y1={fy} x2="400" y2={fy} stroke="#f2600c" strokeOpacity="0.5" strokeWidth="1" />
      <path d={`M${fx - 6} ${fy} L-60 520 L460 520 L${fx + 6} ${fy} Z`} fill="#0b2233" opacity="0.55" />
      <line x1={fx - 6} y1={fy} x2="-60" y2="520" stroke={url('linha')} strokeWidth="4" strokeLinecap="round" />
      <line x1={fx + 6} y1={fy} x2="460" y2="520" stroke={url('linha')} strokeWidth="4" strokeLinecap="round" />
      {faixas.map(([x, largura, duracao]) => (
        <line
          key={x}
          x1={fx + (x - fx) * 0.02}
          y1={fy}
          x2={x}
          y2="520"
          stroke={url('linha')}
          strokeWidth={largura}
          strokeLinecap="round"
          className="login-faixa"
          style={{ animationDuration: duracao }}
        />
      ))}
      <line x1={fx} y1={fy} x2={fx} y2="520" stroke="#ff8a45" strokeWidth="5" strokeLinecap="round" className="login-faixa login-faixa-centro" />

      <g className="login-parallax-van">
        {/* Sombra no chão */}
        <ellipse cx="200" cy="412" rx="118" ry="11" fill="#000" opacity="0.45" className="login-sombra" />

        {/* A van, de frente */}
        <g className="login-van">
          {/* Rodas */}
          <rect x="118" y="382" width="30" height="32" rx="8" fill="#081722" />
          <rect x="252" y="382" width="30" height="32" rx="8" fill="#081722" />

          {/* Retrovisores */}
          <path d="M138 302 L120 298" stroke="#1B3C59" strokeWidth="3" strokeLinecap="round" />
          <path d="M262 302 L280 298" stroke="#1B3C59" strokeWidth="3" strokeLinecap="round" />
          <rect x="104" y="284" width="17" height="28" rx="6" fill={url('lateral')} />
          <rect x="279" y="284" width="17" height="28" rx="6" fill={url('lateral')} />
          <rect x="107" y="288" width="11" height="10" rx="3" fill="#2d5d80" opacity="0.8" />
          <rect x="282" y="288" width="11" height="10" rx="3" fill="#2d5d80" opacity="0.8" />

          {/* Carroceria */}
          <path
            d="M134 270 Q136 256 152 255 L248 255 Q264 256 266 270 L282 350 Q286 362 286 376 L286 396 Q286 404 278 404 L122 404 Q114 404 114 396 L114 376 Q114 362 118 350 Z"
            fill={url('corpo')}
          />
          {/* Laterais em perspectiva (mais escuras) */}
          <path d="M134 270 L118 350 Q114 362 114 376 L114 396 Q114 404 122 404 L127 404 L127 376 Q127 362 131 351 L145 274 Z" fill={url('lateral')} />
          <path d="M266 270 L282 350 Q286 362 286 376 L286 396 Q286 404 278 404 L273 404 L273 376 Q273 362 269 351 L255 274 Z" fill={url('lateral')} />
          {/* Teto (pega a luz) e luzes de teto */}
          <path d="M136 266 Q138 256 152 255 L248 255 Q262 256 264 266 Z" fill="#ffb07a" />
          {[186, 200, 214].map((x) => (
            <circle key={x} cx={x} cy="261" r="2" fill="#ffe08a" />
          ))}

          {/* Para-brisa, reflexos e limpadores */}
          <path d="M147 276 Q149 268 160 268 L240 268 Q251 268 253 276 L263 328 Q264 336 256 336 L144 336 Q136 336 137 328 Z" fill={url('vidro')} />
          <path d="M156 330 L184 272 L200 272 L172 330 Z" fill="#fff" opacity="0.12" />
          <path d="M180 330 L204 280 L211 280 L187 330 Z" fill="#fff" opacity="0.08" />
          <path d="M160 333 L194 326 M206 333 L240 326" stroke="#081722" strokeWidth="2" strokeLinecap="round" />

          {/* Vinco do capô */}
          <path d="M132 343 Q200 337 268 343" stroke="#ffb07a" strokeWidth="2" fill="none" opacity="0.7" />

          {/* Faróis de LED (alongados) com brilho */}
          <ellipse cx="146" cy="357" rx="28" ry="14" fill={url('halo')} className="login-farol" />
          <ellipse cx="254" cy="357" rx="28" ry="14" fill={url('halo')} className="login-farol" />
          <path d="M123 350 L170 353 Q172 362 163 364 L127 362 Q119 358 123 350 Z" fill={url('farol')} />
          <path d="M277 350 L230 353 Q228 362 237 364 L273 362 Q281 358 277 350 Z" fill={url('farol')} />
          <path d="M127 352 L166 355" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <path d="M273 352 L234 355" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />

          {/* Grade com o emblema (capelo) */}
          <rect x="174" y="349" width="52" height="24" rx="8" fill="#1B3C59" />
          <path d="M180 356 H220 M180 362 H220 M180 368 H220" stroke="#2c5577" strokeWidth="2" strokeLinecap="round" />
          <circle cx="200" cy="361" r="8" fill="#f2600c" stroke="#ffffff" strokeWidth="1.5" />
          <polygon points="200,356 206,359 200,362 194,359" fill="#ffffff" />
          <rect x="197" y="360" width="6" height="3" rx="1" fill="#ffffff" />

          {/* Para-choque, faróis de neblina e placa */}
          <path d="M116 380 L284 380 L284 392 Q284 399 277 399 L123 399 Q116 399 116 392 Z" fill="#1B3C59" />
          <rect x="150" y="392" width="100" height="4" rx="2" fill="#0b2233" />
          <circle cx="133" cy="388" r="4" fill="#ffe8a3" />
          <circle cx="267" cy="388" r="4" fill="#ffe8a3" />
          <rect x="178" y="381" width="44" height="12" rx="2" fill="#ffffff" />
          <text x="200" y="390.5" textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#1B3C59" letterSpacing="1">
            UNIVAN
          </text>

          {/* Feixes saindo dos faróis, por cima da van, abrindo em direção à estrada */}
          <g className="login-farol" style={{ mixBlendMode: 'screen' }}>
            <path d="M123 351 L168 356 L130 520 L-40 520 Z" fill={url('feixe')} />
            <path d="M277 351 L232 356 L270 520 L440 520 Z" fill={url('feixe')} />
          </g>

          {/* Capelo da marca no teto */}
          <rect x="184" y="244" width="32" height="12" rx="3" fill="#0b2233" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="1.5" />
          <polygon points="200,224 240,238 200,252 160,238" fill="#0b2233" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="1.5" />
          <path d="M236 239 L236 254" stroke="#f2b705" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="236" cy="257" r="3.5" fill="#f2b705" />
        </g>
      </g>
    </svg>
  )
}
