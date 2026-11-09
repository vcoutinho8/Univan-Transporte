-- =============================================================================
-- UniVan · rotinas do banco em SQLite
--
-- O SQLite não tem funções armazenadas. Cada rotina é um bloco de comandos
-- com parâmetros nomeados (:data, :momento, ...),
-- para ser executado pelo backend dentro de uma transação, por exemplo:
--
--   with sessao.begin():
--       sessao.execute(text(SQL_GERAR_DIA_VIAGENS), {"data": "2026-11-10"})
--
-- Formatos esperados nos parâmetros:
--   :data, :competencia  'AAAA-MM-DD'
--   :momento             'AAAA-MM-DD HH:MM:SS'   (hora local)
--   :sentido             'ida' ou 'volta'
-- =============================================================================


-- -----------------------------------------------------------------------------
-- gerar_dia(:data)
-- Cria as viagens de ida e volta das rotas ativas do dia, respeitando rota_dia
-- e dia_sem_aula, e as chamadas 'pendente' de cada estudante esperado.
-- Idempotente. O número de chamadas criadas é o rowcount do 2º comando.
-- -----------------------------------------------------------------------------

-- 1/2 · viagens
INSERT INTO viagem (fk_rota, fk_veiculo, fk_motorista, data, sentido)
SELECT r.id, m.fk_veiculo, m.id, :data, s.sentido
FROM rota r
JOIN motorista m ON m.id = r.fk_motorista
CROSS JOIN (SELECT 'ida' AS sentido UNION ALL SELECT 'volta') s
WHERE r.status = 'ativo'
  AND m.fk_veiculo IS NOT NULL
  -- roda nesse dia da semana? (%w: 0 = domingo; convertido para 1 = seg ... 7 = dom)
  AND EXISTS (SELECT 1 FROM rota_dia rd
              WHERE rd.fk_rota = r.id
                AND rd.dia_semana = (CAST(strftime('%w', :data) AS INTEGER) + 6) % 7 + 1)
  -- não é feriado / recesso?
  AND NOT EXISTS (SELECT 1 FROM dia_sem_aula d
                  WHERE d.data = :data
                    AND (d.fk_instituicao IS NULL OR d.fk_instituicao = r.fk_instituicao))
ON CONFLICT (fk_rota, data, sentido) DO NOTHING;

-- 2/2 · chamadas
INSERT INTO chamada (fk_viagem, fk_estudante, horario_previsto)
SELECT v.id, e.id,
       CASE v.sentido WHEN 'ida' THEN e.horario_embarque ELSE r.horario_volta END
FROM viagem v
JOIN rota r      ON r.id = v.fk_rota
JOIN area a      ON a.fk_motorista = r.fk_motorista AND a.status = 'ativo'
JOIN estudante e ON e.fk_area = a.id
                AND e.fk_instituicao = r.fk_instituicao
                AND e.turno = r.turno
                AND e.status = 'ativo'
WHERE v.data = :data
ON CONFLICT (fk_viagem, fk_estudante) DO NOTHING;


-- -----------------------------------------------------------------------------
-- avisar_nao_vou(:estudante, :data, :sentido, :momento)
-- Marca 'nao_vai' se faltar pelo menos 1h para o horário previsto.
-- 1º comando: devolve 'OK' ou o motivo da recusa (rode antes do UPDATE).
-- 2º comando: grava o aviso (só altera a linha quando o 1º devolveu 'OK').
-- -----------------------------------------------------------------------------

-- 1/2 · resposta
SELECT CASE
         WHEN c.fk_viagem IS NULL THEN 'Sem viagem para este aluno nesse dia'
         WHEN c.status <> 'pendente' THEN 'Chamada já está como ' || c.status
         WHEN :momento > datetime(:data || ' ' || c.horario_previsto, '-1 hour')
           THEN 'Fora do prazo: avisar até 1h antes de ' || substr(c.horario_previsto, 1, 5)
         ELSE 'OK'
       END AS resposta
FROM (SELECT 1) x
LEFT JOIN (SELECT ch.*
           FROM chamada ch JOIN viagem v ON v.id = ch.fk_viagem
           WHERE ch.fk_estudante = :estudante AND v.data = :data AND v.sentido = :sentido
           LIMIT 1) c ON 1 = 1;

-- 2/2 · gravação
UPDATE chamada
SET status = 'nao_vai', horario_aviso = :momento
WHERE fk_estudante = :estudante
  AND status = 'pendente'
  AND fk_viagem IN (SELECT id FROM viagem WHERE data = :data AND sentido = :sentido)
  AND (horario_previsto IS NULL
       OR :momento <= datetime(:data || ' ' || horario_previsto, '-1 hour'));


-- -----------------------------------------------------------------------------
-- concluir_viagem(:viagem, :momento)
-- Conclui a viagem e transforma em 'ausente' quem continuou 'pendente'.
-- -----------------------------------------------------------------------------

UPDATE viagem SET status = 'concluida', horario_chegada = :momento WHERE id = :viagem;
UPDATE chamada SET status = 'ausente' WHERE fk_viagem = :viagem AND status = 'pendente';


-- -----------------------------------------------------------------------------
-- gerar_titulos_mes(:competencia)
-- Cria as mensalidades dos estudantes ativos (vencem no próprio mês) e os
-- salários dos motoristas ativos (vencem no mês seguinte). Idempotente.
-- -----------------------------------------------------------------------------

-- 1/2 · mensalidades
INSERT INTO titulo_receber (fk_estudante, competencia, valor, data_vencimento)
SELECT e.id,
       date(:competencia, 'start of month'),
       e.valor_mensal,
       date(:competencia, 'start of month', '+' || (e.dia_vencimento - 1) || ' days')
FROM estudante e
WHERE e.status = 'ativo'
ON CONFLICT DO NOTHING;

-- 2/2 · salários
INSERT INTO titulo_pagar (fk_empresa, categoria, fk_motorista, descricao,
                          competencia, valor, data_vencimento)
SELECT m.fk_empresa, 'salario', m.id,
       'Salário ' || m.nome || ' - ' || strftime('%m/%Y', :competencia),
       date(:competencia, 'start of month'),
       m.salario,
       date(:competencia, 'start of month', '+1 month', '+' || (m.dia_pagamento - 1) || ' days')
FROM motorista m
WHERE m.status = 'ativo' AND m.salario IS NOT NULL
ON CONFLICT DO NOTHING;
