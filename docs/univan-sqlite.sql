-- =============================================================================
-- UniVan · banco em SQLite
--
-- Estrutura completa do banco (SQLite 3.30 ou superior): tabelas, restrições,
-- índices, views, trigger e dados de teste (10 registros por tabela).
-- As rotinas (gerar_dia, avisar_nao_vou, concluir_viagem, gerar_titulos_mes)
-- estão em docs/univan-sqlite-rotinas.sql, porque o SQLite não tem funções
-- armazenadas.
--
-- Particularidades do SQLite (detalhes em docs/database.md):
--   * enums            -> TEXT com CHECK (coluna IN (...))
--   * formatos (CPF, placa...) -> GLOB e length()
--   * áreas            -> polígono em TEXT + ponto-no-polígono no trigger
--   * date/time/timestamp -> TEXT ('AAAA-MM-DD', 'HH:MM:SS', 'AAAA-MM-DD HH:MM:SS')
--   * feriado geral único por data -> índice único sobre ifnull(fk_instituicao, -1)
--
-- Uso:
--   bash scripts/1-banco.sh          (cria o banco com 5 registros por tabela)
--   sqlite3 univan.db < docs/univan-sqlite.sql
--   ou, sem o sqlite3 instalado:
--   python -c "import sqlite3;sqlite3.connect('univan.db').executescript(open('docs/univan-sqlite.sql',encoding='utf-8').read())"
--
-- Lembre: o SQLite só confere chaves estrangeiras com PRAGMA foreign_keys = ON,
-- que precisa ser ligado em cada conexão.
-- =============================================================================

PRAGMA foreign_keys = OFF;
BEGIN;

-- ---------------------------------------------------------------- Cadastros base

CREATE TABLE endereco (
    id          INTEGER PRIMARY KEY,
    cep         TEXT NOT NULL,
    logradouro  TEXT NOT NULL,
    numero      TEXT,
    complemento TEXT,
    bairro      TEXT NOT NULL,
    cidade      TEXT NOT NULL,
    estado      TEXT NOT NULL,
    latitude    NUMERIC,
    longitude   NUMERIC,
    CONSTRAINT endereco_cep_check CHECK (length(cep) = 8 AND cep NOT GLOB '*[^0-9]*')
);

CREATE TABLE empresa (
    id            INTEGER PRIMARY KEY,
    razao_social  TEXT NOT NULL,
    nome_fantasia TEXT,
    cnpj          TEXT NOT NULL,
    telefone      TEXT,
    fk_endereco   INTEGER REFERENCES endereco (id),
    CONSTRAINT empresa_cnpj_key UNIQUE (cnpj),
    CONSTRAINT empresa_cnpj_check CHECK (length(cnpj) = 14 AND cnpj NOT GLOB '*[^0-9]*')
);

CREATE TABLE instituicao (
    id          INTEGER PRIMARY KEY,
    nome        TEXT NOT NULL,
    fk_endereco INTEGER NOT NULL REFERENCES endereco (id)
);

-- ---------------------------------------------------------------- Frota e equipe

CREATE TABLE veiculo (
    id         INTEGER PRIMARY KEY,
    fk_empresa INTEGER NOT NULL REFERENCES empresa (id),
    placa      TEXT NOT NULL,
    modelo     TEXT NOT NULL,
    cor        TEXT,
    capacidade INTEGER NOT NULL,
    status     TEXT NOT NULL DEFAULT 'ativo',
    CONSTRAINT veiculo_placa_key UNIQUE (placa),
    CONSTRAINT veiculo_capacidade_check CHECK (capacidade > 0),
    -- ABC1234 ou Mercosul ABC1D23 (GLOB diferencia maiúsculas)
    CONSTRAINT veiculo_placa_check CHECK (placa GLOB '[A-Z][A-Z][A-Z][0-9][A-Z0-9][0-9][0-9]'),
    CONSTRAINT veiculo_status_check CHECK (status IN ('ativo', 'inativo'))
);

CREATE TABLE motorista (
    id            INTEGER PRIMARY KEY,
    fk_empresa    INTEGER NOT NULL REFERENCES empresa (id),
    fk_veiculo    INTEGER REFERENCES veiculo (id),
    nome          TEXT NOT NULL,
    cpf           TEXT NOT NULL,
    celular       TEXT,
    cnh           TEXT NOT NULL,
    cnh_validade  TEXT NOT NULL,
    salario       NUMERIC,
    dia_pagamento INTEGER DEFAULT 5,
    status        TEXT NOT NULL DEFAULT 'ativo',
    CONSTRAINT motorista_cpf_key UNIQUE (cpf),
    CONSTRAINT motorista_cnh_key UNIQUE (cnh),
    CONSTRAINT motorista_cpf_check CHECK (length(cpf) = 11 AND cpf NOT GLOB '*[^0-9]*'),
    CONSTRAINT motorista_dia_pagamento_check CHECK (dia_pagamento >= 1 AND dia_pagamento <= 28),
    CONSTRAINT motorista_salario_check CHECK (salario >= 0),
    CONSTRAINT motorista_status_check CHECK (status IN ('ativo', 'inativo'))
);

-- ---------------------------------------------------------------- Divisão da cidade

CREATE TABLE area (
    id           INTEGER PRIMARY KEY,
    nome         TEXT NOT NULL,
    -- polígono no formato '((lon,lat),(lon,lat),...)'
    coordenadas  TEXT NOT NULL,
    fk_motorista INTEGER REFERENCES motorista (id),
    status       TEXT NOT NULL DEFAULT 'ativo',
    CONSTRAINT area_status_check CHECK (status IN ('ativo', 'inativo'))
);

-- ---------------------------------------------------------------- Clientes

CREATE TABLE estudante (
    id               INTEGER PRIMARY KEY,
    nome             TEXT NOT NULL,
    apelido          TEXT,
    cpf              TEXT NOT NULL,
    celular          TEXT NOT NULL,
    email            TEXT,
    fk_instituicao   INTEGER NOT NULL REFERENCES instituicao (id),
    curso            TEXT,
    turno            TEXT NOT NULL,
    fk_endereco      INTEGER NOT NULL REFERENCES endereco (id),
    fk_area          INTEGER REFERENCES area (id),
    horario_embarque TEXT,
    valor_mensal     NUMERIC NOT NULL,
    dia_vencimento   INTEGER NOT NULL,
    status           TEXT NOT NULL DEFAULT 'ativo',
    CONSTRAINT estudante_cpf_key UNIQUE (cpf),
    CONSTRAINT estudante_cpf_check CHECK (length(cpf) = 11 AND cpf NOT GLOB '*[^0-9]*'),
    CONSTRAINT estudante_dia_vencimento_check CHECK (dia_vencimento >= 1 AND dia_vencimento <= 28),
    CONSTRAINT estudante_valor_mensal_check CHECK (valor_mensal >= 0),
    CONSTRAINT estudante_turno_check CHECK (turno IN ('manha', 'tarde', 'noite')),
    CONSTRAINT estudante_status_check CHECK (status IN ('ativo', 'inativo'))
);

-- ---------------------------------------------------------------- Planejamento

CREATE TABLE rota (
    id             INTEGER PRIMARY KEY,
    nome           TEXT NOT NULL,
    fk_motorista   INTEGER NOT NULL REFERENCES motorista (id),
    fk_instituicao INTEGER NOT NULL REFERENCES instituicao (id),
    turno          TEXT NOT NULL,
    horario_ida    TEXT,
    horario_volta  TEXT,
    status         TEXT NOT NULL DEFAULT 'ativo',
    CONSTRAINT rota_fk_motorista_fk_instituicao_turno_key UNIQUE (fk_motorista, fk_instituicao, turno),
    CONSTRAINT rota_turno_check CHECK (turno IN ('manha', 'tarde', 'noite')),
    CONSTRAINT rota_status_check CHECK (status IN ('ativo', 'inativo'))
);

CREATE TABLE rota_dia (
    fk_rota    INTEGER NOT NULL REFERENCES rota (id) ON DELETE CASCADE,
    dia_semana INTEGER NOT NULL,
    CONSTRAINT rota_dia_pkey PRIMARY KEY (fk_rota, dia_semana),
    CONSTRAINT rota_dia_dia_semana_check CHECK (dia_semana >= 1 AND dia_semana <= 7)
);

CREATE TABLE dia_sem_aula (
    id             INTEGER PRIMARY KEY,
    data           TEXT NOT NULL,
    fk_instituicao INTEGER REFERENCES instituicao (id),
    motivo         TEXT NOT NULL
);

-- ---------------------------------------------------------------- Operação diária

CREATE TABLE viagem (
    id              INTEGER PRIMARY KEY,
    fk_rota         INTEGER NOT NULL REFERENCES rota (id),
    fk_veiculo      INTEGER NOT NULL REFERENCES veiculo (id),
    fk_motorista    INTEGER NOT NULL REFERENCES motorista (id),
    data            TEXT NOT NULL,
    sentido         TEXT NOT NULL,
    horario_saida   TEXT,
    horario_chegada TEXT,
    status          TEXT NOT NULL DEFAULT 'agendada',
    CONSTRAINT viagem_fk_rota_data_sentido_key UNIQUE (fk_rota, data, sentido),
    CONSTRAINT viagem_sentido_check CHECK (sentido IN ('ida', 'volta')),
    CONSTRAINT viagem_status_check CHECK (status IN ('agendada', 'em_andamento', 'concluida', 'cancelada'))
);

CREATE TABLE chamada (
    fk_viagem        INTEGER NOT NULL REFERENCES viagem (id) ON DELETE CASCADE,
    fk_estudante     INTEGER NOT NULL REFERENCES estudante (id),
    status           TEXT NOT NULL DEFAULT 'pendente',
    horario_previsto TEXT,
    horario_aviso    TEXT,
    horario_embarque TEXT,
    CONSTRAINT chamada_pkey PRIMARY KEY (fk_viagem, fk_estudante),
    CONSTRAINT chamada_status_check CHECK (status IN ('pendente', 'nao_vai', 'presente', 'ausente'))
);

-- ---------------------------------------------------------------- Financeiro

CREATE TABLE titulo_receber (
    id               INTEGER PRIMARY KEY,
    fk_estudante     INTEGER NOT NULL REFERENCES estudante (id),
    competencia      TEXT NOT NULL,
    valor            NUMERIC NOT NULL,
    data_vencimento  TEXT NOT NULL,
    data_recebimento TEXT,
    valor_recebido   NUMERIC,
    status           TEXT NOT NULL DEFAULT 'aberto',
    CONSTRAINT titulo_receber_fk_estudante_competencia_key UNIQUE (fk_estudante, competencia),
    CONSTRAINT titulo_receber_competencia_check CHECK (strftime('%d', competencia) = '01'),
    CONSTRAINT titulo_receber_valor_check CHECK (valor >= 0),
    CONSTRAINT titulo_receber_status_check CHECK (status IN ('aberto', 'pago', 'cancelado'))
);

CREATE TABLE titulo_pagar (
    id              INTEGER PRIMARY KEY,
    fk_empresa      INTEGER NOT NULL REFERENCES empresa (id),
    categoria       TEXT NOT NULL,
    fk_motorista    INTEGER REFERENCES motorista (id),
    fk_veiculo      INTEGER REFERENCES veiculo (id),
    favorecido      TEXT,
    descricao       TEXT NOT NULL,
    competencia     TEXT,
    valor           NUMERIC NOT NULL,
    data_vencimento TEXT NOT NULL,
    data_pagamento  TEXT,
    valor_pago      NUMERIC,
    status          TEXT NOT NULL DEFAULT 'aberto',
    CONSTRAINT titulo_pagar_check CHECK (categoria <> 'salario' OR fk_motorista IS NOT NULL),
    CONSTRAINT titulo_pagar_competencia_check CHECK (strftime('%d', competencia) = '01'),
    CONSTRAINT titulo_pagar_valor_check CHECK (valor >= 0),
    CONSTRAINT titulo_pagar_categoria_check CHECK (
        categoria IN ('salario', 'combustivel', 'manutencao', 'seguro', 'impostos', 'outros')),
    CONSTRAINT titulo_pagar_status_check CHECK (status IN ('aberto', 'pago', 'cancelado'))
);

-- =============================================================================
-- Dados de teste (Criciúma e região, SC)
-- =============================================================================

-- area
INSERT INTO area VALUES (1, 'Centro', '((-49.374,-28.684),(-49.366,-28.684),(-49.366,-28.676),(-49.374,-28.676))', 1, 'ativo');
INSERT INTO area VALUES (2, 'Michel', '((-49.374,-28.694),(-49.366,-28.694),(-49.366,-28.686),(-49.374,-28.686))', 2, 'ativo');
INSERT INTO area VALUES (3, 'Santa Bárbara', '((-49.374,-28.704),(-49.366,-28.704),(-49.366,-28.696),(-49.374,-28.696))', 3, 'ativo');
INSERT INTO area VALUES (4, 'Pinheirinho', '((-49.374,-28.714),(-49.366,-28.714),(-49.366,-28.706),(-49.374,-28.706))', 4, 'ativo');
INSERT INTO area VALUES (5, 'Próspera', '((-49.374,-28.724),(-49.366,-28.724),(-49.366,-28.716),(-49.374,-28.716))', 5, 'ativo');
INSERT INTO area VALUES (6, 'Rio Maina', '((-49.374,-28.734),(-49.366,-28.734),(-49.366,-28.726),(-49.374,-28.726))', 6, 'ativo');
INSERT INTO area VALUES (7, 'Pinheirinho Sul', '((-49.374,-28.744),(-49.366,-28.744),(-49.366,-28.736),(-49.374,-28.736))', 7, 'ativo');
INSERT INTO area VALUES (8, 'Operária Nova', '((-49.374,-28.754),(-49.366,-28.754),(-49.366,-28.746),(-49.374,-28.746))', 8, 'ativo');
INSERT INTO area VALUES (9, 'Pio Corrêa', '((-49.374,-28.764),(-49.366,-28.764),(-49.366,-28.756),(-49.374,-28.756))', 9, 'ativo');
INSERT INTO area VALUES (10, 'São Luiz', '((-49.374,-28.774),(-49.366,-28.774),(-49.366,-28.766),(-49.374,-28.766))', 9, 'ativo');

-- chamada
INSERT INTO chamada VALUES (1, 1, 'presente', '17:40:00', NULL, '2026-10-29 17:41:00');
INSERT INTO chamada VALUES (2, 2, 'presente', '17:45:00', NULL, '2026-10-29 17:46:00');
INSERT INTO chamada VALUES (3, 3, 'nao_vai', '17:50:00', '2026-10-29 14:20:00', NULL);
INSERT INTO chamada VALUES (4, 4, 'presente', '17:15:00', NULL, '2026-10-29 17:16:00');
INSERT INTO chamada VALUES (5, 5, 'ausente', '17:55:00', NULL, NULL);
INSERT INTO chamada VALUES (6, 6, 'presente', '17:00:00', NULL, '2026-10-29 17:02:00');
INSERT INTO chamada VALUES (7, 7, 'presente', '06:10:00', NULL, '2026-10-29 06:11:00');
INSERT INTO chamada VALUES (8, 8, 'nao_vai', '06:30:00', '2026-10-28 21:00:00', NULL);
INSERT INTO chamada VALUES (9, 9, 'pendente', '12:20:00', NULL, NULL);
INSERT INTO chamada VALUES (10, 10, 'pendente', '12:00:00', NULL, NULL);

-- dia_sem_aula
INSERT INTO dia_sem_aula VALUES (1, '2026-11-02', NULL, 'Finados');
INSERT INTO dia_sem_aula VALUES (2, '2026-11-15', NULL, 'Proclamação da República');
INSERT INTO dia_sem_aula VALUES (3, '2026-11-20', NULL, 'Dia da Consciência Negra');
INSERT INTO dia_sem_aula VALUES (4, '2026-12-25', NULL, 'Natal');
INSERT INTO dia_sem_aula VALUES (5, '2027-01-01', NULL, 'Confraternização Universal');
INSERT INTO dia_sem_aula VALUES (6, '2026-11-06', 1, 'Semana acadêmica UNESC');
INSERT INTO dia_sem_aula VALUES (7, '2026-11-13', 2, 'Conselho de classe SATC');
INSERT INTO dia_sem_aula VALUES (8, '2026-11-27', 4, 'Formatura UNISUL');
INSERT INTO dia_sem_aula VALUES (9, '2026-12-04', 6, 'Recesso UFSC');
INSERT INTO dia_sem_aula VALUES (10, '2026-11-19', 9, 'Aniversário de Içara');

-- empresa
INSERT INTO empresa VALUES (1, 'Vale Sul Transportes Ltda', 'Vale Sul', '11222333000101', '4834331001', 1);
INSERT INTO empresa VALUES (2, 'Rota Certa Fretamentos Ltda', 'Rota Certa', '22333444000102', '4834331002', 2);
INSERT INTO empresa VALUES (3, 'Expresso Carvoeiro Transportes Ltda', 'Expresso Carvoeiro', '33444555000103', '4834331003', 3);
INSERT INTO empresa VALUES (4, 'Universitário Sul Turismo Ltda', 'UniSul Turismo', '44555666000104', '4834331004', 4);
INSERT INTO empresa VALUES (5, 'Trilha Fretamento e Turismo Ltda', 'Trilha', '55666777000105', '4834331005', 5);
INSERT INTO empresa VALUES (6, 'Caminho do Saber Transportes ME', 'Caminho do Saber', '66777888000106', '4834331006', 6);
INSERT INTO empresa VALUES (7, 'Içara Vans Ltda', 'Içara Vans', '77888999000107', '4834331007', 7);
INSERT INTO empresa VALUES (8, 'Urussanga Transportes ME', 'Uru Trans', '88999000000108', '4834331008', 8);
INSERT INTO empresa VALUES (9, 'Cocal Fretamentos Ltda', 'Cocal Fret', '99000111000109', '4834331009', 9);
INSERT INTO empresa VALUES (10, 'Orleans Turismo e Fretamento Ltda', 'Orleans Tur', '10111222000110', '4834331010', 10);

-- endereco
INSERT INTO endereco VALUES (1, '88801000', 'Rua Henrique Lage', '120', 'Sala 3', 'Centro', 'Criciúma', 'SC', NULL, NULL);
INSERT INTO endereco VALUES (2, '88802100', 'Av. Centenário', '2500', NULL, 'Santa Bárbara', 'Criciúma', 'SC', NULL, NULL);
INSERT INTO endereco VALUES (3, '88803200', 'Rua Joaquim Nabuco', '45', NULL, 'Comerciário', 'Criciúma', 'SC', NULL, NULL);
INSERT INTO endereco VALUES (4, '88804300', 'Rua Imigrante Meller', '980', 'Galpão', 'Pinheirinho', 'Criciúma', 'SC', NULL, NULL);
INSERT INTO endereco VALUES (5, '88805400', 'Rua Pedro Benedet', '310', NULL, 'Michel', 'Criciúma', 'SC', NULL, NULL);
INSERT INTO endereco VALUES (6, '88806500', 'Rua Coronel Pedro Benedet', '77', NULL, 'Próspera', 'Criciúma', 'SC', NULL, NULL);
INSERT INTO endereco VALUES (7, '88820000', 'Rua XV de Novembro', '15', NULL, 'Centro', 'Içara', 'SC', NULL, NULL);
INSERT INTO endereco VALUES (8, '88840000', 'Rua Padre João Leonir', '200', NULL, 'Centro', 'Urussanga', 'SC', NULL, NULL);
INSERT INTO endereco VALUES (9, '88845000', 'Av. Getúlio Vargas', '1500', 'Bloco B', 'Centro', 'Cocal do Sul', 'SC', NULL, NULL);
INSERT INTO endereco VALUES (10, '88870000', 'Rua Marechal Deodoro', '640', NULL, 'Centro', 'Orleans', 'SC', NULL, NULL);
INSERT INTO endereco VALUES (11, '88806000', 'Av. Universitária', '1105', NULL, 'Universitário', 'Criciúma', 'SC', -28.703100, -49.405200);
INSERT INTO endereco VALUES (12, '88805380', 'Rua Pascoal Meller', '73', NULL, 'Universitário', 'Criciúma', 'SC', -28.700500, -49.409800);
INSERT INTO endereco VALUES (13, '88813600', 'Rua Gabriel Arcanjo', '1550', NULL, 'Vila São José', 'Criciúma', 'SC', -28.678900, -49.395100);
INSERT INTO endereco VALUES (14, '88704900', 'Av. José Acácio Moreira', '787', NULL, 'Dehon', 'Tubarão', 'SC', -28.479300, -49.017600);
INSERT INTO endereco VALUES (15, '88811500', 'Rua General Lauro Sodré', '300', NULL, 'Comerciário', 'Criciúma', 'SC', -28.680700, -49.369900);
INSERT INTO endereco VALUES (16, '88905120', 'Rua Governador Jorge Lacerda', '3201', NULL, 'Jardim das Avenidas', 'Araranguá', 'SC', -28.952600, -49.468300);
INSERT INTO endereco VALUES (17, '88870000', 'Rua Pe. João Leonir Dall Alba', '1000', NULL, 'Murialdo', 'Orleans', 'SC', -28.360400, -49.288200);
INSERT INTO endereco VALUES (18, '88802250', 'Rua Cel. Marcos Rovaris', '205', NULL, 'Centro', 'Criciúma', 'SC', -28.677000, -49.372100);
INSERT INTO endereco VALUES (19, '88820000', 'Rua Dionízio Mondardo', '500', NULL, 'Centro', 'Içara', 'SC', -28.712900, -49.304600);
INSERT INTO endereco VALUES (20, '88840000', 'Rua Dr. Nelson Barbosa', '90', NULL, 'Centro', 'Urussanga', 'SC', -28.518500, -49.320600);
INSERT INTO endereco VALUES (21, '88801010', 'Rua das Acácias', '12', NULL, 'Centro', 'Criciúma', 'SC', -28.680000, -49.370000);
INSERT INTO endereco VALUES (22, '88802020', 'Rua dos Ipês', '345', 'Ap 201', 'Michel', 'Criciúma', 'SC', -28.690000, -49.370000);
INSERT INTO endereco VALUES (23, '88803030', 'Rua Tiradentes', '87', NULL, 'Santa Bárbara', 'Criciúma', 'SC', -28.700000, -49.370000);
INSERT INTO endereco VALUES (24, '88804040', 'Rua São José', '1020', NULL, 'Pinheirinho', 'Criciúma', 'SC', -28.710000, -49.370000);
INSERT INTO endereco VALUES (25, '88805050', 'Rua Rio Branco', '56', 'Casa 2', 'Próspera', 'Criciúma', 'SC', -28.720000, -49.370000);
INSERT INTO endereco VALUES (26, '88806060', 'Rua Santos Dumont', '410', NULL, 'Rio Maina', 'Criciúma', 'SC', -28.730000, -49.370000);
INSERT INTO endereco VALUES (27, '88807070', 'Rua Anita Garibaldi', '99', NULL, 'Pinheirinho', 'Criciúma', 'SC', -28.740000, -49.370000);
INSERT INTO endereco VALUES (28, '88808080', 'Rua Getúlio Vargas', '730', 'Ap 12', 'Operária Nova', 'Criciúma', 'SC', -28.750000, -49.370000);
INSERT INTO endereco VALUES (29, '88809090', 'Rua Sete de Setembro', '1500', NULL, 'Pio Corrêa', 'Criciúma', 'SC', -28.760000, -49.370000);
INSERT INTO endereco VALUES (30, '88810100', 'Rua Marcílio Dias', '28', NULL, 'São Luiz', 'Criciúma', 'SC', -28.770000, -49.370000);

-- estudante
INSERT INTO estudante VALUES (1, 'Ana Beatriz Souza', 'Bia', '11122233301', '48998880001', 'ana.souza@email.com', 1, 'Medicina', 'noite', 21, 1, '17:40:00', 450.00, 10, 'ativo');
INSERT INTO estudante VALUES (2, 'Bruno Henrique Costa', 'Bruno', '11122233302', '48998880002', 'bruno.costa@email.com', 2, 'Engenharia Mecânica', 'noite', 22, 2, '17:45:00', 420.00, 10, 'ativo');
INSERT INTO estudante VALUES (3, 'Camila Rodrigues', 'Cami', '11122233303', '48998880003', 'camila.r@email.com', 3, 'Engenharia Elétrica', 'noite', 23, 3, '17:50:00', 380.00, 5, 'ativo');
INSERT INTO estudante VALUES (4, 'Diego Fernandes', NULL, '11122233304', '48998880004', 'diego.f@email.com', 4, 'Direito', 'noite', 24, 4, '17:15:00', 520.00, 15, 'ativo');
INSERT INTO estudante VALUES (5, 'Eduarda Lima', 'Duda', '11122233305', '48998880005', 'eduarda.lima@email.com', 5, 'Técnico em Automação', 'noite', 25, 5, '17:55:00', 350.00, 5, 'ativo');
INSERT INTO estudante VALUES (6, 'Felipe Augusto Ramos', 'Felipão', '11122233306', '48998880006', NULL, 6, 'Engenharia de Computação', 'noite', 26, 6, '17:00:00', 600.00, 20, 'ativo');
INSERT INTO estudante VALUES (7, 'Gabriela Martins', 'Gabi', '11122233307', '48998880007', 'gabi.martins@email.com', 7, 'Psicologia', 'manha', 27, 7, '06:10:00', 480.00, 10, 'ativo');
INSERT INTO estudante VALUES (8, 'Henrique Oliveira', NULL, '11122233308', '48998880008', 'henrique.o@email.com', 8, 'Administração', 'manha', 28, 8, '06:30:00', 400.00, 10, 'ativo');
INSERT INTO estudante VALUES (9, 'Isabela Pereira', 'Isa', '11122233309', '48998880009', 'isabela.p@email.com', 9, 'Pedagogia', 'tarde', 29, 9, '12:20:00', 360.00, 25, 'ativo');
INSERT INTO estudante VALUES (10, 'João Vitor Almeida', 'JV', '11122233310', '48998880010', 'jv.almeida@email.com', 10, 'Agroecologia', 'tarde', 30, 10, '12:00:00', 390.00, 28, 'inativo');

-- instituicao
INSERT INTO instituicao VALUES (1, 'UNESC - Universidade do Extremo Sul Catarinense', 11);
INSERT INTO instituicao VALUES (2, 'Faculdade SATC', 12);
INSERT INTO instituicao VALUES (3, 'IFSC - Câmpus Criciúma', 13);
INSERT INTO instituicao VALUES (4, 'UNISUL - Câmpus Tubarão', 14);
INSERT INTO instituicao VALUES (5, 'SENAI Criciúma', 15);
INSERT INTO instituicao VALUES (6, 'UFSC - Câmpus Araranguá', 16);
INSERT INTO instituicao VALUES (7, 'UNIBAVE - Orleans', 17);
INSERT INTO instituicao VALUES (8, 'ESUCRI - Escola Superior de Criciúma', 18);
INSERT INTO instituicao VALUES (9, 'Faculdade de Içara', 19);
INSERT INTO instituicao VALUES (10, 'IFSC - Câmpus Urussanga', 20);

-- motorista
INSERT INTO motorista VALUES (1, 1, 1, 'Carlos Eduardo Martins', '12345678901', '48991110001', '01234567801', '2028-03-15', 3200.00, 5, 'ativo');
INSERT INTO motorista VALUES (2, 2, 2, 'João Pedro Rocha', '23456789012', '48991110002', '01234567802', '2027-08-20', 3000.00, 5, 'ativo');
INSERT INTO motorista VALUES (3, 3, 3, 'Marcos Antônio Silva', '34567890123', '48991110003', '01234567803', '2029-01-10', 3500.00, 10, 'ativo');
INSERT INTO motorista VALUES (4, 4, 4, 'Ricardo Souza Lima', '45678901234', '48991110004', '01234567804', '2027-11-30', 3100.00, 5, 'ativo');
INSERT INTO motorista VALUES (5, 5, 5, 'Fernanda Costa Alves', '56789012345', '48991110005', '01234567805', '2028-06-05', 3200.00, 5, 'ativo');
INSERT INTO motorista VALUES (6, 6, 6, 'Paulo Henrique Dias', '67890123456', '48991110006', '01234567806', '2027-04-18', 2900.00, 15, 'ativo');
INSERT INTO motorista VALUES (7, 7, 7, 'Juliana Ferreira', '78901234567', '48991110007', '01234567807', '2029-09-22', 3000.00, 5, 'ativo');
INSERT INTO motorista VALUES (8, 8, 8, 'Anderson Luiz Pereira', '89012345678', '48991110008', '01234567808', '2028-12-01', 3400.00, 10, 'ativo');
INSERT INTO motorista VALUES (9, 9, 9, 'Roberto Carlos Nunes', '90123456789', '48991110009', '01234567809', '2027-07-14', 3000.00, 5, 'ativo');
INSERT INTO motorista VALUES (10, 10, NULL, 'Sérgio Mendes Ramos', '01234567890', '48991110010', '01234567810', '2026-12-31', 2800.00, 5, 'inativo');

-- rota
INSERT INTO rota VALUES (1, 'Centro → UNESC (noite)', 1, 1, 'noite', '18:00:00', '22:40:00', 'ativo');
INSERT INTO rota VALUES (2, 'Michel → SATC (noite)', 2, 2, 'noite', '18:10:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (3, 'Santa Bárbara → IFSC (noite)', 3, 3, 'noite', '18:15:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (4, 'Pinheirinho → UNISUL (noite)', 4, 4, 'noite', '17:30:00', '23:00:00', 'ativo');
INSERT INTO rota VALUES (5, 'Próspera → SENAI (noite)', 5, 5, 'noite', '18:20:00', '22:20:00', 'ativo');
INSERT INTO rota VALUES (6, 'Rio Maina → UFSC Araranguá (noite)', 6, 6, 'noite', '17:15:00', '23:10:00', 'ativo');
INSERT INTO rota VALUES (7, 'Pinheirinho → UNIBAVE (manhã)', 7, 7, 'manha', '06:30:00', '12:10:00', 'ativo');
INSERT INTO rota VALUES (8, 'Operária → ESUCRI (manhã)', 8, 8, 'manha', '06:50:00', '12:00:00', 'ativo');
INSERT INTO rota VALUES (9, 'Pio Corrêa → Içara (tarde)', 9, 9, 'tarde', '12:40:00', '18:00:00', 'ativo');
INSERT INTO rota VALUES (10, 'São Luiz → IFSC Urussanga (tarde)', 9, 10, 'tarde', '12:20:00', '17:40:00', 'ativo');

-- rota_dia
INSERT INTO rota_dia VALUES (1, 1);
INSERT INTO rota_dia VALUES (2, 1);
INSERT INTO rota_dia VALUES (3, 1);
INSERT INTO rota_dia VALUES (4, 1);
INSERT INTO rota_dia VALUES (5, 1);
INSERT INTO rota_dia VALUES (6, 1);
INSERT INTO rota_dia VALUES (7, 1);
INSERT INTO rota_dia VALUES (8, 1);
INSERT INTO rota_dia VALUES (1, 2);
INSERT INTO rota_dia VALUES (2, 2);
INSERT INTO rota_dia VALUES (3, 2);
INSERT INTO rota_dia VALUES (4, 2);
INSERT INTO rota_dia VALUES (5, 2);
INSERT INTO rota_dia VALUES (6, 2);
INSERT INTO rota_dia VALUES (7, 2);
INSERT INTO rota_dia VALUES (8, 2);
INSERT INTO rota_dia VALUES (1, 3);
INSERT INTO rota_dia VALUES (2, 3);
INSERT INTO rota_dia VALUES (3, 3);
INSERT INTO rota_dia VALUES (4, 3);
INSERT INTO rota_dia VALUES (5, 3);
INSERT INTO rota_dia VALUES (6, 3);
INSERT INTO rota_dia VALUES (7, 3);
INSERT INTO rota_dia VALUES (8, 3);
INSERT INTO rota_dia VALUES (1, 4);
INSERT INTO rota_dia VALUES (2, 4);
INSERT INTO rota_dia VALUES (3, 4);
INSERT INTO rota_dia VALUES (4, 4);
INSERT INTO rota_dia VALUES (5, 4);
INSERT INTO rota_dia VALUES (6, 4);
INSERT INTO rota_dia VALUES (7, 4);
INSERT INTO rota_dia VALUES (8, 4);
INSERT INTO rota_dia VALUES (1, 5);
INSERT INTO rota_dia VALUES (2, 5);
INSERT INTO rota_dia VALUES (3, 5);
INSERT INTO rota_dia VALUES (4, 5);
INSERT INTO rota_dia VALUES (5, 5);
INSERT INTO rota_dia VALUES (6, 5);
INSERT INTO rota_dia VALUES (7, 5);
INSERT INTO rota_dia VALUES (8, 5);
INSERT INTO rota_dia VALUES (9, 1);
INSERT INTO rota_dia VALUES (9, 2);
INSERT INTO rota_dia VALUES (9, 3);
INSERT INTO rota_dia VALUES (9, 4);
INSERT INTO rota_dia VALUES (9, 5);
INSERT INTO rota_dia VALUES (9, 6);
INSERT INTO rota_dia VALUES (10, 1);
INSERT INTO rota_dia VALUES (10, 3);
INSERT INTO rota_dia VALUES (10, 5);

-- titulo_pagar
INSERT INTO titulo_pagar VALUES (1, 1, 'salario', 1, NULL, 'Carlos Eduardo Martins', 'Salário Carlos Eduardo Martins - 09/2026', '2026-09-01', 3200.00, '2026-10-05', '2026-10-05', 3200.00, 'pago');
INSERT INTO titulo_pagar VALUES (2, 2, 'salario', 2, NULL, 'João Pedro Rocha', 'Salário João Pedro Rocha - 09/2026', '2026-09-01', 3000.00, '2026-10-05', '2026-10-05', 3000.00, 'pago');
INSERT INTO titulo_pagar VALUES (3, 3, 'salario', 3, NULL, 'Marcos Antônio Silva', 'Salário Marcos Antônio Silva - 09/2026', '2026-09-01', 3500.00, '2026-10-10', '2026-10-10', 3500.00, 'pago');
INSERT INTO titulo_pagar VALUES (4, 1, 'salario', 1, NULL, 'Carlos Eduardo Martins', 'Salário Carlos Eduardo Martins - 10/2026', '2026-10-01', 3200.00, '2026-11-05', NULL, NULL, 'aberto');
INSERT INTO titulo_pagar VALUES (5, 2, 'salario', 2, NULL, 'João Pedro Rocha', 'Salário João Pedro Rocha - 10/2026', '2026-10-01', 3000.00, '2026-11-05', NULL, NULL, 'aberto');
INSERT INTO titulo_pagar VALUES (6, 1, 'combustivel', NULL, 1, 'Posto Rodovia Ltda', 'Diesel S10 - outubro', '2026-10-01', 1850.75, '2026-10-31', NULL, NULL, 'aberto');
INSERT INTO titulo_pagar VALUES (7, 3, 'manutencao', NULL, 3, 'Mecânica Boa Viagem', 'Troca de pastilhas e revisão 50 mil km', '2026-10-01', 1240.00, '2026-10-20', '2026-10-20', 1240.00, 'pago');
INSERT INTO titulo_pagar VALUES (8, 5, 'seguro', NULL, 5, 'Seguradora Sul Ltda', 'Seguro anual - parcela 10/12', '2026-10-01', 420.30, '2026-10-15', '2026-10-15', 420.30, 'pago');
INSERT INTO titulo_pagar VALUES (9, 7, 'impostos', NULL, 7, 'Governo de SC', 'IPVA 2026 - parcela 10', '2026-10-01', 310.00, '2026-10-25', NULL, NULL, 'cancelado');
INSERT INTO titulo_pagar VALUES (10, 4, 'outros', NULL, NULL, 'Gráfica Criciúma', 'Adesivos e carteirinhas dos alunos', '2026-10-01', 260.00, '2026-11-10', NULL, NULL, 'aberto');

-- titulo_receber
INSERT INTO titulo_receber VALUES (1, 1, '2026-10-01', 450.00, '2026-10-10', '2026-10-08', 450.00, 'pago');
INSERT INTO titulo_receber VALUES (2, 2, '2026-10-01', 420.00, '2026-10-10', '2026-10-10', 420.00, 'pago');
INSERT INTO titulo_receber VALUES (3, 3, '2026-10-01', 380.00, '2026-10-05', '2026-10-04', 380.00, 'pago');
INSERT INTO titulo_receber VALUES (4, 4, '2026-10-01', 520.00, '2026-10-15', '2026-10-17', 530.40, 'pago');
INSERT INTO titulo_receber VALUES (5, 5, '2026-10-01', 350.00, '2026-10-05', NULL, NULL, 'aberto');
INSERT INTO titulo_receber VALUES (6, 6, '2026-10-01', 600.00, '2026-10-20', '2026-10-20', 600.00, 'pago');
INSERT INTO titulo_receber VALUES (7, 7, '2026-10-01', 480.00, '2026-10-10', NULL, NULL, 'aberto');
INSERT INTO titulo_receber VALUES (8, 8, '2026-10-01', 400.00, '2026-10-10', '2026-10-09', 400.00, 'pago');
INSERT INTO titulo_receber VALUES (9, 9, '2026-10-01', 360.00, '2026-10-25', NULL, NULL, 'aberto');
INSERT INTO titulo_receber VALUES (10, 10, '2026-10-01', 390.00, '2026-10-28', NULL, NULL, 'cancelado');

-- veiculo
INSERT INTO veiculo VALUES (1, 1, 'QJA1B23', 'Mercedes-Benz Sprinter 416', 'Branca', 20, 'ativo');
INSERT INTO veiculo VALUES (2, 2, 'QJB2C34', 'Renault Master Minibus', 'Branca', 16, 'ativo');
INSERT INTO veiculo VALUES (3, 3, 'MHB1234', 'Volkswagen Volare W9', 'Prata', 28, 'ativo');
INSERT INTO veiculo VALUES (4, 4, 'QJD4E56', 'Iveco Daily Minibus', 'Branca', 19, 'ativo');
INSERT INTO veiculo VALUES (5, 5, 'QJE5F67', 'Mercedes-Benz Sprinter 515', 'Azul', 20, 'ativo');
INSERT INTO veiculo VALUES (6, 6, 'MKC5678', 'Fiat Ducato Minibus', 'Branca', 16, 'ativo');
INSERT INTO veiculo VALUES (7, 7, 'QJG7H89', 'Peugeot Boxer Minibus', 'Prata', 16, 'ativo');
INSERT INTO veiculo VALUES (8, 8, 'QJH8I90', 'Marcopolo Volare V8L', 'Branca', 24, 'ativo');
INSERT INTO veiculo VALUES (9, 9, 'QJI9J01', 'Renault Master Executiva', 'Preta', 15, 'ativo');
INSERT INTO veiculo VALUES (10, 10, 'MLD9012', 'Mercedes-Benz Sprinter 416', 'Branca', 20, 'inativo');

-- viagem
INSERT INTO viagem VALUES (1, 1, 1, 1, '2026-10-29', 'ida', '2026-10-29 17:35:00', '2026-10-29 18:00:00', 'concluida');
INSERT INTO viagem VALUES (2, 2, 2, 2, '2026-10-29', 'ida', '2026-10-29 17:40:00', '2026-10-29 18:12:00', 'concluida');
INSERT INTO viagem VALUES (3, 3, 3, 3, '2026-10-29', 'ida', '2026-10-29 17:45:00', '2026-10-29 18:15:00', 'concluida');
INSERT INTO viagem VALUES (4, 4, 4, 4, '2026-10-29', 'ida', '2026-10-29 17:10:00', '2026-10-29 17:32:00', 'concluida');
INSERT INTO viagem VALUES (5, 5, 5, 5, '2026-10-29', 'ida', '2026-10-29 17:50:00', '2026-10-29 18:18:00', 'concluida');
INSERT INTO viagem VALUES (6, 6, 6, 6, '2026-10-29', 'ida', '2026-10-29 16:55:00', '2026-10-29 17:20:00', 'concluida');
INSERT INTO viagem VALUES (7, 7, 7, 7, '2026-10-29', 'ida', '2026-10-29 06:05:00', '2026-10-29 06:31:00', 'concluida');
INSERT INTO viagem VALUES (8, 8, 8, 8, '2026-10-29', 'ida', '2026-10-29 06:25:00', NULL, 'cancelada');
INSERT INTO viagem VALUES (9, 9, 9, 9, '2026-10-30', 'ida', NULL, NULL, 'agendada');
INSERT INTO viagem VALUES (10, 10, 9, 9, '2026-10-30', 'ida', NULL, NULL, 'agendada');

-- =============================================================================
-- Índices
-- =============================================================================

-- UNIQUE NULLS NOT DISTINCT: no SQLite NULLs são sempre distintos, então o
-- índice usa ifnull para que dois feriados gerais na mesma data colidam.
CREATE UNIQUE INDEX dia_sem_aula_data_fk_instituicao_key
    ON dia_sem_aula (data, ifnull(fk_instituicao, -1));

CREATE INDEX ix_area_motorista ON area (fk_motorista);
CREATE INDEX ix_chamada_estudante ON chamada (fk_estudante);
CREATE INDEX ix_estudante_area ON estudante (fk_area);
CREATE INDEX ix_pagar_venc ON titulo_pagar (data_vencimento) WHERE status = 'aberto';
CREATE INDEX ix_receber_venc ON titulo_receber (data_vencimento) WHERE status = 'aberto';
CREATE INDEX ix_viagem_data ON viagem (data);
CREATE UNIQUE INDEX ux_salario_mes ON titulo_pagar (fk_motorista, competencia) WHERE categoria = 'salario';

-- =============================================================================
-- Views
-- =============================================================================

CREATE VIEW vw_frequencia AS
SELECT e.id,
       e.nome,
       count(*) FILTER (WHERE c.status = 'presente') AS presencas,
       count(*) FILTER (WHERE c.status = 'nao_vai')  AS avisou_que_nao_ia,
       count(*) FILTER (WHERE c.status = 'ausente')  AS faltas_sem_aviso,
       round(100.0 * count(*) FILTER (WHERE c.status = 'presente')
             / nullif(count(*) FILTER (WHERE c.status <> 'pendente'), 0), 1) AS perc_presenca
FROM estudante e
JOIN chamada c ON c.fk_estudante = e.id
GROUP BY e.id, e.nome;

CREATE VIEW vw_inadimplentes AS
SELECT e.nome,
       e.celular,
       t.competencia,
       t.valor,
       t.data_vencimento,
       CAST(julianday(date('now', 'localtime')) - julianday(t.data_vencimento) AS INTEGER) AS dias_atraso
FROM titulo_receber t
JOIN estudante e ON e.id = t.fk_estudante
WHERE t.status = 'aberto'
  AND t.data_vencimento < date('now', 'localtime');

CREATE VIEW vw_resultado_mes AS
-- round(..., 2): o SQLite guarda NUMERIC como ponto flutuante
SELECT competencia,
       round(sum(entradas), 2)               AS receitas,
       round(sum(saidas), 2)                 AS despesas,
       round(sum(entradas) - sum(saidas), 2) AS resultado
FROM (SELECT competencia, valor AS entradas, 0 AS saidas
        FROM titulo_receber WHERE status <> 'cancelado'
      UNION ALL
      SELECT competencia, 0, valor
        FROM titulo_pagar WHERE status <> 'cancelado') x
GROUP BY competencia;

-- =============================================================================
-- Trigger: define a área do estudante pelo endereço
--
-- O SQLite não tem um tipo de polígono, então o ponto-no-polígono é feito por
-- "ray casting": o texto '((x,y),(x,y),...)' vira um array JSON [x,y,x,y,...],
-- cada par vira um vértice, e o ponto está dentro se uma semirreta horizontal
-- saindo dele cruza as arestas um número ímpar de vezes.
-- Um ponto exatamente sobre a borda pode não ser considerado dentro.
--
-- O SQLite não deixa alterar NEW em BEFORE, por isso são dois triggers AFTER
-- que fazem um UPDATE na própria linha.
-- =============================================================================

CREATE VIEW vw_area_vertice AS
WITH poligono AS (
    SELECT id, '[' || replace(replace(coordenadas, '(', ''), ')', '') || ']' AS pontos
    FROM area
)
SELECT p.id                                              AS fk_area,
       j.key / 2                                         AS ordem,
       json_array_length(p.pontos) / 2                   AS total,
       j.value                                           AS x,
       json_extract(p.pontos, '$[' || (j.key + 1) || ']') AS y
FROM poligono p, json_each(p.pontos) j
WHERE j.key % 2 = 0;

CREATE VIEW vw_area_aresta AS
SELECT a.fk_area, a.x AS x1, a.y AS y1, b.x AS x2, b.y AS y2
FROM vw_area_vertice a
JOIN vw_area_vertice b ON b.fk_area = a.fk_area AND b.ordem = (a.ordem + 1) % a.total;

CREATE TRIGGER tg_estudante_area_insert
AFTER INSERT ON estudante
FOR EACH ROW
BEGIN
    UPDATE estudante SET fk_area = (
        SELECT ar.id
        FROM area ar
        JOIN endereco en ON en.id = NEW.fk_endereco
        WHERE ar.status = 'ativo'
          AND (SELECT count(*) FROM vw_area_aresta r
               WHERE r.fk_area = ar.id
                 AND (r.y1 > en.latitude) <> (r.y2 > en.latitude)
                 AND en.longitude < (r.x2 - r.x1) * (en.latitude - r.y1) / (r.y2 - r.y1) + r.x1
              ) % 2 = 1
        ORDER BY ar.id
        LIMIT 1)
    WHERE id = NEW.id;
END;

CREATE TRIGGER tg_estudante_area_update
AFTER UPDATE OF fk_endereco ON estudante
FOR EACH ROW
BEGIN
    UPDATE estudante SET fk_area = (
        SELECT ar.id
        FROM area ar
        JOIN endereco en ON en.id = NEW.fk_endereco
        WHERE ar.status = 'ativo'
          AND (SELECT count(*) FROM vw_area_aresta r
               WHERE r.fk_area = ar.id
                 AND (r.y1 > en.latitude) <> (r.y2 > en.latitude)
                 AND en.longitude < (r.x2 - r.x1) * (en.latitude - r.y1) / (r.y2 - r.y1) + r.x1
              ) % 2 = 1
        ORDER BY ar.id
        LIMIT 1)
    WHERE id = NEW.id;
END;

COMMIT;
PRAGMA foreign_keys = ON;
