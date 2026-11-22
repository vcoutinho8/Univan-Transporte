"""O banco de demonstração (scripts/dados_demo.py) fica coerente: chaves, documentos e empresa."""

import sqlite3
import sys
from datetime import datetime
from pathlib import Path

from app.config.configuracoes import RAIZ_PROJETO
from app.shared.documentos import cnpj_valido, cpf_valido


def test_dados_de_demonstracao_coerentes(monkeypatch):
    monkeypatch.chdir(RAIZ_PROJETO)
    monkeypatch.setattr(sys, "path", [str(RAIZ_PROJETO / "scripts"), *sys.path])
    from dados_demo import popular

    c = sqlite3.connect(":memory:")
    c.executescript(Path("docs/univan-sqlite.sql").read_text(encoding="utf-8"))
    popular(c, agora=datetime(2026, 11, 18, 10, 0))
    q = lambda sql: c.execute(sql).fetchall()  # noqa: E731

    assert q("PRAGMA foreign_key_check") == []
    assert all(cnpj_valido(cnpj) for (cnpj,) in q("SELECT cnpj FROM empresa"))
    cpfs = [cpf for (cpf,) in q("SELECT cpf FROM estudante UNION ALL SELECT cpf FROM motorista UNION ALL SELECT cpf FROM usuario WHERE cpf IS NOT NULL")]
    assert all(map(cpf_valido, cpfs)) and len(cpfs) == len(set(cpfs))
    assert q("SELECT fk_empresa, count(*) FROM estudante GROUP BY 1") == [(1, 15), (2, 12)]
    assert q("SELECT fk_empresa, perfil, count(*) FROM usuario WHERE perfil <> 'univan' GROUP BY 1, 2") == [
        (1, "admin", 1), (1, "auxiliar", 2), (1, "motorista", 2), (2, "admin", 1), (2, "auxiliar", 2), (2, "motorista", 2)]
    # Nada aponta para um registro de outra empresa.
    for filho, pai, chave in (("estudante", "area", "fk_area"), ("estudante", "instituicao", "fk_instituicao"), ("rota", "motorista", "fk_motorista"),
                              ("viagem", "rota", "fk_rota"), ("chamada", "estudante", "fk_estudante"), ("titulo_receber", "estudante", "fk_estudante")):
        assert q(f"SELECT count(*) FROM {filho} f JOIN {pai} p ON p.id = f.{chave} WHERE f.fk_empresa <> p.fk_empresa") == [(0,)], (filho, pai)
    assert q("SELECT count(*) FROM viagem WHERE status = 'concluida'")[0][0] > 100
    assert q("SELECT count(DISTINCT competencia) FROM assinatura_pagamento") == [(6,)]
