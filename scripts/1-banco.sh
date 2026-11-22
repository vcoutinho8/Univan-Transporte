#!/usr/bin/env bash
# PASSO 1 de 3 · Cria o banco SQLite com os dados de exemplo (5 registros na maioria das
# tabelas; todos os bairros, e os passageiros e rotas das 5 primeiras instituições).
#
# Uso, na raiz do projeto (Git Bash, Linux ou macOS):
#   bash scripts/1-banco.sh          pergunta antes de apagar um banco que já existe
#   bash scripts/1-banco.sh --sim    apaga e recria sem perguntar
#
# Depois rode:  bash scripts/2-backend.sh   e, em outro terminal,  bash scripts/3-frontend.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

info() { printf '\033[1;36m==> %s\033[0m\n' "$*"; }
erro() { printf '\033[1;31mErro: %s\033[0m\n' "$*" >&2; exit 1; }

# Só precisa do Python (o sqlite3 já vem com ele). Usa o do backend se existir.
if [ -x backend/.venv/Scripts/python.exe ]; then
  PY="backend/.venv/Scripts/python.exe"
elif [ -x backend/.venv/bin/python ]; then
  PY="backend/.venv/bin/python"
else
  PY="$(command -v python3 || command -v python || command -v py || true)"
  [ -n "$PY" ] || erro "Python não encontrado. Instale o Python 3.12+."
fi

if [ ! -f .env ]; then
  info "Criando o .env a partir do .env.example"
  cp .env.example .env
fi

# Descobre o arquivo do banco pela DATABASE_URL do .env (padrão: backend/univan.db).
ARQUIVO="$("$PY" - <<'EOF'
import pathlib, sys
url = "sqlite:///backend/univan.db"
for linha in pathlib.Path(".env").read_text(encoding="utf-8").splitlines():
    if linha.startswith("DATABASE_URL="):
        url = linha.split("=", 1)[1].strip()
if not url.startswith("sqlite:///"):
    sys.exit("A DATABASE_URL do .env não é SQLite. Este script só cria banco SQLite.")
print(url.removeprefix("sqlite:///"))
EOF
)" || exit 1

if [ -f "$ARQUIVO" ] && [ "${1:-}" != "--sim" ]; then
  read -r -p "O banco $ARQUIVO já existe. Apagar e recriar com os dados de exemplo? [s/N] " RESPOSTA
  [[ "$RESPOSTA" =~ ^[sS]$ ]] || { info "Nada foi alterado."; exit 0; }
fi

info "Criando $ARQUIVO a partir de docs/univan-sqlite.sql"
"$PY" - "$ARQUIVO" <<'EOF'
import pathlib, sqlite3, sys

arquivo = pathlib.Path(sys.argv[1])
arquivo.parent.mkdir(parents=True, exist_ok=True)
temporario = arquivo.with_name(arquivo.name + ".novo")
temporario.unlink(missing_ok=True)

conexao = sqlite3.connect(temporario)
try:
    conexao.executescript(pathlib.Path("docs/univan-sqlite.sql").read_text(encoding="utf-8"))

    # Fica com os registros 1 a 5 de cada tabela. Nos dados de teste eles só apontam
    # uns para os outros, então nenhuma chave estrangeira fica quebrada. Exceções, para o
    # mapa não ficar vazio: ficam todos os bairros (já divididos entre os 5 primeiros
    # motoristas) e todos os passageiros e rotas das 5 instituições que sobram.
    conexao.executescript("""
    DELETE FROM chamada        WHERE fk_viagem > 5;
    DELETE FROM viagem         WHERE id > 5;
    DELETE FROM rota           WHERE fk_instituicao > 5 OR fk_motorista > 5;
    DELETE FROM rota_dia       WHERE fk_rota NOT IN (SELECT id FROM rota);
    DELETE FROM titulo_receber WHERE id > 5;
    DELETE FROM titulo_pagar   WHERE id > 5;
    DELETE FROM dia_sem_aula   WHERE id > 5;
    DELETE FROM estudante      WHERE fk_instituicao > 5;
    DELETE FROM motorista      WHERE id > 5;
    DELETE FROM veiculo        WHERE id > 5;
    DELETE FROM instituicao    WHERE id > 5;
    DELETE FROM assinatura_pagamento WHERE fk_empresa > 5;
    DELETE FROM empresa        WHERE id > 5;
    -- endereços: só os usados pelas empresas, instituições, estudantes e motoristas que ficaram
    DELETE FROM endereco WHERE id NOT IN (
        SELECT fk_endereco FROM empresa WHERE fk_endereco IS NOT NULL
        UNION SELECT fk_endereco FROM instituicao
        UNION SELECT fk_endereco FROM estudante
        UNION SELECT fk_endereco FROM motorista WHERE fk_endereco IS NOT NULL);
    -- Teste do mapa do motorista (logins "motorista" e "joao"): todas as rotas deles rodam
    -- também sábado e domingo, para sempre haver viagem "hoje"...
    INSERT OR IGNORE INTO rota_dia SELECT r.id, d.dia FROM rota r, (SELECT 6 AS dia UNION SELECT 7) d
        WHERE r.fk_motorista IN (1, 2);
    -- ...e a manhã ganha passageiros: os da noite deles também vão de manhã (UVV para o
    -- motorista 1, Novo Milênio para o 2), com CPF próprio.
    INSERT INTO estudante (nome, apelido, cpf, celular, fk_instituicao, curso, turno, fk_endereco, fk_area,
                           horario_embarque, valor_mensal, dia_vencimento, status)
    SELECT e.nome, e.apelido, printf('%011d', 90000000000 + e.id), e.celular,
           CASE a.fk_motorista WHEN 1 THEN 1 ELSE 4 END, e.curso, 'manha', e.fk_endereco, e.fk_area,
           '06:00:00', e.valor_mensal, e.dia_vencimento, 'ativo'
    FROM estudante e JOIN area a ON a.id = e.fk_area
    WHERE a.fk_motorista IN (1, 2) AND e.turno = 'noite' AND e.status = 'ativo';
""")

    # Dados coerentes com as regras do sistema: CPF válido e único, celular único e tudo numa
    # empresa só (os veículos aparecem para todos os motoristas; o login é por CPF).
    def cpf_com_digitos(base9: str) -> str:
        numeros = [int(d) for d in base9]
        for tamanho in (9, 10):
            soma = sum(n * (tamanho + 1 - i) for i, n in enumerate(numeros[:tamanho]))
            numeros.append((soma * 10 % 11) % 10)
        return "".join(map(str, numeros))

    for (id_estudante,) in conexao.execute("SELECT id FROM estudante ORDER BY id").fetchall():
        conexao.execute(
            "UPDATE estudante SET cpf = ?, celular = ? WHERE id = ?",
            (cpf_com_digitos(f"{300000000 + id_estudante * 7:09d}"), f"2799{id_estudante:07d}", id_estudante),
        )
    for (id_motorista,) in conexao.execute("SELECT id FROM motorista ORDER BY id").fetchall():
        conexao.execute("UPDATE motorista SET cpf = ? WHERE id = ?", (cpf_com_digitos(f"{200000000 + id_motorista * 13:09d}"), id_motorista))
    conexao.executescript("""
        UPDATE motorista SET fk_empresa = 1;
        UPDATE veiculo   SET fk_empresa = 1;
        UPDATE usuario   SET fk_empresa = 1;
        -- Acesso: o gestor entra com o CNPJ da empresa; o motorista com o CPF do cadastro dele.
        UPDATE usuario SET login = (SELECT cnpj FROM empresa WHERE id = 1), cpf = NULL WHERE perfil = 'admin';
        UPDATE usuario SET login = (SELECT cpf FROM motorista m WHERE m.id = usuario.fk_motorista), cpf = NULL WHERE perfil = 'motorista';
    """)
    cpf_auxiliar = cpf_com_digitos("400000001")
    conexao.execute("UPDATE usuario SET login = ?, cpf = ? WHERE perfil = 'auxiliar'", (cpf_auxiliar, cpf_auxiliar))
    for perfil, login, nome in conexao.execute("SELECT perfil, login, nome FROM usuario ORDER BY id").fetchall():
        print(f"  login {perfil:<9} {login:<15} {nome}")

    problemas = conexao.execute("PRAGMA foreign_key_check").fetchall()
    if problemas:
        sys.exit(f"Chaves estrangeiras quebradas: {problemas}")
    conexao.commit()
    conexao.execute("VACUUM")

    tabelas = [n for (n,) in conexao.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")]
    for tabela in tabelas:
        total = conexao.execute(f"SELECT count(*) FROM {tabela}").fetchone()[0]
        print(f"   {tabela:<15} {total:>3} registros")
except BaseException:
    # Qualquer falha: não deixa o .novo para trás e mantém o banco antigo intacto.
    conexao.close()
    temporario.unlink(missing_ok=True)
    raise
conexao.close()

# Só troca o banco antigo depois que o novo ficou pronto.
try:
    temporario.replace(arquivo)
except PermissionError:
    # Windows: a API (ou outro programa) está com o banco aberto e o arquivo não pode ser
    # trocado. Copia o conteúdo para dentro dele pelo próprio SQLite, que funciona aberto.
    with sqlite3.connect(temporario) as novo, sqlite3.connect(arquivo, timeout=30) as destino:
        novo.backup(destino)
    novo.close()
    destino.close()
    temporario.unlink()
    print("   O banco estava aberto (API rodando?): os dados foram copiados para dentro dele.")
    print("   Reinicie a API para ela gerar as viagens de hoje.")
EOF

info "Banco pronto. Próximo passo:  bash scripts/2-backend.sh"
