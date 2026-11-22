"""Dados de demonstração do UniVan (rodado pelo scripts/1-banco.sh depois do docs/univan-sqlite.sql).

O SQL de docs/ é também a base dos testes; aqui ele vira um banco "de verdade" para usar e testar a
separação por empresa (tenant):

- 2 empresas (Guarapari Vans e Rota Certa), cada uma com o gestor (login = CNPJ), 2 auxiliares e
  2 motoristas (login = CPF), 2 veículos, os 10 bairros do mapa divididos entre os motoristas, as
  faculdades UVV, UniSales e Multivix Vila Velha e 15 / 12 passageiros;
- rotas por motorista, faculdade e turno; viagens e chamadas das últimas 3 semanas (relatórios e
  gráficos) e as da semana atual;
- financeiro de 4 meses (mensalidades, salários, combustível, manutenção e outros), com alguns
  inadimplentes; assinatura do app de 6 meses (gráfico do gerente UniVan, login "univan").

Senha de todos: 123456. As datas são relativas ao dia em que o banco é criado.
"""

import random
import re
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

SENHA = "scrypt$16384$8$1$univan-admin-01$uiMAQHd0guiOGqg11klLmR2229/aDuPBl4OxQIWrTUk="  # 123456
ROTINAS = Path("docs/univan-sqlite-rotinas.sql")

# Faculdades que ficam (ids do SQL de docs/) e o nome curto usado nas rotas.
FACULDADES = {1: "UVV", 2: "UniSales", 3: "Multivix"}
# Bairros (ids das áreas do SQL) de cada um dos 2 motoristas de uma empresa.
BAIRROS = ({1, 6, 3, 5, 9}, {2, 7, 4, 8, 10})
# Passageiros do SQL (com endereço e bairro) que vão para cada empresa.
PASSAGEIROS = {1: [1, 11, 12, 13, 15, 7, 2, 16, 18, 3, 21, 22, 4, 27, 39], 2: [14, 19, 25, 30, 31, 32, 24, 33, 36, 37, 5, 34]}
EMPRESAS = {
    1: {"motoristas": (1, 2), "veiculos": (1, 2), "email": "gestor.guarapari@exemplo.com.br",
        "auxiliares": [("Paula Mendes", "400000001"), ("Rafael Duarte", "400000002")]},
    2: {"motoristas": (3, 4), "veiculos": (3, 4), "email": "gestor.rotacerta@exemplo.com.br",
        "auxiliares": [("Camila Teixeira", "400000003"), ("Diego Nunes", "400000004")]},
}
HORARIOS = {  # (faculdade, turno) -> (saída da ida, saída da volta)
    (1, "noite"): ("18:00:00", "22:40:00"), (2, "noite"): ("18:10:00", "22:30:00"), (3, "noite"): ("18:15:00", "22:30:00"),
    (1, "manha"): ("06:30:00", "12:10:00"), (2, "manha"): ("06:40:00", "12:00:00"), (3, "manha"): ("06:50:00", "12:00:00"),
}


def cpf_com_digitos(base9: str) -> str:
    numeros = [int(d) for d in base9]
    for tamanho in (9, 10):
        soma = sum(n * (tamanho + 1 - i) for i, n in enumerate(numeros[:tamanho]))
        numeros.append((soma * 10 % 11) % 10)
    return "".join(map(str, numeros))


def rotina(nome: str) -> list[str]:
    """Comandos de uma rotina de docs/univan-sqlite-rotinas.sql (mesma leitura do backend)."""
    texto = ROTINAS.read_text(encoding="utf-8")
    partes = re.split(r"^-- (\w+)\(.*\)\s*$", texto, flags=re.MULTILINE)
    corpo = dict(zip(partes[1::2], partes[2::2]))[nome]
    sql = "\n".join(linha for linha in corpo.splitlines() if not linha.lstrip().startswith("--"))
    return [c.strip() for c in sql.split(";") if c.strip()]


def mes(d: date, deslocamento: int = 0) -> date:
    total = d.year * 12 + d.month - 1 + deslocamento
    return date(total // 12, total % 12 + 1, 1)


def popular(c: sqlite3.Connection, agora: datetime | None = None) -> None:
    agora = agora or datetime.now().replace(microsecond=0)
    hoje = agora.date()
    sorteio = random.Random(2026)
    c.execute("PRAGMA foreign_keys = OFF")

    # ---------------------------------------------------------------- limpa o que vai ser refeito
    estudantes_sql = {r[0]: r for r in c.execute("SELECT * FROM estudante")}
    areas_sql = {r[0]: r for r in c.execute("SELECT id, nome, coordenadas FROM area")}
    c.executescript("""
        DELETE FROM chamada; DELETE FROM viagem; DELETE FROM rota_dia; DELETE FROM rota;
        DELETE FROM titulo_receber; DELETE FROM titulo_pagar; DELETE FROM assinatura_pagamento;
        DELETE FROM estudante; DELETE FROM area; DELETE FROM usuario;
        DELETE FROM dia_sem_aula WHERE fk_empresa IS NOT NULL OR fk_instituicao IS NOT NULL;
        DELETE FROM instituicao_parada WHERE fk_instituicao NOT IN (1, 2, 3);
        DELETE FROM instituicao WHERE id NOT IN (1, 2, 3);
        DELETE FROM motorista WHERE id > 4; DELETE FROM veiculo WHERE id > 4;
        DELETE FROM empresa WHERE id > 2;
        UPDATE empresa SET status = 'ativa', motivo_inativacao = NULL, valor_assinatura = 199.90;
    """)

    c.execute("INSERT INTO usuario (fk_empresa, nome, login, senha_hash, perfil, status, trocar_senha) VALUES (1, 'Gerente UniVan', 'univan', ?, 'univan', 'ativo', 0)", (SENHA,))
    instituicoes: dict[tuple[int, int], int] = {}  # (empresa, faculdade do SQL) -> id
    for empresa, cfg in EMPRESAS.items():
        nome_fantasia, cnpj = c.execute("SELECT nome_fantasia, cnpj FROM empresa WHERE id = ?", (empresa,)).fetchone()
        m1, m2 = cfg["motoristas"]

        # ------------------------------------------------------------ frota e acessos
        for motorista, veiculo in zip(cfg["motoristas"], cfg["veiculos"]):
            c.execute("UPDATE veiculo SET fk_empresa = ?, status = 'ativo' WHERE id = ?", (empresa, veiculo))
            c.execute("UPDATE motorista SET fk_empresa = ?, fk_veiculo = ?, status = 'ativo' WHERE id = ?", (empresa, veiculo, motorista))
        c.execute(
            "INSERT INTO usuario (fk_empresa, nome, login, senha_hash, perfil, status, email, trocar_senha) VALUES (?, ?, ?, ?, 'admin', 'ativo', ?, 0)",
            (empresa, nome_fantasia, cnpj, SENHA, cfg["email"]),
        )
        for nome, base in cfg["auxiliares"]:
            cpf = cpf_com_digitos(base)
            email = nome.lower().replace(" ", ".") + "@exemplo.com.br"
            c.execute(
                "INSERT INTO usuario (fk_empresa, nome, login, senha_hash, perfil, status, email, cpf, trocar_senha) VALUES (?, ?, ?, ?, 'auxiliar', 'ativo', ?, ?, 0)",
                (empresa, nome, cpf, SENHA, email, cpf),
            )
        for motorista in cfg["motoristas"]:
            nome, cpf = c.execute("SELECT nome, cpf FROM motorista WHERE id = ?", (motorista,)).fetchone()
            c.execute(
                "INSERT INTO usuario (fk_empresa, nome, login, senha_hash, perfil, fk_motorista, status, trocar_senha) VALUES (?, ?, ?, ?, 'motorista', ?, 'ativo', 0)",
                (empresa, nome, cpf, SENHA, motorista),
            )

        # ------------------------------------------------------------ faculdades (cada empresa tem as suas)
        for faculdade in FACULDADES:
            if empresa == 1:
                c.execute("UPDATE instituicao SET fk_empresa = 1 WHERE id = ?", (faculdade,))
                instituicoes[(empresa, faculdade)] = faculdade
                continue
            (id_endereco,) = c.execute(
                "INSERT INTO endereco (cep, logradouro, numero, complemento, bairro, cidade, estado, latitude, longitude) "
                "SELECT cep, logradouro, numero, complemento, bairro, cidade, estado, latitude, longitude FROM endereco "
                "WHERE id = (SELECT fk_endereco FROM instituicao WHERE id = ?) RETURNING id", (faculdade,)
            ).fetchone()
            (novo,) = c.execute(
                "INSERT INTO instituicao (nome, fk_endereco, parada_latitude, parada_longitude, codigo_inep, fk_empresa) "
                "SELECT nome, ?, parada_latitude, parada_longitude, codigo_inep, ? FROM instituicao WHERE id = ? RETURNING id",
                (id_endereco, empresa, faculdade),
            ).fetchone()
            c.execute("INSERT INTO instituicao_parada (fk_instituicao, nome, latitude, longitude) SELECT ?, nome, latitude, longitude FROM instituicao_parada WHERE fk_instituicao = ?", (novo, faculdade))
            instituicoes[(empresa, faculdade)] = novo

        # ------------------------------------------------------------ bairros: os mesmos polígonos, divididos entre os 2 motoristas
        areas: dict[int, int] = {}  # área do SQL -> área da empresa
        for id_sql, nome, coordenadas in areas_sql.values():
            motorista = m1 if id_sql in BAIRROS[0] else m2
            (areas[id_sql],) = c.execute(
                "INSERT INTO area (nome, coordenadas, fk_motorista, status, fk_empresa) VALUES (?, ?, ?, 'ativo', ?) RETURNING id",
                (nome, coordenadas, motorista, empresa),
            ).fetchone()

        # ------------------------------------------------------------ passageiros
        for ordem, id_sql in enumerate(PASSAGEIROS[empresa]):
            e = estudantes_sql[id_sql]
            faculdade = e[6] if e[6] in FACULDADES else (e[6] - 1) % 3 + 1
            turno = "manha" if e[8] == "manha" else "noite"
            embarque = f"{'06' if turno == 'manha' else '17'}:{10 + (ordem * 4) % 40:02d}:00"
            numero = empresa * 100 + ordem + 1
            c.execute(
                "INSERT INTO estudante (nome, apelido, cpf, celular, email, fk_instituicao, curso, turno, fk_endereco, fk_area, "
                "horario_embarque, valor_mensal, dia_vencimento, status, fk_parada, fk_empresa) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?)",
                (e[1], e[2], cpf_com_digitos(f"{300000000 + numero * 7:09d}"), f"2799{numero:07d}", e[5],
                 instituicoes[(empresa, faculdade)], e[7], turno, e[9], areas[e[10]], embarque,
                 sorteio.choice([380, 420, 450, 480, 520]), sorteio.choice([5, 10, 15]),
                 "inativo" if (empresa, ordem) == (2, 11) else "ativo", empresa),
            )

        # ------------------------------------------------------------ rotas (motorista x faculdade x turno com passageiro)
        combinacoes = c.execute(
            "SELECT DISTINCT a.fk_motorista, e.fk_instituicao, e.turno FROM estudante e JOIN area a ON a.id = e.fk_area "
            "WHERE e.fk_empresa = ? AND e.status = 'ativo' ORDER BY 1, 2, 3", (empresa,)
        ).fetchall()
        for motorista, instituicao, turno in combinacoes:
            faculdade = next(f for (emp, f), i in instituicoes.items() if emp == empresa and i == instituicao)
            bairros = [r[0] for r in c.execute(
                "SELECT DISTINCT a.nome FROM estudante e JOIN area a ON a.id = e.fk_area WHERE e.fk_instituicao = ? AND e.turno = ? AND a.fk_motorista = ? ORDER BY 1",
                (instituicao, turno, motorista))]
            ida, volta = HORARIOS[(faculdade, turno)]
            lugares = f"{', '.join(bairros[:2])} e outros" if len(bairros) > 2 else " e ".join(bairros)
            nome = f"{lugares} → {FACULDADES[faculdade]} ({'manhã' if turno == 'manha' else 'noite'})"
            (rota,) = c.execute(
                "INSERT INTO rota (nome, fk_motorista, fk_instituicao, turno, horario_ida, horario_volta, status, fk_empresa) VALUES (?,?,?,?,?,?,'ativo',?) RETURNING id",
                (nome, motorista, instituicao, turno, ida, volta, empresa),
            ).fetchone()
            # Segunda a sexta; o 1º motorista de cada empresa roda também no fim de semana, para
            # sempre haver viagem "hoje" ao testar o app do motorista.
            for dia in range(1, 8 if motorista == m1 else 6):
                c.execute("INSERT INTO rota_dia VALUES (?, ?)", (rota, dia))

    # ---------------------------------------------------------------- dias sem aula de cada empresa
    def dia_util(d: date) -> date:
        while d.weekday() > 4:
            d += timedelta(days=1)
        return d

    for empresa, faculdade, deslocamento, motivo in ((1, 1, -9, "Semana acadêmica UVV"), (1, 1, 6, "Prova unificada UVV"), (2, 2, -6, "Conselho de classe UniSales"), (2, 3, 8, "Recesso Multivix")):
        c.execute("INSERT INTO dia_sem_aula (data, fk_instituicao, motivo, fk_empresa) VALUES (?, ?, ?, ?)",
                  (dia_util(hoje + timedelta(days=deslocamento)).isoformat(), instituicoes[(empresa, faculdade)], motivo, empresa))

    # ---------------------------------------------------------------- viagens: 3 semanas atrás até o fim desta semana
    gerar = rotina("gerar_dia")
    fim_da_semana = hoje + timedelta(days=6 - hoje.weekday())
    dia = hoje - timedelta(days=21)
    while dia <= fim_da_semana:
        for comando in gerar:
            c.execute(comando, {"data": dia.isoformat()})
        dia += timedelta(days=1)
    # O que já devia ter saído (dias anteriores e o começo de hoje) fica concluído.
    for id_viagem, data_viagem, sentido, ida, volta in c.execute(
        "SELECT v.id, v.data, v.sentido, r.horario_ida, r.horario_volta FROM viagem v JOIN rota r ON r.id = v.fk_rota WHERE v.data <= ?", (hoje.isoformat(),)
    ).fetchall():
        prevista = datetime.fromisoformat(f"{data_viagem} {ida if sentido == 'ida' else volta}")
        if prevista + timedelta(minutes=50) > agora:
            continue
        saida = prevista + timedelta(minutes=sorteio.randint(-3, 6))
        chegada = saida + timedelta(minutes=sorteio.randint(25, 45))
        c.execute("UPDATE viagem SET status = 'concluida', horario_saida = ?, horario_chegada = ? WHERE id = ?", (saida.isoformat(" "), chegada.isoformat(" "), id_viagem))
        for (estudante,) in c.execute("SELECT fk_estudante FROM chamada WHERE fk_viagem = ?", (id_viagem,)).fetchall():
            sorte = sorteio.random()
            if sorte < 0.82:
                embarque = saida + timedelta(minutes=sorteio.randint(1, 15))
                c.execute("UPDATE chamada SET status = 'presente', horario_embarque = ?, horario_desembarque = ? WHERE fk_viagem = ? AND fk_estudante = ?",
                          (embarque.isoformat(" "), chegada.isoformat(" "), id_viagem, estudante))
            elif sorte < 0.92:
                aviso = saida - timedelta(hours=sorteio.randint(2, 6))
                c.execute("UPDATE chamada SET status = 'nao_vai', horario_aviso = ? WHERE fk_viagem = ? AND fk_estudante = ?", (aviso.isoformat(" "), id_viagem, estudante))
            else:
                c.execute("UPDATE chamada SET status = 'ausente' WHERE fk_viagem = ? AND fk_estudante = ?", (id_viagem, estudante))

    # ---------------------------------------------------------------- financeiro: 3 meses atrás até o atual
    titulos = rotina("gerar_titulos_mes")
    for deslocamento in range(-3, 1):
        competencia = mes(hoje, deslocamento)
        for comando in titulos:
            c.execute(comando, {"competencia": competencia.isoformat()})
        for empresa, cfg in EMPRESAS.items():
            for veiculo in cfg["veiculos"]:
                placa = c.execute("SELECT placa FROM veiculo WHERE id = ?", (veiculo,)).fetchone()[0]
                gastos = [("combustivel", f"Combustível {placa}", sorteio.randint(1700, 2400), 25)]
                if sorteio.random() < 0.5:
                    gastos.append(("manutencao", sorteio.choice(["Troca de óleo e filtros", "Revisão dos freios", "Troca de pneus", "Alinhamento e balanceamento"]) + f" {placa}", sorteio.randint(350, 1800), 18))
                for categoria, descricao, valor, dia_venc in gastos:
                    motorista = cfg["motoristas"][cfg["veiculos"].index(veiculo)]
                    c.execute("INSERT INTO titulo_pagar (fk_empresa, categoria, fk_motorista, fk_veiculo, descricao, competencia, valor, data_vencimento) VALUES (?,?,?,?,?,?,?,?)",
                              (empresa, categoria, motorista, veiculo, descricao, competencia.isoformat(), valor, competencia.replace(day=dia_venc).isoformat()))
            c.execute("INSERT INTO titulo_pagar (fk_empresa, categoria, descricao, competencia, valor, data_vencimento) VALUES (?, 'outros', ?, ?, ?, ?)",
                      (empresa, sorteio.choice(["Lavagem das vans", "Seguro da frota (parcela)", "Contador", "Licenciamento"]), competencia.isoformat(), sorteio.randint(250, 900), competencia.replace(day=12).isoformat()))

    # Vencido até hoje: quase tudo pago (alguns passageiros ficam inadimplentes); o resto em aberto.
    inadimplentes = {r[0] for r in c.execute("SELECT id FROM estudante WHERE status = 'ativo' AND id % 6 = 0")}
    for id_titulo, estudante, vencimento in c.execute("SELECT id, fk_estudante, data_vencimento FROM titulo_receber").fetchall():
        if vencimento < hoje.isoformat() and estudante not in inadimplentes:
            pago = min(date.fromisoformat(vencimento) + timedelta(days=sorteio.randint(-4, 3)), hoje)
            c.execute("UPDATE titulo_receber SET status = 'pago', data_recebimento = ?, valor_recebido = valor WHERE id = ?", (pago.isoformat(), id_titulo))
    c.execute("UPDATE titulo_pagar SET status = 'pago', data_pagamento = data_vencimento, valor_pago = valor WHERE data_vencimento < ?", (hoje.isoformat(),))

    # ---------------------------------------------------------------- assinatura do app: 6 meses, em dia
    for empresa in EMPRESAS:
        for deslocamento in range(-5 if empresa == 1 else -3, 1):  # a Rota Certa assinou há 3 meses
            competencia = mes(hoje, deslocamento)
            vencimento = competencia.replace(day=10)
            pago = vencimento - timedelta(days=2) if (empresa, deslocamento) != (2, -1) else vencimento + timedelta(days=5)
            em_dia = pago <= hoje
            c.execute("INSERT INTO assinatura_pagamento (fk_empresa, competencia, valor, data_vencimento, data_pagamento, status) VALUES (?, ?, 199.90, ?, ?, ?)",
                      (empresa, competencia.isoformat(), vencimento.isoformat(), pago.isoformat() if em_dia else None, "pago" if em_dia else "aberto"))

    # ---------------------------------------------------------------- endereços que sobraram
    c.execute("""DELETE FROM endereco WHERE id NOT IN (
        SELECT fk_endereco FROM empresa WHERE fk_endereco IS NOT NULL UNION SELECT fk_endereco FROM instituicao
        UNION SELECT fk_endereco FROM estudante UNION SELECT fk_endereco FROM motorista WHERE fk_endereco IS NOT NULL)""")
    c.execute("PRAGMA foreign_keys = ON")
