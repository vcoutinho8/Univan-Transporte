"""Melhor ordem de paradas (o "problema do caixeiro viajante", em versão de caminho).

Como os apps de rota fazem na prática (Google Route Optimization, OR-Tools, Uber, iFood): ninguém
calcula a solução perfeita, que explode com muitas paradas. Usa-se:

1. uma matriz de tempos reais pelas ruas entre todos os pontos (aqui: OSRM `/table`);
2. uma solução inicial gulosa: o vizinho mais próximo;
3. melhorias locais até não melhorar mais: 2-opt (inverte um trecho, desfaz cruzamentos) e
   or-opt (tira uma parada e encaixa em outro lugar).

Com 5 a 30 paradas isso roda em milissegundos e fica, na prática, a poucos % do ótimo.

O caminho tem começo e fim opcionais e fixos (ex.: casa do motorista → passageiros → faculdade):
só a ordem do meio muda.
"""

from __future__ import annotations

import json
import logging
import urllib.request
from collections.abc import Callable, Sequence
from functools import lru_cache
from math import asin, cos, radians, sin, sqrt

log = logging.getLogger("univan.rotas")

Coordenada = tuple[float, float]  # (latitude, longitude)
Matriz = list[list[float]]  # segundos de i até j

# Sem o OSRM: linha reta x 1,35 (as ruas não são retas) a 32 km/h de média urbana.
FATOR_RUAS = 1.35
VELOCIDADE_KMH = 32.0


def distancia_km(a: Coordenada, b: Coordenada) -> float:
    lat1, lng1, lat2, lng2 = map(radians, (*a, *b))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lng2 - lng1) / 2) ** 2
    return 2 * 6371 * asin(sqrt(h))


def matriz_estimada(pontos: Sequence[Coordenada]) -> tuple[Matriz, Matriz]:
    """Tempos (s) e distâncias (km) estimados pela linha reta."""
    km = [[distancia_km(a, b) * FATOR_RUAS for b in pontos] for a in pontos]
    segundos = [[d / VELOCIDADE_KMH * 3600 for d in linha] for linha in km]
    return segundos, km


@lru_cache(maxsize=256)
def _osrm(url_base: str, chave: str) -> tuple[tuple[tuple[float, ...], ...], tuple[tuple[float, ...], ...]] | None:
    url = f"{url_base.rstrip('/')}/table/v1/driving/{chave}?annotations=duration,distance"
    try:
        with urllib.request.urlopen(url, timeout=6) as resposta:  # noqa: S310 (URL da configuração)
            corpo = json.load(resposta)
        if corpo.get("code") != "Ok":
            return None
        duracoes = tuple(tuple(float(v or 0) for v in linha) for linha in corpo["durations"])
        distancias = tuple(tuple(float(v or 0) / 1000 for v in linha) for linha in corpo["distances"])
        return duracoes, distancias
    except Exception as erro:  # sem rede, servidor fora, limite de uso...
        log.warning("OSRM indisponível (%s): usando a estimativa em linha reta.", erro)
        return None


def matriz_de_tempos(pontos: Sequence[Coordenada], url_osrm: str | None) -> tuple[Matriz, Matriz, bool]:
    """Tempos (s) e distâncias (km) pelas ruas; sem OSRM, a estimativa. O bool diz se é real."""
    if url_osrm and 1 < len(pontos) <= 100:
        chave = ";".join(f"{lng:.6f},{lat:.6f}" for lat, lng in pontos)
        real = _osrm(url_osrm, chave)
        if real is not None:
            return [list(l) for l in real[0]], [list(l) for l in real[1]], True
    segundos, km = matriz_estimada(pontos)
    return segundos, km, False


def custo_do_caminho(caminho: Sequence[int], custo: Callable[[int, int], float]) -> float:
    return sum(custo(a, b) for a, b in zip(caminho, caminho[1:]))


def melhor_caminho(
    paradas: Sequence[int],
    custo: Callable[[int, int], float],
    inicio: int | None = None,
    fim: int | None = None,
) -> list[int]:
    """Ordem das `paradas` (índices da matriz) que minimiza o custo de inicio → ... → fim.

    `inicio` e `fim` (se houver) ficam fixos e não entram no resultado.
    """
    restantes = list(dict.fromkeys(paradas))
    if len(restantes) <= 1:
        return restantes

    # 1. Vizinho mais próximo (sem início, começa pela parada mais distante do fim, ou pela primeira).
    if inicio is not None:
        atual = inicio
    elif fim is not None:
        atual = max(restantes, key=lambda p: custo(p, fim))
    else:
        atual = restantes[0]
    ordem: list[int] = []
    if inicio is None:
        ordem.append(atual)
        restantes.remove(atual)
    while restantes:
        proxima = min(restantes, key=lambda p: custo(atual, p))
        ordem.append(proxima)
        restantes.remove(proxima)
        atual = proxima

    def total(seq: list[int]) -> float:
        completo = ([inicio] if inicio is not None else []) + seq + ([fim] if fim is not None else [])
        return custo_do_caminho(completo, custo)

    # 2. Melhorias locais até estabilizar.
    melhor = total(ordem)
    melhorou = True
    while melhorou:
        melhorou = False
        # 2-opt: inverter o trecho i..j
        for i in range(len(ordem) - 1):
            for j in range(i + 1, len(ordem)):
                candidata = ordem[:i] + ordem[i : j + 1][::-1] + ordem[j + 1 :]
                valor = total(candidata)
                if valor + 1e-9 < melhor:
                    ordem, melhor, melhorou = candidata, valor, True
        # or-opt: mover uma parada para outra posição
        for i in range(len(ordem)):
            for j in range(len(ordem)):
                if i == j:
                    continue
                candidata = ordem[:i] + ordem[i + 1 :]
                candidata.insert(j, ordem[i])
                valor = total(candidata)
                if valor + 1e-9 < melhor:
                    ordem, melhor, melhorou = candidata, valor, True
    return ordem
