# Banco de dados

O UniVan usa **SQLite**: o banco inteiro é um arquivo, por padrão `backend/univan.db`. Não há
servidor de banco para instalar; o SQLite já vem com o Python.

| Arquivo | Conteúdo |
|---|---|
| [`univan-sqlite.sql`](univan-sqlite.sql) | Tabelas, restrições, índices, views, trigger e dados de teste (10 registros por tabela) |
| [`univan-sqlite-rotinas.sql`](univan-sqlite-rotinas.sql) | As rotinas do banco (`gerar_dia` etc.) como comandos para o backend executar |
| `backend/univan.db` | O banco em uso. Não vai para o git; é criado pelos comandos abaixo |

Explicação detalhada de cada campo: [PDF do modelo de dados](documentacao-banco-edr.pdf).

> Quando o PDF e o `.sql` divergem, **vale o `.sql`**. Veja as diferenças no fim deste documento.

## Criar o banco

| Comando | Resultado |
|---|---|
| `bash scripts/1-banco.sh` | Cria o banco com **5 registros de exemplo** por tabela (pergunta antes de apagar um banco existente; `--sim` pula a pergunta) |
| Subir a API sem o arquivo existir | A API cria o banco sozinha, com os dados de teste completos de `univan-sqlite.sql` |
| `sqlite3 univan.db < docs/univan-sqlite.sql` | Cria à mão, com o `sqlite3` instalado (útil para abrir num visualizador) |

Para voltar aos dados de exemplo, pare a API e rode `bash scripts/1-banco.sh` de novo.

## Tabelas

| Grupo | Tabela | Model (`backend/app/modules/`) | Função |
|---|---|---|---|
| Cadastros base | `endereco` | `endereco/endereco_model.py` · `Endereco` | Endereços reaproveitados (com latitude/longitude) |
| | `empresa` | `empresa/empresa_model.py` · `Empresa` | Transportadora |
| | `instituicao` | `instituicao/instituicao_model.py` · `Instituicao` | Faculdade de destino |
| Frota e equipe | `veiculo` | `veiculo/veiculo_model.py` · `Veiculo` | Vans e micro-ônibus |
| | `motorista` | `motorista/motorista_model.py` · `Motorista` | Quem dirige; base do salário |
| Divisão da cidade | `area` | `area/area_model.py` · `Area` | Região (polígono) de cada motorista |
| Clientes | `estudante` | `estudante/estudante_model.py` · `Estudante` | Aluno, onde mora/estuda, quanto paga |
| Planejamento | `rota` | `rota/rota_model.py` · `Rota` | Motorista + instituição + turno |
| | `rota_dia` | `rota/rota_model.py` · `RotaDia` | Dias da semana da rota (1 = seg … 7 = dom) |
| | `dia_sem_aula` | `dia_sem_aula/dia_sem_aula_model.py` · `DiaSemAula` | Feriados/recessos (geral ou por instituição) |
| Operação diária | `viagem` | `viagem/viagem_model.py` · `Viagem` | Cada ida/volta de um dia |
| | `chamada` | `chamada/chamada_model.py` · `Chamada` | Estudante em uma viagem (PK composta) |
| Financeiro | `titulo_receber` | `financeiro/titulo_receber_model.py` · `TituloReceber` | Mensalidades |
| | `titulo_pagar` | `financeiro/titulo_pagar_model.py` · `TituloPagar` | Salários e despesas |

O teste `backend/tests/test_modelos_iguais_ao_banco.py` carrega o `univan-sqlite.sql` e falha se
algum model tiver tabela, coluna ou enum diferente do banco.

## Relacionamentos

```text
endereco ◀── empresa, instituicao, estudante
empresa ──▶ veiculo, motorista, titulo_pagar
veiculo ◀── motorista.fk_veiculo (veículo padrão)
motorista ──▶ area ──▶ estudante.fk_area (preenchido por trigger)
instituicao ──▶ estudante, rota, dia_sem_aula
motorista ──▶ rota ──▶ rota_dia
rota ──▶ viagem (também guarda motorista e veículo do dia)
viagem + estudante ──▶ chamada
estudante ──▶ titulo_receber
motorista / veiculo ──▶ titulo_pagar
```

## Enums

O SQLite não tem tipo enum: cada coluna é `TEXT` com um `CHECK (coluna IN (...))`, e o backend
usa um enum Python com os mesmos valores.

| Enum Python | Valores | Colunas |
|---|---|---|
| `StatusCadastro` | ativo, inativo | `status` de veiculo, motorista, area, estudante, rota |
| `Turno` | manha, tarde, noite | `turno` de estudante, rota |
| `Sentido` | ida, volta | `viagem.sentido` |
| `StatusViagem` | agendada, em_andamento, concluida, cancelada | `viagem.status` |
| `StatusChamada` | pendente, nao_vai, presente, ausente | `chamada.status` |
| `StatusTitulo` | aberto, pago, cancelado | `status` de titulo_receber, titulo_pagar |
| `CategoriaTituloPagar` | salario, combustivel, manutencao, seguro, impostos, outros | `titulo_pagar.categoria` |

## Regras garantidas pelo banco

| Regra | Restrição |
|---|---|
| CPF (11), CNPJ (14), CEP (8) só números | `*_cpf_check`, `empresa_cnpj_check`, `endereco_cep_check` |
| Placa `ABC1234` ou Mercosul `ABC1D23` | `veiculo_placa_check` |
| Dia de vencimento/pagamento entre 1 e 28 | `estudante_dia_vencimento_check`, `motorista_dia_pagamento_check` |
| Valores não negativos, capacidade > 0 | `*_valor_check`, `*_salario_check`, `veiculo_capacidade_check` |
| Competência sempre dia 01 | `titulo_*_competencia_check` |
| Valores de enum válidos | `*_status_check`, `*_turno_check`, `viagem_sentido_check`, `titulo_pagar_categoria_check` |
| CPF, CNPJ, CNH, placa únicos | `*_key` |
| Uma rota por motorista + instituição + turno | `rota_fk_motorista_fk_instituicao_turno_key` |
| Uma viagem por rota + data + sentido | `viagem_fk_rota_data_sentido_key` |
| Um estudante por viagem | `chamada_pkey` |
| Uma mensalidade por estudante por mês | `titulo_receber_fk_estudante_competencia_key` |
| Um salário por motorista por mês | índice único parcial `ux_salario_mes` |
| Salário exige motorista | `titulo_pagar_check` |
| Um dia sem aula por data + instituição (e um só feriado geral por data) | índice único `dia_sem_aula_data_fk_instituicao_key`, sobre `ifnull(fk_instituicao, -1)` |

Cada restrição tem mensagem em português em `backend/app/config/erros.py`
(`MENSAGENS_RESTRICOES`), usada se o banco recusar uma gravação. Como o SQLite informa um `UNIQUE`
violado pelas colunas (`veiculo.placa`) e não pelo nome, o mapa `RESTRICOES_UNIQUE_SQLITE` faz a
ligação.

## Trigger, views e rotinas

| Objeto | Tipo | O que faz |
|---|---|---|
| `tg_estudante_area_insert` / `tg_estudante_area_update` | Trigger | Ao inserir um estudante ou alterar o endereço dele, define `fk_area` pelo ponto dentro do polígono da área |
| `vw_frequencia` | View | Presenças, avisos, faltas e % de presença por estudante |
| `vw_inadimplentes` | View | Mensalidades abertas e vencidas, com dias de atraso |
| `vw_resultado_mes` | View | Receitas, despesas e resultado por competência |
| `vw_area_vertice` / `vw_area_aresta` | View auxiliar | Quebram o polígono das áreas em vértices e arestas, para o trigger |
| `gerar_dia(data)` | Rotina | Cria viagens de ida/volta das rotas ativas do dia (respeitando `rota_dia` e `dia_sem_aula`) e as chamadas `pendente`. Idempotente |
| `avisar_nao_vou(estudante, data, sentido, momento)` | Rotina | Marca `nao_vai` se faltar mais de 1h para o horário previsto. Retorna `'OK'` ou o motivo da recusa |
| `concluir_viagem(viagem, momento)` | Rotina | Conclui a viagem e transforma `pendente` em `ausente` |
| `gerar_titulos_mes(competencia)` | Rotina | Cria mensalidades dos estudantes ativos e salários dos motoristas ativos. Idempotente |

O SQLite não tem funções armazenadas. Por isso as **rotinas** ficam em
[`univan-sqlite-rotinas.sql`](univan-sqlite-rotinas.sql), como blocos de comandos com parâmetros
(`:data`, `:momento`...), e devem ser **executadas** pelo backend, não reimplementadas em Python.
O trigger e as views ficam dentro do próprio banco.

## Particularidades do SQLite

| Assunto | Como fica |
|---|---|
| Chaves estrangeiras | Só são conferidas com `PRAGMA foreign_keys = ON`, ligado em **cada conexão** (o backend faz isso em `banco.py`) |
| Datas e horários | Guardados como texto: `AAAA-MM-DD`, `HH:MM:SS` e `AAAA-MM-DD HH:MM:SS` (o backend grava nesse formato) |
| Valores em dinheiro | `NUMERIC` é guardado como ponto flutuante; `vw_resultado_mes` arredonda para 2 casas |
| Formatos (CPF, placa...) | Conferidos com `GLOB` e `length()` |
| Tamanho dos textos | O SQLite não confere o tamanho máximo; quem confere são os schemas do backend |
| Polígono das áreas | Texto `'((lon,lat),...)'`. Um endereço exatamente sobre a borda de uma área pode não ser associado a ela |
| IDs | `INTEGER PRIMARY KEY`: o SQLite numera sozinho (maior id + 1) |
| Data de hoje nas views | `date('now', 'localtime')`, a data do computador |

## Diferenças entre o PDF e o `.sql`

| Assunto | PDF | `univan-sqlite.sql` (vale este) |
|---|---|---|
| Banco | PostgreSQL (schema `transporte`) | SQLite, um arquivo, sem schema |
| Dias da rota | Colunas booleanas `seg … sab` em `rota` | Tabela `rota_dia (fk_rota, dia_semana 1–7)` |
| Enums | Tipos `ENUM` (o de cadastro chamado `status`) | `TEXT` com `CHECK (coluna IN (...))` |
| Planilha do motorista | Função `texto_planilha(rota, data, sentido)` | **Não existe**; precisará ser feita no backend |
| Arrependimento do "não vou" | Chamada volta para `pendente` | Não há rotina; regra a implementar no backend |
| Dados de teste | Guarapari/Vila Velha (ES) | Criciúma e região (SC) |
