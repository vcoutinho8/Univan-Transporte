-- =============================================================================
-- UniVan · banco em SQLite
--
-- Estrutura completa do banco (SQLite 3.30 ou superior): tabelas, restrições,
-- índices, views, trigger e dados de teste (10 registros por tabela; 41 passageiros).
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
    id               INTEGER PRIMARY KEY,
    nome             TEXT NOT NULL,
    fk_endereco      INTEGER NOT NULL REFERENCES endereco (id),
    -- Ponto de parada na rua (onde a van para). Vazio = usa a localização do endereço.
    parada_latitude  NUMERIC,
    parada_longitude NUMERIC
);

-- Paradas extras da faculdade além da principal (ex.: UVV: Biopráticas e fundos). O passageiro escolhe
-- a dele (estudante.fk_parada); sem escolha, desce/embarca na parada principal da instituição.
CREATE TABLE instituicao_parada (
    id             INTEGER PRIMARY KEY,
    fk_instituicao INTEGER NOT NULL REFERENCES instituicao (id) ON DELETE CASCADE,
    nome           TEXT NOT NULL,
    latitude       NUMERIC NOT NULL,
    longitude      NUMERIC NOT NULL,
    CONSTRAINT instituicao_parada_nome_key UNIQUE (fk_instituicao, nome)
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
    apelido       TEXT,
    cpf           TEXT NOT NULL,
    celular       TEXT,
    cnh           TEXT NOT NULL,
    cnh_validade  TEXT NOT NULL,
    salario       NUMERIC,
    dia_pagamento INTEGER DEFAULT 5,
    status        TEXT NOT NULL DEFAULT 'ativo',
    -- Casa/garagem do motorista: de onde a ida sai e onde a volta termina.
    fk_endereco   INTEGER REFERENCES endereco (id),
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
    -- Parada da faculdade onde desce/embarca (vazio = parada principal da instituição).
    fk_parada        INTEGER REFERENCES instituicao_parada (id),
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

-- Anos cujos feriados nacionais já entraram no calendário (BrasilAPI ou, fora do ar, o cálculo
-- local). Importa uma vez por ano: o feriado que o admin excluir (cancelar) não volta sozinho.
CREATE TABLE feriado_importado (
    ano          INTEGER PRIMARY KEY,
    fonte        TEXT NOT NULL,
    importado_em TEXT NOT NULL
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
    -- Encerrada antes da hora (emergência): pneu, troca de motorista...
    motivo_encerramento TEXT,
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
    horario_desembarque TEXT,
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

-- ---------------------------------------------------------------- Acesso ao sistema

-- Quem entra no sistema. Perfis: admin (tudo), auxiliar (apoio do admin, sem editar nem
-- inativar cadastros) e motorista (as próprias viagens e chamadas; precisa de fk_motorista).
-- A senha nunca é guardada: só o hash scrypt ("scrypt$n$r$p$sal$hash").
CREATE TABLE usuario (
    id            INTEGER PRIMARY KEY,
    fk_empresa    INTEGER NOT NULL REFERENCES empresa (id),
    nome          TEXT NOT NULL,
    login         TEXT NOT NULL,
    senha_hash    TEXT NOT NULL,
    perfil        TEXT NOT NULL,
    fk_motorista  INTEGER REFERENCES motorista (id),
    status        TEXT NOT NULL DEFAULT 'ativo',
    ultimo_acesso TEXT,
    -- Contato e documento (opcionais; o CPF do motorista fica no cadastro de motorista).
    email         TEXT,
    cpf           TEXT,
    -- 1 = senha padrão (123456): no próximo login a pessoa cria a dela.
    trocar_senha  INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT usuario_login_key UNIQUE (login),
    CONSTRAINT usuario_login_check CHECK (length(login) BETWEEN 3 AND 30 AND login NOT GLOB '*[^a-z0-9._-]*'),
    CONSTRAINT usuario_fk_motorista_key UNIQUE (fk_motorista),
    CONSTRAINT usuario_perfil_check CHECK (perfil IN ('admin', 'auxiliar', 'motorista')),
    CONSTRAINT usuario_motorista_check CHECK ((perfil = 'motorista') = (fk_motorista IS NOT NULL)),
    CONSTRAINT usuario_status_check CHECK (status IN ('ativo', 'inativo'))
);

-- =============================================================================
-- Dados de teste (passageiros de Guarapari indo para Vila Velha/Vitória, ES)
-- =============================================================================

-- area (contornos dos bairros: OpenStreetMap, simplificados)
INSERT INTO area VALUES (1, 'Centro', '((-40.507475,-20.669402),(-40.506673,-20.673133),(-40.505434,-20.673921),(-40.502632,-20.673538),(-40.501913,-20.674149),(-40.504432,-20.677286),(-40.502442,-20.678057),(-40.501370,-20.677815),(-40.501656,-20.677016),(-40.500723,-20.675961),(-40.501666,-20.676790),(-40.501718,-20.676235),(-40.499559,-20.674988),(-40.497439,-20.674967),(-40.496839,-20.676767),(-40.495953,-20.676596),(-40.496201,-20.675199),(-40.495283,-20.675356),(-40.495746,-20.674794),(-40.495254,-20.674082),(-40.496929,-20.674789),(-40.497323,-20.673526),(-40.496760,-20.673464),(-40.496255,-20.671620),(-40.495053,-20.671678),(-40.494799,-20.672326),(-40.493644,-20.669507),(-40.492650,-20.669938),(-40.491314,-20.669067),(-40.491823,-20.668351),(-40.491530,-20.667415),(-40.492780,-20.667036),(-40.493152,-20.667627),(-40.494195,-20.666873),(-40.492405,-20.665134),(-40.493886,-20.664767),(-40.495504,-20.665373),(-40.499939,-20.668896),(-40.504759,-20.669705),(-40.507309,-20.669414))', 1, 'ativo');
INSERT INTO area VALUES (2, 'Muquiçaba', '((-40.506917,-20.656136),(-40.505375,-20.657152),(-40.504581,-20.658006),(-40.503481,-20.658137),(-40.500926,-20.666661),(-40.501710,-20.667852),(-40.501603,-20.668538),(-40.501026,-20.668821),(-40.499939,-20.668896),(-40.499166,-20.668412),(-40.497030,-20.666322),(-40.497242,-20.666023),(-40.497016,-20.665621),(-40.497236,-20.665457),(-40.497450,-20.664585),(-40.497242,-20.663067),(-40.496452,-20.662568),(-40.496139,-20.662668),(-40.495999,-20.663098),(-40.495634,-20.663285),(-40.494527,-20.662954),(-40.494865,-20.662388),(-40.495024,-20.662395),(-40.494751,-20.661828),(-40.495128,-20.661392),(-40.494766,-20.660219),(-40.496148,-20.660045),(-40.495998,-20.658476),(-40.496268,-20.655822),(-40.494630,-20.651546),(-40.496627,-20.653317),(-40.496916,-20.653875),(-40.497790,-20.653099),(-40.501958,-20.654727),(-40.503396,-20.654811),(-40.503953,-20.652985))', 2, 'ativo');
INSERT INTO area VALUES (3, 'Praia do Morro', '((-40.496268,-20.655822),(-40.496148,-20.660045),(-40.494766,-20.660219),(-40.488219,-20.655008),(-40.483711,-20.653042),(-40.479219,-20.652513),(-40.475714,-20.653372),(-40.473587,-20.655082),(-40.475501,-20.657870),(-40.475088,-20.661037),(-40.472296,-20.659738),(-40.471854,-20.661091),(-40.468901,-20.660693),(-40.467474,-20.658229),(-40.466632,-20.658682),(-40.466352,-20.657257),(-40.468910,-20.656971),(-40.465309,-20.654427),(-40.466201,-20.653806),(-40.464969,-20.652393),(-40.471998,-20.653962),(-40.472536,-20.650732),(-40.470002,-20.649134),(-40.469706,-20.647671),(-40.475971,-20.646993),(-40.478835,-20.645505),(-40.481882,-20.641292),(-40.483897,-20.640569),(-40.494710,-20.651477),(-40.496175,-20.655658))', 3, 'ativo');
INSERT INTO area VALUES (4, 'Itapebussu', '((-40.515738,-20.658472),(-40.514950,-20.661191),(-40.515013,-20.662197),(-40.514121,-20.664162),(-40.514157,-20.664561),(-40.515022,-20.665481),(-40.514117,-20.667096),(-40.513361,-20.667745),(-40.511711,-20.668178),(-40.509837,-20.668965),(-40.508122,-20.669354),(-40.504759,-20.669705),(-40.499939,-20.668896),(-40.501333,-20.668743),(-40.501725,-20.668184),(-40.501525,-20.667490),(-40.500926,-20.666661),(-40.503481,-20.658137),(-40.504581,-20.658006),(-40.505375,-20.657152),(-40.507194,-20.655930),(-40.507867,-20.656608),(-40.509971,-20.657151),(-40.510612,-20.657125),(-40.511095,-20.657425),(-40.513414,-20.657211),(-40.514731,-20.656822),(-40.515306,-20.656869),(-40.515586,-20.656994),(-40.515666,-20.658092))', 4, 'ativo');
INSERT INTO area VALUES (5, 'Jardim Boa Vista', '((-40.483897,-20.640569),(-40.482788,-20.641095),(-40.482632,-20.640802),(-40.481882,-20.641292),(-40.482022,-20.641453),(-40.481005,-20.642579),(-40.479758,-20.643475),(-40.480198,-20.644033),(-40.478835,-20.645505),(-40.478698,-20.645385),(-40.477797,-20.645691),(-40.475838,-20.645276),(-40.474266,-20.641575),(-40.473429,-20.641172),(-40.474013,-20.640963),(-40.472835,-20.639097),(-40.473715,-20.638979),(-40.474041,-20.638506),(-40.474600,-20.638396),(-40.477282,-20.639223),(-40.477907,-20.639593),(-40.479027,-20.639704),(-40.481167,-20.638210),(-40.481319,-20.637646),(-40.483151,-20.639735))', 3, 'ativo');
INSERT INTO area VALUES (6, 'Ipiranga', '((-40.514250,-20.675443),(-40.513935,-20.676391),(-40.512773,-20.677204),(-40.512656,-20.677984),(-40.513305,-20.677481),(-40.512960,-20.679475),(-40.513128,-20.679516),(-40.512619,-20.680198),(-40.512728,-20.681330),(-40.510929,-20.681449),(-40.507941,-20.681220),(-40.508376,-20.682801),(-40.506307,-20.684244),(-40.503871,-20.682171),(-40.503464,-20.680681),(-40.503042,-20.680012),(-40.502594,-20.679880),(-40.502472,-20.680092),(-40.502201,-20.680066),(-40.502049,-20.679853),(-40.501789,-20.680086),(-40.501718,-20.679880),(-40.501516,-20.679898),(-40.501957,-20.678450),(-40.501370,-20.677815),(-40.502442,-20.678057),(-40.503311,-20.677847),(-40.506209,-20.676572),(-40.507397,-20.675736),(-40.508080,-20.674810),(-40.509070,-20.674048),(-40.509668,-20.673135),(-40.510358,-20.673576),(-40.510895,-20.673159),(-40.514149,-20.675410))', 1, 'ativo');
INSERT INTO area VALUES (7, 'Bela Vista', '((-40.517757,-20.641572),(-40.517507,-20.642925),(-40.516884,-20.643972),(-40.514796,-20.645507),(-40.510672,-20.640707),(-40.510841,-20.639784),(-40.509567,-20.638770),(-40.508762,-20.637023),(-40.509112,-20.636514),(-40.511241,-20.637155),(-40.511072,-20.637697),(-40.512473,-20.637971),(-40.512495,-20.638603),(-40.513042,-20.638915),(-40.513626,-20.638743),(-40.514047,-20.638122),(-40.514641,-20.638458),(-40.514601,-20.639633),(-40.515078,-20.639959),(-40.515191,-20.638740),(-40.515929,-20.637677),(-40.516394,-20.639170),(-40.516737,-20.639399),(-40.517625,-20.639380),(-40.517756,-20.641452))', 2, 'ativo');
INSERT INTO area VALUES (8, 'Lameirão', '((-40.550854,-20.690285),(-40.550073,-20.692763),(-40.548819,-20.693187),(-40.548628,-20.697598),(-40.547568,-20.699740),(-40.542819,-20.697179),(-40.540890,-20.699141),(-40.537776,-20.699985),(-40.534823,-20.703851),(-40.531307,-20.705217),(-40.529358,-20.708276),(-40.529726,-20.709878),(-40.527755,-20.711476),(-40.524862,-20.718338),(-40.525920,-20.719607),(-40.528511,-20.719520),(-40.525839,-20.720231),(-40.523211,-20.721944),(-40.515813,-20.708899),(-40.513169,-20.696976),(-40.508239,-20.686688),(-40.506307,-20.684244),(-40.508295,-20.682798),(-40.510745,-20.682370),(-40.511169,-20.684301),(-40.512863,-20.686388),(-40.514446,-20.686986),(-40.517553,-20.686606),(-40.521342,-20.688181),(-40.529669,-20.686957),(-40.533978,-20.685353),(-40.535260,-20.686394),(-40.537916,-20.687004),(-40.538402,-20.687735),(-40.542876,-20.688497),(-40.547349,-20.688443),(-40.550620,-20.689599),(-40.550853,-20.690192))', 4, 'ativo');
INSERT INTO area VALUES (9, 'Santa Mônica', '((-40.466803,-20.618756),(-40.466379,-20.619615),(-40.466507,-20.621438),(-40.466052,-20.623087),(-40.466009,-20.624593),(-40.464653,-20.624566),(-40.464261,-20.623976),(-40.463749,-20.623712),(-40.460104,-20.623255),(-40.458296,-20.623265),(-40.453969,-20.623810),(-40.453388,-20.621401),(-40.453776,-20.621329),(-40.452886,-20.616717),(-40.454361,-20.616417),(-40.452437,-20.614464),(-40.452283,-20.614094),(-40.454667,-20.613593),(-40.458023,-20.611648),(-40.458972,-20.611403),(-40.461467,-20.611245),(-40.461559,-20.612565),(-40.462259,-20.613456),(-40.462626,-20.614339),(-40.464593,-20.617478),(-40.465933,-20.617922),(-40.466636,-20.618650))', 5, 'ativo');
INSERT INTO area VALUES (10, 'Aeroporto', '((-40.498415,-20.652573),(-40.496916,-20.653875),(-40.496627,-20.653317),(-40.494389,-20.651203),(-40.492314,-20.648744),(-40.490459,-20.647952),(-40.485453,-20.642325),(-40.489383,-20.638864),(-40.489343,-20.639223),(-40.489928,-20.639406),(-40.490238,-20.639838),(-40.491224,-20.640522),(-40.492498,-20.640798),(-40.493897,-20.640401),(-40.494494,-20.639399),(-40.494695,-20.639551),(-40.494930,-20.640000),(-40.494492,-20.641063),(-40.494726,-20.642509),(-40.495788,-20.643624),(-40.496455,-20.645437),(-40.496381,-20.648328),(-40.496551,-20.649047),(-40.497218,-20.650702),(-40.498142,-20.652334))', 5, 'ativo');

-- chamada
INSERT INTO chamada VALUES (1, 1, 'presente', '17:40:00', NULL, '2026-10-29 17:41:00', NULL);
INSERT INTO chamada VALUES (2, 2, 'presente', '17:45:00', NULL, '2026-10-29 17:46:00', NULL);
INSERT INTO chamada VALUES (3, 3, 'nao_vai', '17:50:00', '2026-10-29 14:20:00', NULL, NULL);
INSERT INTO chamada VALUES (4, 4, 'presente', '17:15:00', NULL, '2026-10-29 17:16:00', NULL);
INSERT INTO chamada VALUES (5, 5, 'ausente', '17:55:00', NULL, NULL, NULL);
INSERT INTO chamada VALUES (6, 6, 'presente', '17:00:00', NULL, '2026-10-29 17:02:00', NULL);
INSERT INTO chamada VALUES (7, 7, 'presente', '06:10:00', NULL, '2026-10-29 06:11:00', NULL);
INSERT INTO chamada VALUES (8, 8, 'nao_vai', '06:30:00', '2026-10-28 21:00:00', NULL, NULL);
INSERT INTO chamada VALUES (9, 9, 'pendente', '12:20:00', NULL, NULL, NULL);
INSERT INTO chamada VALUES (10, 10, 'pendente', '12:00:00', NULL, NULL, NULL);

-- dia_sem_aula
INSERT INTO dia_sem_aula VALUES (1, '2026-11-02', NULL, 'Finados');
INSERT INTO dia_sem_aula VALUES (2, '2026-11-15', NULL, 'Proclamação da República');
INSERT INTO dia_sem_aula VALUES (3, '2026-11-20', NULL, 'Dia da Consciência Negra');
INSERT INTO dia_sem_aula VALUES (4, '2026-12-25', NULL, 'Natal');
INSERT INTO dia_sem_aula VALUES (5, '2027-01-01', NULL, 'Confraternização Universal');
INSERT INTO dia_sem_aula VALUES (6, '2026-11-06', 1, 'Semana acadêmica UVV');
INSERT INTO dia_sem_aula VALUES (7, '2026-11-13', 2, 'Conselho de classe UniSales');
INSERT INTO dia_sem_aula VALUES (8, '2026-11-27', 4, 'Formatura Novo Milênio');
INSERT INTO dia_sem_aula VALUES (9, '2026-12-04', 6, 'Recesso UFES');
INSERT INTO dia_sem_aula VALUES (10, '2026-11-19', 8, 'Jornada pedagógica IFES Guarapari');

-- empresa
INSERT INTO empresa VALUES (1, 'Guarapari Vans Transportes Ltda', 'Guarapari Vans', '11222333000101', '2733611001', 1);
INSERT INTO empresa VALUES (2, 'Rota Certa Fretamentos Ltda', 'Rota Certa', '22333444000102', '2733611002', 2);
INSERT INTO empresa VALUES (3, 'Expresso Canela Verde Ltda', 'Canela Verde', '33444555000103', '2733611003', 3);
INSERT INTO empresa VALUES (4, 'Universitário Capixaba Turismo Ltda', 'Uni Capixaba', '44555666000104', '2733611004', 4);
INSERT INTO empresa VALUES (5, 'Trilha Fretamento e Turismo Ltda', 'Trilha', '55666777000105', '2733611005', 5);
INSERT INTO empresa VALUES (6, 'Caminho do Saber Transportes ME', 'Caminho do Saber', '66777888000106', '2733611006', 6);
INSERT INTO empresa VALUES (7, 'Meaípe Vans Ltda', 'Meaípe Vans', '77888999000107', '2733611007', 7);
INSERT INTO empresa VALUES (8, 'Setiba Transportes ME', 'Setiba Trans', '88999000000108', '2733611008', 8);
INSERT INTO empresa VALUES (9, 'Anchieta Fretamentos Ltda', 'Anchieta Fret', '99000111000109', '2733611009', 9);
INSERT INTO empresa VALUES (10, 'Vila Velha Turismo e Fretamento Ltda', 'VV Tur', '10111222000110', '2733611010', 10);

-- endereco (1-10 empresas, 11-20 instituições, 21+ passageiros; coordenadas do OpenStreetMap)
INSERT INTO endereco VALUES (1, '29200260', 'Rua Joaquim da Silva Lima', '100', 'Sala 2', 'Centro', 'Guarapari', 'ES', NULL, NULL);
INSERT INTO endereco VALUES (2, '29214005', 'Rodovia Jones dos Santos Neves', '1500', NULL, 'Muquiçaba', 'Guarapari', 'ES', NULL, NULL);
INSERT INTO endereco VALUES (3, '29100011', 'Avenida Champagnat', '820', NULL, 'Centro', 'Vila Velha', 'ES', NULL, NULL);
INSERT INTO endereco VALUES (4, '29200500', 'Avenida Padre José de Anchieta', '455', 'Galpão', 'Ipiranga', 'Guarapari', 'ES', NULL, NULL);
INSERT INTO endereco VALUES (5, '29200180', 'Rua Getúlio Vargas', '310', NULL, 'Centro', 'Guarapari', 'ES', NULL, NULL);
INSERT INTO endereco VALUES (6, '29214070', 'Avenida Ewerson Abreu Sodré', '77', NULL, 'Muquiçaba', 'Guarapari', 'ES', NULL, NULL);
INSERT INTO endereco VALUES (7, '29208000', 'Rodovia do Sol', '4200', NULL, 'Meaípe', 'Guarapari', 'ES', NULL, NULL);
INSERT INTO endereco VALUES (8, '29221000', 'Rua Alfa', '15', NULL, 'Setiba', 'Guarapari', 'ES', NULL, NULL);
INSERT INTO endereco VALUES (9, '29122000', 'Avenida Carlos Lindenberg', '1500', 'Bloco B', 'Glória', 'Vila Velha', 'ES', NULL, NULL);
INSERT INTO endereco VALUES (10, '29107010', 'Avenida Luciano das Neves', '640', NULL, 'Divino Espírito Santo', 'Vila Velha', 'ES', NULL, NULL);
INSERT INTO endereco VALUES (11, '29102920', 'Avenida Comissário José Dantas de Melo', '21', NULL, 'Boa Vista II', 'Vila Velha', 'ES', -20.354347, -40.299187);
INSERT INTO endereco VALUES (12, '29017950', 'Avenida Vitória', '950', NULL, 'Forte São João', 'Vitória', 'ES', -20.317299, -40.322324);
INSERT INTO endereco VALUES (13, '29103825', 'Avenida Ceará', NULL, NULL, 'Jockey de Itaparica', 'Vila Velha', 'ES', -20.385716, -40.313725);
INSERT INTO endereco VALUES (14, '29102040', 'Avenida Santa Leopoldina', '840', NULL, 'Coqueiral de Itaparica', 'Vila Velha', 'ES', -20.358995, -40.298724);
INSERT INTO endereco VALUES (15, '29100920', 'Rua Cabo Aylson Simões', '1170', NULL, 'Divino Espírito Santo', 'Vila Velha', 'ES', -20.342401, -40.295744);
INSERT INTO endereco VALUES (16, '29075910', 'Avenida Fernando Ferrari', '514', NULL, 'Goiabeiras', 'Vitória', 'ES', -20.277157, -40.304509);
INSERT INTO endereco VALUES (17, '29045402', 'Avenida Nossa Senhora da Penha', '2190', NULL, 'Santa Luíza', 'Vitória', 'ES', -20.292634, -40.30147);
INSERT INTO endereco VALUES (18, '29215090', 'Estrada da Tartaruga', NULL, NULL, 'Muquiçaba', 'Guarapari', 'ES', -20.646804, -40.496057);
INSERT INTO endereco VALUES (19, '29106010', 'Avenida Ministro Salgado Filho', NULL, NULL, 'Soteco', 'Vila Velha', 'ES', -20.348549, -40.308627);
INSERT INTO endereco VALUES (20, '29146330', 'Rua Bolívar de Abreu', '48', NULL, 'Campo Grande', 'Cariacica', 'ES', -20.338661, -40.384671);
INSERT INTO endereco VALUES (21, '29200180', 'Rua Ismael de Paula Loureiro', '1308', NULL, 'Centro', 'Guarapari', 'ES', -20.669064, -40.495573);
INSERT INTO endereco VALUES (22, '29215010', 'Rua Saraiva', '84', 'Casa 2', 'Muquiçaba', 'Guarapari', 'ES', -20.658421, -40.496417);
INSERT INTO endereco VALUES (23, '29216010', 'Avenida Copacabana', '606', NULL, 'Praia do Morro', 'Guarapari', 'ES', -20.653304, -40.491154);
INSERT INTO endereco VALUES (24, '29210160', 'Rua João Bigossi', '1888', NULL, 'Itapebussu', 'Guarapari', 'ES', -20.666077, -40.5019);
INSERT INTO endereco VALUES (25, '29221115', 'Rua Braulio Azevedo Torres', '1185', NULL, 'Santa Mônica', 'Guarapari', 'ES', -20.622827, -40.463692);
INSERT INTO endereco VALUES (26, '29202470', 'Rua Capororocas', '856', 'Ap 101', 'Ipiranga', 'Guarapari', 'ES', -20.675794, -40.513359);
INSERT INTO endereco VALUES (27, '29211990', 'Rua Linhares', '655', 'Ap 1204', 'Bela Vista', 'Guarapari', 'ES', -20.643602, -40.513951);
INSERT INTO endereco VALUES (28, '29216805', 'Rua do Acampamento dos Adventistas', '60', NULL, 'Jardim Boa Vista', 'Guarapari', 'ES', -20.644461, -40.477161);
INSERT INTO endereco VALUES (29, '29206000', 'Alameda das Canários', '306', NULL, 'Lameirão', 'Guarapari', 'ES', -20.701461, -40.531338);
INSERT INTO endereco VALUES (30, '29216705', 'Rua Colina Verde', '594', NULL, 'Aeroporto', 'Guarapari', 'ES', -20.646864, -40.492925);
INSERT INTO endereco VALUES (31, '29200730', 'Rua José Barcellos de Matos', '605', 'Casa 2', 'Centro', 'Guarapari', 'ES', -20.671341, -40.503942);
INSERT INTO endereco VALUES (32, '29200180', 'Rua Getúlio Vargas', '1421', 'Ap 1204', 'Centro', 'Guarapari', 'ES', -20.670815, -40.496972);
INSERT INTO endereco VALUES (33, '29200730', 'Rua Pedro Ramos', '316', 'Ap 101', 'Centro', 'Guarapari', 'ES', -20.670226, -40.503912);
INSERT INTO endereco VALUES (34, '29200060', 'Avenida Trajano Lino Gonçalves', '1919', NULL, 'Centro', 'Guarapari', 'ES', -20.668779, -40.494452);
INSERT INTO endereco VALUES (35, '29200415', 'Ladeira Capistrano Nobre', '2001', NULL, 'Centro', 'Guarapari', 'ES', -20.675991, -40.501976);
INSERT INTO endereco VALUES (36, '29215450', 'Rua João Rauta', '1717', 'Fundos', 'Muquiçaba', 'Guarapari', 'ES', -20.656235, -40.496917);
INSERT INTO endereco VALUES (37, '29215100', 'Rodovia Jones dos Santos Neves', '1634', 'Ap 302', 'Muquiçaba', 'Guarapari', 'ES', -20.659318, -40.502227);
INSERT INTO endereco VALUES (38, '29215010', 'Rua Saraiva', '373', 'Fundos', 'Muquiçaba', 'Guarapari', 'ES', -20.658165, -40.496641);
INSERT INTO endereco VALUES (39, '29215010', 'Rua Alino Bandeira', '1800', NULL, 'Muquiçaba', 'Guarapari', 'ES', -20.658879, -40.49624);
INSERT INTO endereco VALUES (40, '29215010', 'Rua Ewerson Abreu Sodré', '1881', 'Ap 1204', 'Muquiçaba', 'Guarapari', 'ES', -20.662566, -40.499041);
INSERT INTO endereco VALUES (41, '29216805', 'Avenida Madri', '94', 'Ap 101', 'Praia do Morro', 'Guarapari', 'ES', -20.647041, -40.478836);
INSERT INTO endereco VALUES (42, '29216080', 'Avenida Beira Mar', '298', 'Ap 1204', 'Praia do Morro', 'Guarapari', 'ES', -20.652972, -40.475753);
INSERT INTO endereco VALUES (43, '29216065', 'Rua João Alberto Kracher', '717', 'Fundos', 'Praia do Morro', 'Guarapari', 'ES', -20.653259, -40.49428);
INSERT INTO endereco VALUES (44, '29216045', 'Rua Antônio Tolentino do Nascimento', '2299', NULL, 'Praia do Morro', 'Guarapari', 'ES', -20.647937, -40.487917);
INSERT INTO endereco VALUES (45, '29216065', 'Rua Juiz de Fora', '122', NULL, 'Praia do Morro', 'Guarapari', 'ES', -20.652169, -40.492777);
INSERT INTO endereco VALUES (46, '29227265', 'Rua Bahia', '638', 'Ap 101', 'Praia do Morro', 'Guarapari', 'ES', -20.641517, -40.482067);
INSERT INTO endereco VALUES (47, '29210160', 'Rua João Bigossi', '1745', NULL, 'Itapebussu', 'Guarapari', 'ES', -20.667244, -40.507829);
INSERT INTO endereco VALUES (48, '29210110', 'Rua Sete', '329', NULL, 'Itapebussu', 'Guarapari', 'ES', -20.660903, -40.511023);
INSERT INTO endereco VALUES (49, '29216805', 'Rua José Carlos', '538', 'Casa 2', 'Jardim Boa Vista', 'Guarapari', 'ES', -20.641352, -40.475462);
INSERT INTO endereco VALUES (50, '29216805', 'Rua José Carlos', '1186', 'Casa 2', 'Jardim Boa Vista', 'Guarapari', 'ES', -20.641424, -40.475284);
INSERT INTO endereco VALUES (51, '29201240', 'Rua Domingos Martins', '637', 'Ap 1204', 'Ipiranga', 'Guarapari', 'ES', -20.678136, -40.508128);
INSERT INTO endereco VALUES (52, '29202020', 'Rua Inhuibas', '758', 'Ap 302', 'Ipiranga', 'Guarapari', 'ES', -20.674552, -40.510836);
INSERT INTO endereco VALUES (53, '29211990', 'Rua Dezesseis', '1715', NULL, 'Bela Vista', 'Guarapari', 'ES', -20.638943, -40.512906);
INSERT INTO endereco VALUES (54, '29211045', 'Travessa Cachoeiro do Itapemirim', '1418', NULL, 'Bela Vista', 'Guarapari', 'ES', -20.642704, -40.515948);
INSERT INTO endereco VALUES (55, '29206000', 'Estrada para o Morro da Telha', '941', 'Fundos', 'Lameirão', 'Guarapari', 'ES', -20.698662, -40.535793);
INSERT INTO endereco VALUES (56, '29206000', 'Estrada para o Morro da Telha', '1810', 'Ap 1204', 'Lameirão', 'Guarapari', 'ES', -20.69547, -40.540252);
INSERT INTO endereco VALUES (57, '29221580', 'Avenida Monte Carlo', '1309', NULL, 'Santa Mônica', 'Guarapari', 'ES', -20.616971, -40.453219);
INSERT INTO endereco VALUES (58, '29221055', 'Rua Espírito Santo', '31', NULL, 'Santa Mônica', 'Guarapari', 'ES', -20.61412, -40.45994);
INSERT INTO endereco VALUES (59, '29216720', 'Rua Aliança', '227', 'Casa 2', 'Aeroporto', 'Guarapari', 'ES', -20.643767, -40.488965);
INSERT INTO endereco VALUES (60, '29216705', 'Avenida Padre José de Anchieta', '1724', 'Ap 1204', 'Aeroporto', 'Guarapari', 'ES', -20.648782, -40.493196);
INSERT INTO endereco VALUES (61, '29222000', 'Rodovia do Sol', '805', NULL, 'Setiba', 'Guarapari', 'ES', -20.630483, -40.437893);
INSERT INTO endereco VALUES (62, '29200250', 'Rua Doutor Silva Mello', '120', NULL, 'Centro', 'Guarapari', 'ES', -20.670512, -40.499034);
INSERT INTO endereco VALUES (63, '29215010', 'Rua Saraiva', '510', NULL, 'Muquiçaba', 'Guarapari', 'ES', -20.657522, -40.498471);
INSERT INTO endereco VALUES (64, '29216065', 'Rua Juiz de Fora', '300', NULL, 'Praia do Morro', 'Guarapari', 'ES', -20.650018, -40.486095);
INSERT INTO endereco VALUES (65, '29210160', 'Rua João Bigossi', '900', NULL, 'Itapebussu', 'Guarapari', 'ES', -20.664081, -40.506112);
INSERT INTO endereco VALUES (66, '29202020', 'Rua Inhuibas', '200', NULL, 'Ipiranga', 'Guarapari', 'ES', -20.67603, -40.510047);
INSERT INTO endereco VALUES (67, '29211990', 'Rua Linhares', '420', NULL, 'Bela Vista', 'Guarapari', 'ES', -20.642096, -40.513012);
INSERT INTO endereco VALUES (68, '29221055', 'Rua Espírito Santo', '150', NULL, 'Santa Mônica', 'Guarapari', 'ES', -20.620087, -40.460021);
INSERT INTO endereco VALUES (69, '29216805', 'Rua José Carlos', '800', NULL, 'Jardim Boa Vista', 'Guarapari', 'ES', -20.643011, -40.477106);
INSERT INTO endereco VALUES (70, '29206000', 'Estrada para o Morro da Telha', '500', NULL, 'Lameirão', 'Guarapari', 'ES', -20.698044, -40.535021);

-- estudante
INSERT INTO estudante VALUES (1, 'Ana Beatriz Souza', 'Bia', '11122233301', '27998880001', 'ana.souza@email.com', 1, 'Medicina', 'noite', 21, 1, '17:40:00', 450.0, 10, 'ativo', 1);
INSERT INTO estudante VALUES (2, 'Bruno Henrique Costa', 'Bruno', '11122233302', '27998880002', 'bruno.costa@email.com', 2, 'Engenharia de Produção', 'noite', 22, 2, '17:45:00', 420.0, 10, 'ativo', NULL);
INSERT INTO estudante VALUES (3, 'Camila Rodrigues', 'Cami', '11122233303', '27998880003', 'camila.r@email.com', 3, 'Engenharia Elétrica', 'noite', 23, 3, '17:50:00', 380.0, 5, 'ativo', NULL);
INSERT INTO estudante VALUES (4, 'Diego Fernandes', NULL, '11122233304', '27998880004', 'diego.f@email.com', 4, 'Direito', 'noite', 24, 4, '17:15:00', 520.0, 15, 'ativo', NULL);
INSERT INTO estudante VALUES (5, 'Eduarda Lima', 'Duda', '11122233305', '27998880005', 'eduarda.lima@email.com', 5, 'Enfermagem', 'noite', 25, 9, '17:55:00', 350.0, 5, 'ativo', NULL);
INSERT INTO estudante VALUES (6, 'Felipe Augusto Ramos', 'Felipão', '11122233306', '27998880006', NULL, 6, 'Engenharia de Computação', 'noite', 26, 6, '17:00:00', 600.0, 20, 'ativo', NULL);
INSERT INTO estudante VALUES (7, 'Gabriela Martins', 'Gabi', '11122233307', '27998880007', 'gabi.martins@email.com', 7, 'Medicina', 'manha', 27, 7, '06:10:00', 480.0, 10, 'ativo', NULL);
INSERT INTO estudante VALUES (8, 'Henrique Oliveira', NULL, '11122233308', '27998880008', 'henrique.o@email.com', 8, 'Administração', 'manha', 28, 5, '06:30:00', 400.0, 10, 'ativo', NULL);
INSERT INTO estudante VALUES (9, 'Isabela Pereira', 'Isa', '11122233309', '27998880009', 'isabela.p@email.com', 9, 'Pedagogia', 'tarde', 29, 8, '12:20:00', 360.0, 25, 'ativo', NULL);
INSERT INTO estudante VALUES (10, 'João Vitor Almeida', 'JV', '11122233310', '27998880010', 'jv.almeida@email.com', 10, 'Engenharia Civil', 'tarde', 30, 10, '12:00:00', 390.0, 28, 'inativo', NULL);
INSERT INTO estudante VALUES (11, 'Larissa Coutinho', 'Lari', '11122233311', '27998880011', 'larissa11@email.com', 1, 'Medicina', 'noite', 31, 1, '17:17:00', 620.0, 5, 'ativo', 1);
INSERT INTO estudante VALUES (12, 'Mateus Rangel', NULL, '11122233312', '27998880012', 'mateus.12@email.com', 1, 'Odontologia', 'noite', 32, 1, '17:21:00', 600.0, 15, 'ativo', 1);
INSERT INTO estudante VALUES (13, 'Juliana Nascimento', 'Ju', '11122233313', '27998880013', 'juliana13@email.com', 3, 'Sistemas de Informação', 'noite', 33, 1, '17:17:00', 550.0, 15, 'ativo', NULL);
INSERT INTO estudante VALUES (14, 'Pedro Henrique Vieira', 'PH', '11122233314', '27998880014', 'pedro14@email.com', 2, 'Ciências Contábeis', 'noite', 34, 1, '17:17:00', 580.0, 15, 'ativo', NULL);
INSERT INTO estudante VALUES (15, 'Beatriz Loureiro', 'Bea', '11122233315', '27998880015', 'beatriz15@email.com', 1, 'Psicologia', 'manha', 35, 1, '05:47:00', 600.0, 15, 'ativo', NULL);
INSERT INTO estudante VALUES (16, 'Rafael Simões', NULL, '11122233316', '27998880016', NULL, 3, 'Sistemas de Informação', 'noite', 36, 2, '17:12:00', 550.0, 5, 'ativo', NULL);
INSERT INTO estudante VALUES (17, 'Letícia Barcellos', 'Lelê', '11122233317', '27998880017', 'leticia17@email.com', 4, 'Biomedicina', 'noite', 37, 2, '17:18:00', 550.0, 20, 'ativo', NULL);
INSERT INTO estudante VALUES (18, 'Gustavo Pimentel', 'Guto', '11122233318', '27998880018', NULL, 1, 'Direito', 'noite', 38, 2, '17:12:00', 550.0, 10, 'ativo', NULL);
INSERT INTO estudante VALUES (19, 'Mariana Rocha', 'Mari', '11122233319', '27998880019', 'mariana.19@email.com', 2, 'Engenharia de Produção', 'noite', 39, 2, '17:14:00', 580.0, 10, 'ativo', NULL);
INSERT INTO estudante VALUES (20, 'Thiago Bravin', NULL, '11122233320', '27998880020', 'thiago20@email.com', 5, 'Direito', 'noite', 40, 2, '17:16:00', 580.0, 10, 'ativo', NULL);
INSERT INTO estudante VALUES (21, 'Amanda Zanotti', 'Mandi', '11122233321', '27998880021', NULL, 3, 'Fisioterapia', 'noite', 41, 3, '17:22:00', 580.0, 15, 'ativo', NULL);
INSERT INTO estudante VALUES (22, 'Lucas Sossai', 'Luquinhas', '11122233322', '27998880022', 'lucas22@email.com', 1, 'Psicologia', 'noite', 42, 3, '17:24:00', 600.0, 10, 'ativo', 2);
INSERT INTO estudante VALUES (23, 'Carolina Gama', 'Carol', '11122233323', '27998880023', 'carolina.23@email.com', 6, 'Ciência da Computação', 'noite', 43, 3, '17:26:00', 580.0, 5, 'ativo', NULL);
INSERT INTO estudante VALUES (24, 'Vinícius Lacerda', 'Vini', '11122233324', '27998880024', NULL, 2, 'Direito', 'manha', 44, 3, '05:52:00', 520.0, 10, 'ativo', NULL);
INSERT INTO estudante VALUES (25, 'Fernanda Bortolini', 'Nanda', '11122233325', '27998880025', 'fernanda25@email.com', 3, 'Enfermagem', 'noite', 45, 3, '17:20:00', 520.0, 15, 'ativo', NULL);
INSERT INTO estudante VALUES (26, 'Rodrigo Merçon', NULL, '11122233326', '27998880026', NULL, 4, 'Nutrição', 'noite', 46, 3, '17:26:00', 620.0, 15, 'ativo', NULL);
INSERT INTO estudante VALUES (27, 'Natália Frisso', 'Nati', '11122233327', '27998880027', 'natalia.27@email.com', 1, 'Odontologia', 'noite', 47, 4, '17:05:00', 580.0, 20, 'ativo', 1);
INSERT INTO estudante VALUES (28, 'Caio Andrade', NULL, '11122233328', '27998880028', 'caio28@email.com', 8, 'Técnico em Mecânica', 'noite', 48, 4, '17:09:00', 550.0, 10, 'ativo', NULL);
INSERT INTO estudante VALUES (29, 'Júlia Ferraço', 'Jujuba', '11122233329', '27998880029', 'julia29@email.com', 5, 'Direito', 'noite', 49, 5, '17:10:00', 600.0, 15, 'ativo', NULL);
INSERT INTO estudante VALUES (30, 'Leonardo Pinheiro', 'Leo', '11122233330', '27998880030', 'leonardo.30@email.com', 3, 'Engenharia Mecânica', 'noite', 50, 5, '17:10:00', 520.0, 10, 'ativo', NULL);
INSERT INTO estudante VALUES (31, 'Sofia Meneguelli', 'Sofi', '11122233331', '27998880031', NULL, 1, 'Odontologia', 'noite', 51, 6, '17:12:00', 600.0, 15, 'ativo', 1);
INSERT INTO estudante VALUES (32, 'Daniel Coelho', 'Dani', '11122233332', '27998880032', 'daniel.32@email.com', 2, 'Engenharia de Produção', 'noite', 52, 6, '17:16:00', 520.0, 20, 'ativo', NULL);
INSERT INTO estudante VALUES (33, 'Isadora Lyrio', 'Isa L.', '11122233333', '27998880033', NULL, 4, 'Nutrição', 'manha', 53, 7, '05:46:00', 520.0, 10, 'ativo', NULL);
INSERT INTO estudante VALUES (34, 'Bernardo Tristão', NULL, '11122233334', '27998880034', 'bernardo34@email.com', 7, 'Medicina', 'noite', 54, 7, '17:20:00', 550.0, 5, 'ativo', NULL);
INSERT INTO estudante VALUES (35, 'Yasmin Guerra', 'Yas', '11122233335', '27998880035', 'yasmin.35@email.com', 1, 'Psicologia', 'noite', 55, 8, '17:02:00', 620.0, 5, 'ativo', NULL);
INSERT INTO estudante VALUES (36, 'Arthur Calmon', NULL, '11122233336', '27998880036', 'arthur36@email.com', 3, 'Fisioterapia', 'noite', 56, 8, '17:00:00', 520.0, 10, 'ativo', NULL);
INSERT INTO estudante VALUES (37, 'Lívia Dalla Bernardina', 'Livinha', '11122233337', '27998880037', 'livia37@email.com', 2, 'Ciências Contábeis', 'noite', 57, 9, '17:31:00', 550.0, 10, 'ativo', NULL);
INSERT INTO estudante VALUES (38, 'Enzo Scárdua', NULL, '11122233338', '27998880038', NULL, 6, 'Oceanografia', 'noite', 58, 9, '17:31:00', 520.0, 15, 'ativo', NULL);
INSERT INTO estudante VALUES (39, 'Manuela Kiefer', 'Manu', '11122233339', '27998880039', 'manuela39@email.com', 1, 'Direito', 'noite', 59, 10, '17:26:00', 580.0, 5, 'ativo', NULL);
INSERT INTO estudante VALUES (40, 'Samuel Gobbi', 'Samu', '11122233340', '27998880040', 'samuel40@email.com', 8, 'Técnico em Administração', 'noite', 60, 10, '17:24:00', 520.0, 20, 'ativo', NULL);
INSERT INTO estudante VALUES (41, 'Paula Rezende', NULL, '11122233341', '27998880041', NULL, 5, 'Publicidade', 'noite', 61, NULL, '17:32:00', 580.0, 5, 'ativo', NULL);

-- instituicao
INSERT INTO instituicao VALUES (1, 'UVV - Universidade Vila Velha', 11, NULL, NULL);
INSERT INTO instituicao VALUES (2, 'UniSales - Centro Universitário Salesiano', 12, NULL, NULL);
INSERT INTO instituicao VALUES (3, 'Multivix Vila Velha', 13, NULL, NULL);
INSERT INTO instituicao VALUES (4, 'Faculdade Novo Milênio', 14, NULL, NULL);
INSERT INTO instituicao VALUES (5, 'Estácio - Campus Vila Velha', 15, NULL, NULL);
INSERT INTO instituicao VALUES (6, 'UFES - Campus Goiabeiras', 16, NULL, NULL);
INSERT INTO instituicao VALUES (7, 'Emescam', 17, NULL, NULL);
INSERT INTO instituicao VALUES (8, 'IFES - Campus Guarapari', 18, NULL, NULL);
INSERT INTO instituicao VALUES (9, 'IFES - Campus Vila Velha', 19, NULL, NULL);
INSERT INTO instituicao VALUES (10, 'Faculdade Pio XII', 20, NULL, NULL);
INSERT INTO instituicao_parada VALUES (1, 1, 'Biopráticas', -20.351902, -40.296912);
INSERT INTO instituicao_parada VALUES (2, 1, 'Fundos da UVV', -20.356611, -40.300705);

-- motorista
INSERT INTO motorista VALUES (1, 1, 1, 'Carlos Eduardo Martins', 'Cadu', '20130140155', '27991110001', '10120130194', '2028-03-15', 3200.00, 5, 'ativo', 62);
INSERT INTO motorista VALUES (2, 2, 2, 'João Pedro Rocha', 'JP', '20230240216', '27991110002', '10220230209', '2027-08-20', 3000.00, 5, 'ativo', 63);
INSERT INTO motorista VALUES (3, 3, 3, 'Marcos Antônio Silva', 'Marcão', '20330340387', '27991110003', '10320330307', '2029-01-10', 3500.00, 10, 'ativo', 64);
INSERT INTO motorista VALUES (4, 4, 4, 'Ricardo Souza Lima', NULL, '20430440448', '27991110004', '10420430413', '2027-11-30', 3100.00, 5, 'ativo', 65);
INSERT INTO motorista VALUES (5, 5, 5, 'Fernanda Costa Alves', 'Fê', '20530540509', '27991110005', '10520530520', '2028-06-05', 3200.00, 5, 'ativo', 66);
INSERT INTO motorista VALUES (6, 6, 6, 'Paulo Henrique Dias', 'Paulinho', '20630640670', '27991110006', '10620630636', '2027-04-18', 2900.00, 15, 'ativo', 67);
INSERT INTO motorista VALUES (7, 7, 7, 'Juliana Ferreira', NULL, '20730740730', '27991110007', '10720730742', '2029-09-22', 3000.00, 5, 'ativo', 68);
INSERT INTO motorista VALUES (8, 8, 8, 'Anderson Luiz Pereira', 'Dinho', '20830840800', '27991110008', '10820830859', '2028-12-01', 3400.00, 10, 'ativo', 69);
INSERT INTO motorista VALUES (9, 9, 9, 'Roberto Carlos Nunes', 'Beto', '20930940962', '27991110009', '10920930965', '2027-07-14', 3000.00, 5, 'ativo', 70);
INSERT INTO motorista VALUES (10, 10, NULL, 'Sérgio Mendes Ramos', NULL, '21031041028', '27991110010', '11021031011', '2026-12-31', 2800.00, 5, 'inativo', NULL);

-- rota (motorista + instituição + turno; os passageiros vêm das áreas do motorista)
INSERT INTO rota VALUES (1, 'Centro e Ipiranga → UVV (noite)', 1, 1, 'noite', '18:00:00', '22:40:00', 'ativo');
INSERT INTO rota VALUES (2, 'Muquiçaba e Bela Vista → UniSales (noite)', 2, 2, 'noite', '18:10:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (3, 'Praia do Morro e Jardim Boa Vista → Multivix (noite)', 3, 3, 'noite', '18:15:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (4, 'Itapebussu e Lameirão → Novo Milênio (noite)', 4, 4, 'noite', '17:30:00', '23:00:00', 'ativo');
INSERT INTO rota VALUES (5, 'Santa Mônica e Aeroporto → Estácio (noite)', 5, 5, 'noite', '18:20:00', '22:20:00', 'ativo');
INSERT INTO rota VALUES (6, 'Centro e Ipiranga → UFES (noite)', 1, 6, 'noite', '17:15:00', '23:10:00', 'ativo');
INSERT INTO rota VALUES (7, 'Muquiçaba e Bela Vista → Emescam (manhã)', 2, 7, 'manha', '06:30:00', '12:10:00', 'ativo');
INSERT INTO rota VALUES (8, 'Praia do Morro e Jardim Boa Vista → IFES Guarapari (manhã)', 3, 8, 'manha', '06:50:00', '12:00:00', 'ativo');
INSERT INTO rota VALUES (9, 'Itapebussu e Lameirão → IFES Vila Velha (tarde)', 4, 9, 'tarde', '12:40:00', '18:00:00', 'ativo');
INSERT INTO rota VALUES (10, 'Santa Mônica e Aeroporto → Pio XII (tarde)', 5, 10, 'tarde', '12:20:00', '17:40:00', 'ativo');
INSERT INTO rota VALUES (11, 'Centro e Ipiranga → UVV (manhã)', 1, 1, 'manha', '06:30:00', '12:10:00', 'ativo');
INSERT INTO rota VALUES (12, 'Centro e Ipiranga → UniSales (noite)', 1, 2, 'noite', '18:00:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (13, 'Centro e Ipiranga → Multivix (noite)', 1, 3, 'noite', '18:00:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (14, 'Muquiçaba e Bela Vista → UVV (noite)', 2, 1, 'noite', '18:00:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (15, 'Muquiçaba e Bela Vista → Multivix (noite)', 2, 3, 'noite', '18:00:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (16, 'Muquiçaba e Bela Vista → Novo Milênio (manhã)', 2, 4, 'manha', '06:30:00', '12:10:00', 'ativo');
INSERT INTO rota VALUES (17, 'Muquiçaba e Bela Vista → Novo Milênio (noite)', 2, 4, 'noite', '18:00:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (18, 'Muquiçaba e Bela Vista → Estácio (noite)', 2, 5, 'noite', '18:00:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (19, 'Muquiçaba e Bela Vista → Emescam (noite)', 2, 7, 'noite', '18:00:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (20, 'Praia do Morro e Jardim Boa Vista → UVV (noite)', 3, 1, 'noite', '18:00:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (21, 'Praia do Morro e Jardim Boa Vista → UniSales (manhã)', 3, 2, 'manha', '06:30:00', '12:10:00', 'ativo');
INSERT INTO rota VALUES (22, 'Praia do Morro e Jardim Boa Vista → Novo Milênio (noite)', 3, 4, 'noite', '18:00:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (23, 'Praia do Morro e Jardim Boa Vista → Estácio (noite)', 3, 5, 'noite', '18:00:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (24, 'Praia do Morro e Jardim Boa Vista → UFES (noite)', 3, 6, 'noite', '18:00:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (25, 'Itapebussu e Lameirão → UVV (noite)', 4, 1, 'noite', '18:00:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (26, 'Itapebussu e Lameirão → Multivix (noite)', 4, 3, 'noite', '18:00:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (27, 'Itapebussu e Lameirão → IFES Guarapari (noite)', 4, 8, 'noite', '18:00:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (28, 'Santa Mônica e Aeroporto → UVV (noite)', 5, 1, 'noite', '18:00:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (29, 'Santa Mônica e Aeroporto → UniSales (noite)', 5, 2, 'noite', '18:00:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (30, 'Santa Mônica e Aeroporto → UFES (noite)', 5, 6, 'noite', '18:00:00', '22:30:00', 'ativo');
INSERT INTO rota VALUES (31, 'Santa Mônica e Aeroporto → IFES Guarapari (noite)', 5, 8, 'noite', '18:00:00', '22:30:00', 'ativo');

-- rota_dia (1 = segunda ... 7 = domingo)
INSERT INTO rota_dia VALUES (1, 1);
INSERT INTO rota_dia VALUES (1, 2);
INSERT INTO rota_dia VALUES (1, 3);
INSERT INTO rota_dia VALUES (1, 4);
INSERT INTO rota_dia VALUES (1, 5);
INSERT INTO rota_dia VALUES (2, 1);
INSERT INTO rota_dia VALUES (2, 2);
INSERT INTO rota_dia VALUES (2, 3);
INSERT INTO rota_dia VALUES (2, 4);
INSERT INTO rota_dia VALUES (2, 5);
INSERT INTO rota_dia VALUES (3, 1);
INSERT INTO rota_dia VALUES (3, 2);
INSERT INTO rota_dia VALUES (3, 3);
INSERT INTO rota_dia VALUES (3, 4);
INSERT INTO rota_dia VALUES (3, 5);
INSERT INTO rota_dia VALUES (4, 1);
INSERT INTO rota_dia VALUES (4, 2);
INSERT INTO rota_dia VALUES (4, 3);
INSERT INTO rota_dia VALUES (4, 4);
INSERT INTO rota_dia VALUES (4, 5);
INSERT INTO rota_dia VALUES (5, 1);
INSERT INTO rota_dia VALUES (5, 2);
INSERT INTO rota_dia VALUES (5, 3);
INSERT INTO rota_dia VALUES (5, 4);
INSERT INTO rota_dia VALUES (5, 5);
INSERT INTO rota_dia VALUES (6, 1);
INSERT INTO rota_dia VALUES (6, 2);
INSERT INTO rota_dia VALUES (6, 3);
INSERT INTO rota_dia VALUES (6, 4);
INSERT INTO rota_dia VALUES (6, 5);
INSERT INTO rota_dia VALUES (7, 1);
INSERT INTO rota_dia VALUES (7, 2);
INSERT INTO rota_dia VALUES (7, 3);
INSERT INTO rota_dia VALUES (7, 4);
INSERT INTO rota_dia VALUES (7, 5);
INSERT INTO rota_dia VALUES (8, 1);
INSERT INTO rota_dia VALUES (8, 2);
INSERT INTO rota_dia VALUES (8, 3);
INSERT INTO rota_dia VALUES (8, 4);
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
INSERT INTO rota_dia VALUES (11, 1);
INSERT INTO rota_dia VALUES (11, 2);
INSERT INTO rota_dia VALUES (11, 3);
INSERT INTO rota_dia VALUES (11, 4);
INSERT INTO rota_dia VALUES (11, 5);
INSERT INTO rota_dia VALUES (12, 1);
INSERT INTO rota_dia VALUES (12, 2);
INSERT INTO rota_dia VALUES (12, 3);
INSERT INTO rota_dia VALUES (12, 4);
INSERT INTO rota_dia VALUES (12, 5);
INSERT INTO rota_dia VALUES (13, 1);
INSERT INTO rota_dia VALUES (13, 2);
INSERT INTO rota_dia VALUES (13, 3);
INSERT INTO rota_dia VALUES (13, 4);
INSERT INTO rota_dia VALUES (13, 5);
INSERT INTO rota_dia VALUES (14, 1);
INSERT INTO rota_dia VALUES (14, 2);
INSERT INTO rota_dia VALUES (14, 3);
INSERT INTO rota_dia VALUES (14, 4);
INSERT INTO rota_dia VALUES (14, 5);
INSERT INTO rota_dia VALUES (15, 1);
INSERT INTO rota_dia VALUES (15, 2);
INSERT INTO rota_dia VALUES (15, 3);
INSERT INTO rota_dia VALUES (15, 4);
INSERT INTO rota_dia VALUES (15, 5);
INSERT INTO rota_dia VALUES (16, 1);
INSERT INTO rota_dia VALUES (16, 2);
INSERT INTO rota_dia VALUES (16, 3);
INSERT INTO rota_dia VALUES (16, 4);
INSERT INTO rota_dia VALUES (16, 5);
INSERT INTO rota_dia VALUES (17, 1);
INSERT INTO rota_dia VALUES (17, 2);
INSERT INTO rota_dia VALUES (17, 3);
INSERT INTO rota_dia VALUES (17, 4);
INSERT INTO rota_dia VALUES (17, 5);
INSERT INTO rota_dia VALUES (18, 1);
INSERT INTO rota_dia VALUES (18, 2);
INSERT INTO rota_dia VALUES (18, 3);
INSERT INTO rota_dia VALUES (18, 4);
INSERT INTO rota_dia VALUES (18, 5);
INSERT INTO rota_dia VALUES (19, 1);
INSERT INTO rota_dia VALUES (19, 2);
INSERT INTO rota_dia VALUES (19, 3);
INSERT INTO rota_dia VALUES (19, 4);
INSERT INTO rota_dia VALUES (19, 5);
INSERT INTO rota_dia VALUES (20, 1);
INSERT INTO rota_dia VALUES (20, 2);
INSERT INTO rota_dia VALUES (20, 3);
INSERT INTO rota_dia VALUES (20, 4);
INSERT INTO rota_dia VALUES (20, 5);
INSERT INTO rota_dia VALUES (21, 1);
INSERT INTO rota_dia VALUES (21, 2);
INSERT INTO rota_dia VALUES (21, 3);
INSERT INTO rota_dia VALUES (21, 4);
INSERT INTO rota_dia VALUES (21, 5);
INSERT INTO rota_dia VALUES (22, 1);
INSERT INTO rota_dia VALUES (22, 2);
INSERT INTO rota_dia VALUES (22, 3);
INSERT INTO rota_dia VALUES (22, 4);
INSERT INTO rota_dia VALUES (22, 5);
INSERT INTO rota_dia VALUES (23, 1);
INSERT INTO rota_dia VALUES (23, 2);
INSERT INTO rota_dia VALUES (23, 3);
INSERT INTO rota_dia VALUES (23, 4);
INSERT INTO rota_dia VALUES (23, 5);
INSERT INTO rota_dia VALUES (24, 1);
INSERT INTO rota_dia VALUES (24, 2);
INSERT INTO rota_dia VALUES (24, 3);
INSERT INTO rota_dia VALUES (24, 4);
INSERT INTO rota_dia VALUES (24, 5);
INSERT INTO rota_dia VALUES (25, 1);
INSERT INTO rota_dia VALUES (25, 2);
INSERT INTO rota_dia VALUES (25, 3);
INSERT INTO rota_dia VALUES (25, 4);
INSERT INTO rota_dia VALUES (25, 5);
INSERT INTO rota_dia VALUES (26, 1);
INSERT INTO rota_dia VALUES (26, 2);
INSERT INTO rota_dia VALUES (26, 3);
INSERT INTO rota_dia VALUES (26, 4);
INSERT INTO rota_dia VALUES (26, 5);
INSERT INTO rota_dia VALUES (27, 1);
INSERT INTO rota_dia VALUES (27, 2);
INSERT INTO rota_dia VALUES (27, 3);
INSERT INTO rota_dia VALUES (27, 4);
INSERT INTO rota_dia VALUES (27, 5);
INSERT INTO rota_dia VALUES (28, 1);
INSERT INTO rota_dia VALUES (28, 2);
INSERT INTO rota_dia VALUES (28, 3);
INSERT INTO rota_dia VALUES (28, 4);
INSERT INTO rota_dia VALUES (28, 5);
INSERT INTO rota_dia VALUES (29, 1);
INSERT INTO rota_dia VALUES (29, 2);
INSERT INTO rota_dia VALUES (29, 3);
INSERT INTO rota_dia VALUES (29, 4);
INSERT INTO rota_dia VALUES (29, 5);
INSERT INTO rota_dia VALUES (30, 1);
INSERT INTO rota_dia VALUES (30, 2);
INSERT INTO rota_dia VALUES (30, 3);
INSERT INTO rota_dia VALUES (30, 4);
INSERT INTO rota_dia VALUES (30, 5);
INSERT INTO rota_dia VALUES (31, 1);
INSERT INTO rota_dia VALUES (31, 2);
INSERT INTO rota_dia VALUES (31, 3);
INSERT INTO rota_dia VALUES (31, 4);
INSERT INTO rota_dia VALUES (31, 5);

-- titulo_pagar
INSERT INTO titulo_pagar VALUES (1, 1, 'salario', 1, NULL, 'Carlos Eduardo Martins', 'Salário Carlos Eduardo Martins - 09/2026', '2026-09-01', 3200.00, '2026-10-05', '2026-10-05', 3200.00, 'pago');
INSERT INTO titulo_pagar VALUES (2, 2, 'salario', 2, NULL, 'João Pedro Rocha', 'Salário João Pedro Rocha - 09/2026', '2026-09-01', 3000.00, '2026-10-05', '2026-10-05', 3000.00, 'pago');
INSERT INTO titulo_pagar VALUES (3, 3, 'salario', 3, NULL, 'Marcos Antônio Silva', 'Salário Marcos Antônio Silva - 09/2026', '2026-09-01', 3500.00, '2026-10-10', '2026-10-10', 3500.00, 'pago');
INSERT INTO titulo_pagar VALUES (4, 1, 'salario', 1, NULL, 'Carlos Eduardo Martins', 'Salário Carlos Eduardo Martins - 10/2026', '2026-10-01', 3200.00, '2026-11-05', NULL, NULL, 'aberto');
INSERT INTO titulo_pagar VALUES (5, 2, 'salario', 2, NULL, 'João Pedro Rocha', 'Salário João Pedro Rocha - 10/2026', '2026-10-01', 3000.00, '2026-11-05', NULL, NULL, 'aberto');
INSERT INTO titulo_pagar VALUES (6, 1, 'combustivel', NULL, 1, 'Posto Rodovia Ltda', 'Diesel S10 - outubro', '2026-10-01', 1850.75, '2026-10-31', NULL, NULL, 'aberto');
INSERT INTO titulo_pagar VALUES (7, 3, 'manutencao', NULL, 3, 'Mecânica Boa Viagem', 'Troca de pastilhas e revisão 50 mil km', '2026-10-01', 1240.00, '2026-10-20', '2026-10-20', 1240.00, 'pago');
INSERT INTO titulo_pagar VALUES (8, 5, 'seguro', NULL, 5, 'Seguradora Capixaba Ltda', 'Seguro anual - parcela 10/12', '2026-10-01', 420.30, '2026-10-15', '2026-10-15', 420.30, 'pago');
INSERT INTO titulo_pagar VALUES (9, 7, 'impostos', NULL, 7, 'Governo do ES', 'IPVA 2026 - parcela 10', '2026-10-01', 310.00, '2026-10-25', NULL, NULL, 'cancelado');
INSERT INTO titulo_pagar VALUES (10, 4, 'outros', NULL, NULL, 'Gráfica Guarapari', 'Adesivos e carteirinhas dos alunos', '2026-10-01', 260.00, '2026-11-10', NULL, NULL, 'aberto');

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
INSERT INTO viagem VALUES (1, 1, 1, 1, '2026-10-29', 'ida', '2026-10-29 17:35:00', '2026-10-29 18:00:00', 'concluida', NULL);
INSERT INTO viagem VALUES (2, 2, 2, 2, '2026-10-29', 'ida', '2026-10-29 17:40:00', '2026-10-29 18:12:00', 'concluida', NULL);
INSERT INTO viagem VALUES (3, 3, 3, 3, '2026-10-29', 'ida', '2026-10-29 17:45:00', '2026-10-29 18:15:00', 'concluida', NULL);
INSERT INTO viagem VALUES (4, 4, 4, 4, '2026-10-29', 'ida', '2026-10-29 17:10:00', '2026-10-29 17:32:00', 'concluida', NULL);
INSERT INTO viagem VALUES (5, 5, 5, 5, '2026-10-29', 'ida', '2026-10-29 17:50:00', '2026-10-29 18:18:00', 'concluida', NULL);
INSERT INTO viagem VALUES (6, 6, 1, 1, '2026-10-29', 'ida', '2026-10-29 16:55:00', '2026-10-29 17:20:00', 'concluida', NULL);
INSERT INTO viagem VALUES (7, 7, 2, 2, '2026-10-29', 'ida', '2026-10-29 06:05:00', '2026-10-29 06:31:00', 'concluida', NULL);
INSERT INTO viagem VALUES (8, 8, 3, 3, '2026-10-29', 'ida', '2026-10-29 06:25:00', NULL, 'cancelada', NULL);
INSERT INTO viagem VALUES (9, 9, 4, 4, '2026-10-30', 'ida', NULL, NULL, 'agendada', NULL);
INSERT INTO viagem VALUES (10, 10, 5, 5, '2026-10-30', 'ida', NULL, NULL, 'agendada', NULL);

-- usuario (login: admin, auxiliar, motorista e joao; senha de teste 123456 para todos: troque em produção)
INSERT INTO usuario VALUES (1, 1, 'Administrador', 'admin', 'scrypt$16384$8$1$univan-admin-01$uiMAQHd0guiOGqg11klLmR2229/aDuPBl4OxQIWrTUk=', 'admin', NULL, 'ativo', NULL, NULL, NULL, 0);
INSERT INTO usuario VALUES (2, 1, 'Paula Auxiliar', 'auxiliar', 'scrypt$16384$8$1$univan-aux-0001$4kQD/M6gnCbc1IdWR8GI82+UjECZLoPqqGUsTVV0kbA=', 'auxiliar', NULL, 'ativo', NULL, NULL, NULL, 0);
INSERT INTO usuario VALUES (3, 1, 'Carlos Eduardo Martins', 'motorista', 'scrypt$16384$8$1$univan-mot-0001$INlxScT8hk88nHp/Rccss+gh2J9ZeTcl7Fat+e2kexc=', 'motorista', 1, 'ativo', NULL, NULL, NULL, 0);
INSERT INTO usuario VALUES (4, 2, 'João Pedro Rocha', 'joao', 'scrypt$16384$8$1$univan-mot-0002$Z3VpWZjsYMKvNn5TGKU0Iubps+ycdp8ZeMjTeO8+2XM=', 'motorista', 2, 'ativo', NULL, NULL, NULL, 0);

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
