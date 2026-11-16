import { describe, expect, it } from 'vitest'

import { simplificar } from './osmService.ts'
import type { Coordenada } from './types.ts'

describe('simplificação do contorno do bairro', () => {
  // Círculo com 400 pontos: o contorno de um bairro no OSM costuma vir pesado assim.
  const circulo: Coordenada[] = Array.from({ length: 400 }, (_, i) => {
    const angulo = (i / 400) * 2 * Math.PI
    return [-20.67 + 0.01 * Math.sin(angulo), -40.5 + 0.01 * Math.cos(angulo)]
  })

  it('reduz até caber no limite sem deformar a forma', () => {
    const resultado = simplificar(circulo, 60)
    expect(resultado.length).toBeLessThanOrEqual(60)
    expect(resultado.length).toBeGreaterThanOrEqual(8)
    for (const [lat, lng] of resultado) {
      expect(Math.hypot(lat + 20.67, lng + 40.5)).toBeCloseTo(0.01, 3) // continua no círculo
    }
  })

  it('não mexe no que já cabe, só arredonda para 6 casas', () => {
    const triangulo: Coordenada[] = [
      [-20.1234567, -40.1],
      [-20.2, -40.2],
      [-20.3, -40.1],
    ]
    expect(simplificar(triangulo, 60)).toEqual([
      [-20.123457, -40.1],
      [-20.2, -40.2],
      [-20.3, -40.1],
    ])
  })
})
