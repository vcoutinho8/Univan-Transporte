CREATE TYPE public.categoria_titulo_pagar AS ENUM (
    'salario',
    'combustivel',
    'manutencao',
    'seguro',
    'impostos',
    'outros'
);


--
-- TOC entry 885 (class 1247 OID 17144)
-- Name: sentido; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sentido AS ENUM (
    'ida',
    'volta'
);


--
-- TOC entry 879 (class 1247 OID 17131)
-- Name: status_cadastro; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status_cadastro AS ENUM (
    'ativo',
    'inativo'
);


--
-- TOC entry 891 (class 1247 OID 17160)
-- Name: status_chamada; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status_chamada AS ENUM (
    'pendente',
    'nao_vai',
    'presente',
    'ausente'
);


--
-- TOC entry 894 (class 1247 OID 17170)
-- Name: status_titulo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status_titulo AS ENUM (
    'aberto',
    'pago',
    'cancelado'
);


--
-- TOC entry 888 (class 1247 OID 17150)
-- Name: status_viagem; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status_viagem AS ENUM (
    'agendada',
    'em_andamento',
    'concluida',
    'cancelada'
);


--
-- TOC entry 882 (class 1247 OID 17136)
-- Name: turno; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.turno AS ENUM (
    'manha',
    'tarde',
    'noite'
);


--
-- TOC entry 248 (class 1255 OID 17451)
-- Name: avisar_nao_vou(integer, date, public.sentido, timestamp without time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.avisar_nao_vou(p_estudante integer, p_data date, p_sentido public.sentido, p_momento timestamp without time zone DEFAULT LOCALTIMESTAMP) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE c record;
BEGIN
  SELECT ch.* INTO c
  FROM chamada ch JOIN viagem v ON v.id = ch.fk_viagem
  WHERE ch.fk_estudante = p_estudante AND v.data = p_data AND v.sentido = p_sentido;

  IF NOT FOUND THEN RETURN 'Sem viagem para este aluno nesse dia'; END IF;
  IF c.status <> 'pendente' THEN RETURN 'Chamada já está como ' || c.status; END IF;
  IF p_momento > (p_data + c.horario_previsto) - interval '1 hour' THEN
    RETURN 'Fora do prazo: avisar até 1h antes de ' || to_char(c.horario_previsto, 'HH24:MI');
  END IF;

  UPDATE chamada SET status = 'nao_vai', horario_aviso = p_momento
  WHERE fk_viagem = c.fk_viagem AND fk_estudante = p_estudante;
  RETURN 'OK';
END $$;


--
-- TOC entry 249 (class 1255 OID 17452)
-- Name: concluir_viagem(integer, timestamp without time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.concluir_viagem(p_viagem integer, p_momento timestamp without time zone DEFAULT LOCALTIMESTAMP) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE viagem SET status = 'concluida', horario_chegada = p_momento WHERE id = p_viagem;
  UPDATE chamada SET status = 'ausente' WHERE fk_viagem = p_viagem AND status = 'pendente';
END $$;


--
-- TOC entry 246 (class 1255 OID 17448)
-- Name: definir_area_estudante(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.definir_area_estudante() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  SELECT a.id INTO NEW.fk_area
  FROM area a
  JOIN endereco en ON en.id = NEW.fk_endereco
  WHERE a.status = 'ativo'
    AND point(en.longitude, en.latitude) <@ a.coordenadas
  ORDER BY a.id
  LIMIT 1;
  RETURN NEW;
END $$;


--
-- TOC entry 247 (class 1255 OID 17450)
-- Name: gerar_dia(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gerar_dia(p_data date DEFAULT CURRENT_DATE) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE qtd int;
BEGIN
  INSERT INTO viagem (fk_rota, fk_veiculo, fk_motorista, data, sentido)
  SELECT r.id, m.fk_veiculo, m.id, p_data, s.sentido
  FROM rota r
  JOIN motorista m ON m.id = r.fk_motorista
  CROSS JOIN (VALUES ('ida'::sentido), ('volta'::sentido)) s(sentido)
  WHERE r.status = 'ativo'
    AND m.fk_veiculo IS NOT NULL
    -- roda nesse dia da semana?
    AND EXISTS (SELECT 1 FROM rota_dia rd
                WHERE rd.fk_rota = r.id
                  AND rd.dia_semana = extract(isodow FROM p_data))
    -- não é feriado / recesso?
    AND NOT EXISTS (SELECT 1 FROM dia_sem_aula d
                    WHERE d.data = p_data
                      AND (d.fk_instituicao IS NULL OR d.fk_instituicao = r.fk_instituicao))
  ON CONFLICT (fk_rota, data, sentido) DO NOTHING;

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
  WHERE v.data = p_data
  ON CONFLICT (fk_viagem, fk_estudante) DO NOTHING;

  GET DIAGNOSTICS qtd = ROW_COUNT;
  RETURN qtd;   -- chamadas criadas
END $$;


--
-- TOC entry 250 (class 1255 OID 17453)
-- Name: gerar_titulos_mes(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gerar_titulos_mes(p_competencia date) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE comp date := date_trunc('month', p_competencia)::date;
BEGIN
  -- mensalidade vence no próprio mês
  INSERT INTO titulo_receber (fk_estudante, competencia, valor, data_vencimento)
  SELECT e.id, comp, e.valor_mensal, comp + (e.dia_vencimento - 1)
  FROM estudante e
  WHERE e.status = 'ativo'
  ON CONFLICT (fk_estudante, competencia) DO NOTHING;

  -- salário do mês vence no mês seguinte, no dia_pagamento do motorista
  INSERT INTO titulo_pagar (fk_empresa, categoria, fk_motorista, descricao,
                            competencia, valor, data_vencimento)
  SELECT m.fk_empresa, 'salario', m.id,
         'Salário ' || m.nome || ' - ' || to_char(comp, 'MM/YYYY'),
         comp, m.salario,
         (comp + interval '1 month')::date + (m.dia_pagamento - 1)
  FROM motorista m
  WHERE m.status = 'ativo' AND m.salario IS NOT NULL
  ON CONFLICT DO NOTHING;
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 226 (class 1259 OID 17258)
-- Name: area; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.area (
    id integer NOT NULL,
    nome character varying(100) NOT NULL,
    coordenadas polygon NOT NULL,
    fk_motorista integer,
    status public.status_cadastro DEFAULT 'ativo'::public.status_cadastro NOT NULL
);


--
-- TOC entry 225 (class 1259 OID 17257)
-- Name: area_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.area_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5136 (class 0 OID 0)
-- Dependencies: 225
-- Name: area_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.area_id_seq OWNED BY public.area.id;


--
-- TOC entry 238 (class 1259 OID 17382)
-- Name: chamada; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chamada (
    fk_viagem integer NOT NULL,
    fk_estudante integer NOT NULL,
    status public.status_chamada DEFAULT 'pendente'::public.status_chamada NOT NULL,
    horario_previsto time without time zone,
    horario_aviso timestamp without time zone,
    horario_embarque timestamp without time zone
);


--
-- TOC entry 235 (class 1259 OID 17344)
-- Name: dia_sem_aula; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dia_sem_aula (
    id integer NOT NULL,
    data date NOT NULL,
    fk_instituicao integer,
    motivo character varying(100) NOT NULL
);


--
-- TOC entry 234 (class 1259 OID 17343)
-- Name: dia_sem_aula_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dia_sem_aula_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5137 (class 0 OID 0)
-- Dependencies: 234
-- Name: dia_sem_aula_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dia_sem_aula_id_seq OWNED BY public.dia_sem_aula.id;


--
-- TOC entry 220 (class 1259 OID 17200)
-- Name: empresa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresa (
    id integer NOT NULL,
    razao_social character varying(100) NOT NULL,
    nome_fantasia character varying(100),
    cnpj character varying(14) NOT NULL,
    telefone character varying(15),
    fk_endereco integer,
    CONSTRAINT empresa_cnpj_check CHECK (((cnpj)::text ~ '^[0-9]{14}$'::text))
);


--
-- TOC entry 219 (class 1259 OID 17199)
-- Name: empresa_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.empresa_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5138 (class 0 OID 0)
-- Dependencies: 219
-- Name: empresa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.empresa_id_seq OWNED BY public.empresa.id;


--
-- TOC entry 218 (class 1259 OID 17192)
-- Name: endereco; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.endereco (
    id integer NOT NULL,
    cep character varying(8) NOT NULL,
    logradouro character varying(100) NOT NULL,
    numero character varying(10),
    complemento character varying(60),
    bairro character varying(50) NOT NULL,
    cidade character varying(50) NOT NULL,
    estado character(2) NOT NULL,
    latitude numeric(9,6),
    longitude numeric(9,6),
    CONSTRAINT endereco_cep_check CHECK (((cep)::text ~ '^[0-9]{8}$'::text))
);


--
-- TOC entry 217 (class 1259 OID 17191)
-- Name: endereco_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.endereco_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5139 (class 0 OID 0)
-- Dependencies: 217
-- Name: endereco_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.endereco_id_seq OWNED BY public.endereco.id;


--
-- TOC entry 230 (class 1259 OID 17285)
-- Name: estudante; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estudante (
    id integer NOT NULL,
    nome character varying(100) NOT NULL,
    apelido character varying(30),
    cpf character varying(11) NOT NULL,
    celular character varying(15) NOT NULL,
    email character varying(100),
    fk_instituicao integer NOT NULL,
    curso character varying(50),
    turno public.turno NOT NULL,
    fk_endereco integer NOT NULL,
    fk_area integer,
    horario_embarque time without time zone,
    valor_mensal numeric(10,2) NOT NULL,
    dia_vencimento integer NOT NULL,
    status public.status_cadastro DEFAULT 'ativo'::public.status_cadastro NOT NULL,
    CONSTRAINT estudante_cpf_check CHECK (((cpf)::text ~ '^[0-9]{11}$'::text)),
    CONSTRAINT estudante_dia_vencimento_check CHECK (((dia_vencimento >= 1) AND (dia_vencimento <= 28))),
    CONSTRAINT estudante_valor_mensal_check CHECK ((valor_mensal >= (0)::numeric))
);


--
-- TOC entry 229 (class 1259 OID 17284)
-- Name: estudante_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.estudante_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5140 (class 0 OID 0)
-- Dependencies: 229
-- Name: estudante_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.estudante_id_seq OWNED BY public.estudante.id;


--
-- TOC entry 228 (class 1259 OID 17273)
-- Name: instituicao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instituicao (
    id integer NOT NULL,
    nome character varying(100) NOT NULL,
    fk_endereco integer NOT NULL
);


--
-- TOC entry 227 (class 1259 OID 17272)
-- Name: instituicao_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.instituicao_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5141 (class 0 OID 0)
-- Dependencies: 227
-- Name: instituicao_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.instituicao_id_seq OWNED BY public.instituicao.id;


--
-- TOC entry 224 (class 1259 OID 17232)
-- Name: motorista; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.motorista (
    id integer NOT NULL,
    fk_empresa integer NOT NULL,
    fk_veiculo integer,
    nome character varying(100) NOT NULL,
    cpf character varying(11) NOT NULL,
    celular character varying(15),
    cnh character varying(11) NOT NULL,
    cnh_validade date NOT NULL,
    salario numeric(10,2),
    dia_pagamento integer DEFAULT 5,
    status public.status_cadastro DEFAULT 'ativo'::public.status_cadastro NOT NULL,
    CONSTRAINT motorista_cpf_check CHECK (((cpf)::text ~ '^[0-9]{11}$'::text)),
    CONSTRAINT motorista_dia_pagamento_check CHECK (((dia_pagamento >= 1) AND (dia_pagamento <= 28))),
    CONSTRAINT motorista_salario_check CHECK ((salario >= (0)::numeric))
);


--
-- TOC entry 223 (class 1259 OID 17231)
-- Name: motorista_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.motorista_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5142 (class 0 OID 0)
-- Dependencies: 223
-- Name: motorista_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.motorista_id_seq OWNED BY public.motorista.id;


--
-- TOC entry 232 (class 1259 OID 17313)
-- Name: rota; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rota (
    id integer NOT NULL,
    nome character varying(100) NOT NULL,
    fk_motorista integer NOT NULL,
    fk_instituicao integer NOT NULL,
    turno public.turno NOT NULL,
    horario_ida time without time zone,
    horario_volta time without time zone,
    status public.status_cadastro DEFAULT 'ativo'::public.status_cadastro NOT NULL
);


--
-- TOC entry 233 (class 1259 OID 17332)
-- Name: rota_dia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rota_dia (
    fk_rota integer NOT NULL,
    dia_semana smallint NOT NULL,
    CONSTRAINT rota_dia_dia_semana_check CHECK (((dia_semana >= 1) AND (dia_semana <= 7)))
);


--
-- TOC entry 231 (class 1259 OID 17312)
-- Name: rota_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rota_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5143 (class 0 OID 0)
-- Dependencies: 231
-- Name: rota_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rota_id_seq OWNED BY public.rota.id;


--
-- TOC entry 242 (class 1259 OID 17416)
-- Name: titulo_pagar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.titulo_pagar (
    id integer NOT NULL,
    fk_empresa integer NOT NULL,
    categoria public.categoria_titulo_pagar NOT NULL,
    fk_motorista integer,
    fk_veiculo integer,
    favorecido character varying(100),
    descricao character varying(150) NOT NULL,
    competencia date,
    valor numeric(10,2) NOT NULL,
    data_vencimento date NOT NULL,
    data_pagamento date,
    valor_pago numeric(10,2),
    status public.status_titulo DEFAULT 'aberto'::public.status_titulo NOT NULL,
    CONSTRAINT titulo_pagar_check CHECK (((categoria <> 'salario'::public.categoria_titulo_pagar) OR (fk_motorista IS NOT NULL))),
    CONSTRAINT titulo_pagar_competencia_check CHECK ((EXTRACT(day FROM competencia) = (1)::numeric)),
    CONSTRAINT titulo_pagar_valor_check CHECK ((valor >= (0)::numeric))
);


--
-- TOC entry 241 (class 1259 OID 17415)
-- Name: titulo_pagar_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.titulo_pagar_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5144 (class 0 OID 0)
-- Dependencies: 241
-- Name: titulo_pagar_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.titulo_pagar_id_seq OWNED BY public.titulo_pagar.id;


--
-- TOC entry 240 (class 1259 OID 17399)
-- Name: titulo_receber; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.titulo_receber (
    id integer NOT NULL,
    fk_estudante integer NOT NULL,
    competencia date NOT NULL,
    valor numeric(10,2) NOT NULL,
    data_vencimento date NOT NULL,
    data_recebimento date,
    valor_recebido numeric(10,2),
    status public.status_titulo DEFAULT 'aberto'::public.status_titulo NOT NULL,
    CONSTRAINT titulo_receber_competencia_check CHECK ((EXTRACT(day FROM competencia) = (1)::numeric)),
    CONSTRAINT titulo_receber_valor_check CHECK ((valor >= (0)::numeric))
);


--
-- TOC entry 239 (class 1259 OID 17398)
-- Name: titulo_receber_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.titulo_receber_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5145 (class 0 OID 0)
-- Dependencies: 239
-- Name: titulo_receber_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.titulo_receber_id_seq OWNED BY public.titulo_receber.id;


--
-- TOC entry 222 (class 1259 OID 17215)
-- Name: veiculo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veiculo (
    id integer NOT NULL,
    fk_empresa integer NOT NULL,
    placa character varying(7) NOT NULL,
    modelo character varying(50) NOT NULL,
    cor character varying(30),
    capacidade integer NOT NULL,
    status public.status_cadastro DEFAULT 'ativo'::public.status_cadastro NOT NULL,
    CONSTRAINT veiculo_capacidade_check CHECK ((capacidade > 0)),
    CONSTRAINT veiculo_placa_check CHECK (((placa)::text ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'::text))
);


--
-- TOC entry 221 (class 1259 OID 17214)
-- Name: veiculo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.veiculo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5146 (class 0 OID 0)
-- Dependencies: 221
-- Name: veiculo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.veiculo_id_seq OWNED BY public.veiculo.id;


--
-- TOC entry 237 (class 1259 OID 17358)
-- Name: viagem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.viagem (
    id integer NOT NULL,
    fk_rota integer NOT NULL,
    fk_veiculo integer NOT NULL,
    fk_motorista integer NOT NULL,
    data date NOT NULL,
    sentido public.sentido NOT NULL,
    horario_saida timestamp without time zone,
    horario_chegada timestamp without time zone,
    status public.status_viagem DEFAULT 'agendada'::public.status_viagem NOT NULL
);


--
-- TOC entry 236 (class 1259 OID 17357)
-- Name: viagem_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.viagem_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5147 (class 0 OID 0)
-- Dependencies: 236
-- Name: viagem_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.viagem_id_seq OWNED BY public.viagem.id;


--
-- TOC entry 243 (class 1259 OID 17454)
-- Name: vw_frequencia; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_frequencia AS
 SELECT e.id,
    e.nome,
    count(*) FILTER (WHERE (c.status = 'presente'::public.status_chamada)) AS presencas,
    count(*) FILTER (WHERE (c.status = 'nao_vai'::public.status_chamada)) AS avisou_que_nao_ia,
    count(*) FILTER (WHERE (c.status = 'ausente'::public.status_chamada)) AS faltas_sem_aviso,
    round(((100.0 * (count(*) FILTER (WHERE (c.status = 'presente'::public.status_chamada)))::numeric) / (NULLIF(count(*) FILTER (WHERE (c.status <> 'pendente'::public.status_chamada)), 0))::numeric), 1) AS perc_presenca
   FROM (public.estudante e
     JOIN public.chamada c ON ((c.fk_estudante = e.id)))
  GROUP BY e.id, e.nome;


--
-- TOC entry 244 (class 1259 OID 17459)
-- Name: vw_inadimplentes; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_inadimplentes AS
 SELECT e.nome,
    e.celular,
    t.competencia,
    t.valor,
    t.data_vencimento,
    (CURRENT_DATE - t.data_vencimento) AS dias_atraso
   FROM (public.titulo_receber t
     JOIN public.estudante e ON ((e.id = t.fk_estudante)))
  WHERE ((t.status = 'aberto'::public.status_titulo) AND (t.data_vencimento < CURRENT_DATE));


--
-- TOC entry 245 (class 1259 OID 17464)
-- Name: vw_resultado_mes; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_resultado_mes AS
 SELECT competencia,
    sum(entradas) AS receitas,
    sum(saidas) AS despesas,
    (sum(entradas) - sum(saidas)) AS resultado
   FROM ( SELECT titulo_receber.competencia,
            titulo_receber.valor AS entradas,
            0 AS saidas
           FROM public.titulo_receber
          WHERE (titulo_receber.status <> 'cancelado'::public.status_titulo)
        UNION ALL
         SELECT titulo_pagar.competencia,
            0,
            titulo_pagar.valor
           FROM public.titulo_pagar
          WHERE (titulo_pagar.status <> 'cancelado'::public.status_titulo)) x
  GROUP BY competencia;


--
-- TOC entry 4850 (class 2604 OID 17261)
-- Name: area id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.area ALTER COLUMN id SET DEFAULT nextval('public.area_id_seq'::regclass);


--
-- TOC entry 4857 (class 2604 OID 17347)
-- Name: dia_sem_aula id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dia_sem_aula ALTER COLUMN id SET DEFAULT nextval('public.dia_sem_aula_id_seq'::regclass);


--
-- TOC entry 4844 (class 2604 OID 17203)
-- Name: empresa id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa ALTER COLUMN id SET DEFAULT nextval('public.empresa_id_seq'::regclass);


--
-- TOC entry 4843 (class 2604 OID 17195)
-- Name: endereco id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.endereco ALTER COLUMN id SET DEFAULT nextval('public.endereco_id_seq'::regclass);


--
-- TOC entry 4853 (class 2604 OID 17288)
-- Name: estudante id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estudante ALTER COLUMN id SET DEFAULT nextval('public.estudante_id_seq'::regclass);


--
-- TOC entry 4852 (class 2604 OID 17276)
-- Name: instituicao id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instituicao ALTER COLUMN id SET DEFAULT nextval('public.instituicao_id_seq'::regclass);


--
-- TOC entry 4847 (class 2604 OID 17235)
-- Name: motorista id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motorista ALTER COLUMN id SET DEFAULT nextval('public.motorista_id_seq'::regclass);


--
-- TOC entry 4855 (class 2604 OID 17316)
-- Name: rota id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rota ALTER COLUMN id SET DEFAULT nextval('public.rota_id_seq'::regclass);


--
-- TOC entry 4863 (class 2604 OID 17419)
-- Name: titulo_pagar id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.titulo_pagar ALTER COLUMN id SET DEFAULT nextval('public.titulo_pagar_id_seq'::regclass);


--
-- TOC entry 4861 (class 2604 OID 17402)
-- Name: titulo_receber id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.titulo_receber ALTER COLUMN id SET DEFAULT nextval('public.titulo_receber_id_seq'::regclass);


--
-- TOC entry 4845 (class 2604 OID 17218)
-- Name: veiculo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculo ALTER COLUMN id SET DEFAULT nextval('public.veiculo_id_seq'::regclass);


--
-- TOC entry 4858 (class 2604 OID 17361)
-- Name: viagem id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viagem ALTER COLUMN id SET DEFAULT nextval('public.viagem_id_seq'::regclass);


--
-- TOC entry 5114 (class 0 OID 17258)
-- Dependencies: 226
-- Data for Name: area; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.area VALUES (1, 'Centro', '((-49.374,-28.684),(-49.366,-28.684),(-49.366,-28.676),(-49.374,-28.676))', 1, 'ativo');
INSERT INTO public.area VALUES (2, 'Michel', '((-49.374,-28.694),(-49.366,-28.694),(-49.366,-28.686),(-49.374,-28.686))', 2, 'ativo');
INSERT INTO public.area VALUES (3, 'Santa Bárbara', '((-49.374,-28.704),(-49.366,-28.704),(-49.366,-28.696),(-49.374,-28.696))', 3, 'ativo');
INSERT INTO public.area VALUES (4, 'Pinheirinho', '((-49.374,-28.714),(-49.366,-28.714),(-49.366,-28.706),(-49.374,-28.706))', 4, 'ativo');
INSERT INTO public.area VALUES (5, 'Próspera', '((-49.374,-28.724),(-49.366,-28.724),(-49.366,-28.716),(-49.374,-28.716))', 5, 'ativo');
INSERT INTO public.area VALUES (6, 'Rio Maina', '((-49.374,-28.734),(-49.366,-28.734),(-49.366,-28.726),(-49.374,-28.726))', 6, 'ativo');
INSERT INTO public.area VALUES (7, 'Pinheirinho Sul', '((-49.374,-28.744),(-49.366,-28.744),(-49.366,-28.736),(-49.374,-28.736))', 7, 'ativo');
INSERT INTO public.area VALUES (8, 'Operária Nova', '((-49.374,-28.754),(-49.366,-28.754),(-49.366,-28.746),(-49.374,-28.746))', 8, 'ativo');
INSERT INTO public.area VALUES (9, 'Pio Corrêa', '((-49.374,-28.764),(-49.366,-28.764),(-49.366,-28.756),(-49.374,-28.756))', 9, 'ativo');
INSERT INTO public.area VALUES (10, 'São Luiz', '((-49.374,-28.774),(-49.366,-28.774),(-49.366,-28.766),(-49.374,-28.766))', 9, 'ativo');


--
-- TOC entry 5126 (class 0 OID 17382)
-- Dependencies: 238
-- Data for Name: chamada; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.chamada VALUES (1, 1, 'presente', '17:40:00', NULL, '2026-10-29 17:41:00');
INSERT INTO public.chamada VALUES (2, 2, 'presente', '17:45:00', NULL, '2026-10-29 17:46:00');
INSERT INTO public.chamada VALUES (3, 3, 'nao_vai', '17:50:00', '2026-10-29 14:20:00', NULL);
INSERT INTO public.chamada VALUES (4, 4, 'presente', '17:15:00', NULL, '2026-10-29 17:16:00');
INSERT INTO public.chamada VALUES (5, 5, 'ausente', '17:55:00', NULL, NULL);
INSERT INTO public.chamada VALUES (6, 6, 'presente', '17:00:00', NULL, '2026-10-29 17:02:00');
INSERT INTO public.chamada VALUES (7, 7, 'presente', '06:10:00', NULL, '2026-10-29 06:11:00');
INSERT INTO public.chamada VALUES (8, 8, 'nao_vai', '06:30:00', '2026-10-28 21:00:00', NULL);
INSERT INTO public.chamada VALUES (9, 9, 'pendente', '12:20:00', NULL, NULL);
INSERT INTO public.chamada VALUES (10, 10, 'pendente', '12:00:00', NULL, NULL);


--
-- TOC entry 5123 (class 0 OID 17344)
-- Dependencies: 235
-- Data for Name: dia_sem_aula; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.dia_sem_aula VALUES (1, '2026-11-02', NULL, 'Finados');
INSERT INTO public.dia_sem_aula VALUES (2, '2026-11-15', NULL, 'Proclamação da República');
INSERT INTO public.dia_sem_aula VALUES (3, '2026-11-20', NULL, 'Dia da Consciência Negra');
INSERT INTO public.dia_sem_aula VALUES (4, '2026-12-25', NULL, 'Natal');
INSERT INTO public.dia_sem_aula VALUES (5, '2027-01-01', NULL, 'Confraternização Universal');
INSERT INTO public.dia_sem_aula VALUES (6, '2026-11-06', 1, 'Semana acadêmica UNESC');
INSERT INTO public.dia_sem_aula VALUES (7, '2026-11-13', 2, 'Conselho de classe SATC');
INSERT INTO public.dia_sem_aula VALUES (8, '2026-11-27', 4, 'Formatura UNISUL');
INSERT INTO public.dia_sem_aula VALUES (9, '2026-12-04', 6, 'Recesso UFSC');
INSERT INTO public.dia_sem_aula VALUES (10, '2026-11-19', 9, 'Aniversário de Içara');


--
-- TOC entry 5108 (class 0 OID 17200)
-- Dependencies: 220
-- Data for Name: empresa; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.empresa VALUES (1, 'Vale Sul Transportes Ltda', 'Vale Sul', '11222333000101', '4834331001', 1);
INSERT INTO public.empresa VALUES (2, 'Rota Certa Fretamentos Ltda', 'Rota Certa', '22333444000102', '4834331002', 2);
INSERT INTO public.empresa VALUES (3, 'Expresso Carvoeiro Transportes Ltda', 'Expresso Carvoeiro', '33444555000103', '4834331003', 3);
INSERT INTO public.empresa VALUES (4, 'Universitário Sul Turismo Ltda', 'UniSul Turismo', '44555666000104', '4834331004', 4);
INSERT INTO public.empresa VALUES (5, 'Trilha Fretamento e Turismo Ltda', 'Trilha', '55666777000105', '4834331005', 5);
INSERT INTO public.empresa VALUES (6, 'Caminho do Saber Transportes ME', 'Caminho do Saber', '66777888000106', '4834331006', 6);
INSERT INTO public.empresa VALUES (7, 'Içara Vans Ltda', 'Içara Vans', '77888999000107', '4834331007', 7);
INSERT INTO public.empresa VALUES (8, 'Urussanga Transportes ME', 'Uru Trans', '88999000000108', '4834331008', 8);
INSERT INTO public.empresa VALUES (9, 'Cocal Fretamentos Ltda', 'Cocal Fret', '99000111000109', '4834331009', 9);
INSERT INTO public.empresa VALUES (10, 'Orleans Turismo e Fretamento Ltda', 'Orleans Tur', '10111222000110', '4834331010', 10);


--
-- TOC entry 5106 (class 0 OID 17192)
-- Dependencies: 218
-- Data for Name: endereco; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.endereco VALUES (1, '88801000', 'Rua Henrique Lage', '120', 'Sala 3', 'Centro', 'Criciúma', 'SC', NULL, NULL);
INSERT INTO public.endereco VALUES (2, '88802100', 'Av. Centenário', '2500', NULL, 'Santa Bárbara', 'Criciúma', 'SC', NULL, NULL);
INSERT INTO public.endereco VALUES (3, '88803200', 'Rua Joaquim Nabuco', '45', NULL, 'Comerciário', 'Criciúma', 'SC', NULL, NULL);
INSERT INTO public.endereco VALUES (4, '88804300', 'Rua Imigrante Meller', '980', 'Galpão', 'Pinheirinho', 'Criciúma', 'SC', NULL, NULL);
INSERT INTO public.endereco VALUES (5, '88805400', 'Rua Pedro Benedet', '310', NULL, 'Michel', 'Criciúma', 'SC', NULL, NULL);
INSERT INTO public.endereco VALUES (6, '88806500', 'Rua Coronel Pedro Benedet', '77', NULL, 'Próspera', 'Criciúma', 'SC', NULL, NULL);
INSERT INTO public.endereco VALUES (7, '88820000', 'Rua XV de Novembro', '15', NULL, 'Centro', 'Içara', 'SC', NULL, NULL);
INSERT INTO public.endereco VALUES (8, '88840000', 'Rua Padre João Leonir', '200', NULL, 'Centro', 'Urussanga', 'SC', NULL, NULL);
INSERT INTO public.endereco VALUES (9, '88845000', 'Av. Getúlio Vargas', '1500', 'Bloco B', 'Centro', 'Cocal do Sul', 'SC', NULL, NULL);
INSERT INTO public.endereco VALUES (10, '88870000', 'Rua Marechal Deodoro', '640', NULL, 'Centro', 'Orleans', 'SC', NULL, NULL);
INSERT INTO public.endereco VALUES (11, '88806000', 'Av. Universitária', '1105', NULL, 'Universitário', 'Criciúma', 'SC', -28.703100, -49.405200);
INSERT INTO public.endereco VALUES (12, '88805380', 'Rua Pascoal Meller', '73', NULL, 'Universitário', 'Criciúma', 'SC', -28.700500, -49.409800);
INSERT INTO public.endereco VALUES (13, '88813600', 'Rua Gabriel Arcanjo', '1550', NULL, 'Vila São José', 'Criciúma', 'SC', -28.678900, -49.395100);
INSERT INTO public.endereco VALUES (14, '88704900', 'Av. José Acácio Moreira', '787', NULL, 'Dehon', 'Tubarão', 'SC', -28.479300, -49.017600);
INSERT INTO public.endereco VALUES (15, '88811500', 'Rua General Lauro Sodré', '300', NULL, 'Comerciário', 'Criciúma', 'SC', -28.680700, -49.369900);
INSERT INTO public.endereco VALUES (16, '88905120', 'Rua Governador Jorge Lacerda', '3201', NULL, 'Jardim das Avenidas', 'Araranguá', 'SC', -28.952600, -49.468300);
INSERT INTO public.endereco VALUES (17, '88870000', 'Rua Pe. João Leonir Dall Alba', '1000', NULL, 'Murialdo', 'Orleans', 'SC', -28.360400, -49.288200);
INSERT INTO public.endereco VALUES (18, '88802250', 'Rua Cel. Marcos Rovaris', '205', NULL, 'Centro', 'Criciúma', 'SC', -28.677000, -49.372100);
INSERT INTO public.endereco VALUES (19, '88820000', 'Rua Dionízio Mondardo', '500', NULL, 'Centro', 'Içara', 'SC', -28.712900, -49.304600);
INSERT INTO public.endereco VALUES (20, '88840000', 'Rua Dr. Nelson Barbosa', '90', NULL, 'Centro', 'Urussanga', 'SC', -28.518500, -49.320600);
INSERT INTO public.endereco VALUES (21, '88801010', 'Rua das Acácias', '12', NULL, 'Centro', 'Criciúma', 'SC', -28.680000, -49.370000);
INSERT INTO public.endereco VALUES (22, '88802020', 'Rua dos Ipês', '345', 'Ap 201', 'Michel', 'Criciúma', 'SC', -28.690000, -49.370000);
INSERT INTO public.endereco VALUES (23, '88803030', 'Rua Tiradentes', '87', NULL, 'Santa Bárbara', 'Criciúma', 'SC', -28.700000, -49.370000);
INSERT INTO public.endereco VALUES (24, '88804040', 'Rua São José', '1020', NULL, 'Pinheirinho', 'Criciúma', 'SC', -28.710000, -49.370000);
INSERT INTO public.endereco VALUES (25, '88805050', 'Rua Rio Branco', '56', 'Casa 2', 'Próspera', 'Criciúma', 'SC', -28.720000, -49.370000);
INSERT INTO public.endereco VALUES (26, '88806060', 'Rua Santos Dumont', '410', NULL, 'Rio Maina', 'Criciúma', 'SC', -28.730000, -49.370000);
INSERT INTO public.endereco VALUES (27, '88807070', 'Rua Anita Garibaldi', '99', NULL, 'Pinheirinho', 'Criciúma', 'SC', -28.740000, -49.370000);
INSERT INTO public.endereco VALUES (28, '88808080', 'Rua Getúlio Vargas', '730', 'Ap 12', 'Operária Nova', 'Criciúma', 'SC', -28.750000, -49.370000);
INSERT INTO public.endereco VALUES (29, '88809090', 'Rua Sete de Setembro', '1500', NULL, 'Pio Corrêa', 'Criciúma', 'SC', -28.760000, -49.370000);
INSERT INTO public.endereco VALUES (30, '88810100', 'Rua Marcílio Dias', '28', NULL, 'São Luiz', 'Criciúma', 'SC', -28.770000, -49.370000);


--
-- TOC entry 5118 (class 0 OID 17285)
-- Dependencies: 230
-- Data for Name: estudante; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.estudante VALUES (1, 'Ana Beatriz Souza', 'Bia', '11122233301', '48998880001', 'ana.souza@email.com', 1, 'Medicina', 'noite', 21, 1, '17:40:00', 450.00, 10, 'ativo');
INSERT INTO public.estudante VALUES (2, 'Bruno Henrique Costa', 'Bruno', '11122233302', '48998880002', 'bruno.costa@email.com', 2, 'Engenharia Mecânica', 'noite', 22, 2, '17:45:00', 420.00, 10, 'ativo');
INSERT INTO public.estudante VALUES (3, 'Camila Rodrigues', 'Cami', '11122233303', '48998880003', 'camila.r@email.com', 3, 'Engenharia Elétrica', 'noite', 23, 3, '17:50:00', 380.00, 5, 'ativo');
INSERT INTO public.estudante VALUES (4, 'Diego Fernandes', NULL, '11122233304', '48998880004', 'diego.f@email.com', 4, 'Direito', 'noite', 24, 4, '17:15:00', 520.00, 15, 'ativo');
INSERT INTO public.estudante VALUES (5, 'Eduarda Lima', 'Duda', '11122233305', '48998880005', 'eduarda.lima@email.com', 5, 'Técnico em Automação', 'noite', 25, 5, '17:55:00', 350.00, 5, 'ativo');
INSERT INTO public.estudante VALUES (6, 'Felipe Augusto Ramos', 'Felipão', '11122233306', '48998880006', NULL, 6, 'Engenharia de Computação', 'noite', 26, 6, '17:00:00', 600.00, 20, 'ativo');
INSERT INTO public.estudante VALUES (7, 'Gabriela Martins', 'Gabi', '11122233307', '48998880007', 'gabi.martins@email.com', 7, 'Psicologia', 'manha', 27, 7, '06:10:00', 480.00, 10, 'ativo');
INSERT INTO public.estudante VALUES (8, 'Henrique Oliveira', NULL, '11122233308', '48998880008', 'henrique.o@email.com', 8, 'Administração', 'manha', 28, 8, '06:30:00', 400.00, 10, 'ativo');
INSERT INTO public.estudante VALUES (9, 'Isabela Pereira', 'Isa', '11122233309', '48998880009', 'isabela.p@email.com', 9, 'Pedagogia', 'tarde', 29, 9, '12:20:00', 360.00, 25, 'ativo');
INSERT INTO public.estudante VALUES (10, 'João Vitor Almeida', 'JV', '11122233310', '48998880010', 'jv.almeida@email.com', 10, 'Agroecologia', 'tarde', 30, 10, '12:00:00', 390.00, 28, 'inativo');


--
-- TOC entry 5116 (class 0 OID 17273)
-- Dependencies: 228
-- Data for Name: instituicao; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.instituicao VALUES (1, 'UNESC - Universidade do Extremo Sul Catarinense', 11);
INSERT INTO public.instituicao VALUES (2, 'Faculdade SATC', 12);
INSERT INTO public.instituicao VALUES (3, 'IFSC - Câmpus Criciúma', 13);
INSERT INTO public.instituicao VALUES (4, 'UNISUL - Câmpus Tubarão', 14);
INSERT INTO public.instituicao VALUES (5, 'SENAI Criciúma', 15);
INSERT INTO public.instituicao VALUES (6, 'UFSC - Câmpus Araranguá', 16);
INSERT INTO public.instituicao VALUES (7, 'UNIBAVE - Orleans', 17);
INSERT INTO public.instituicao VALUES (8, 'ESUCRI - Escola Superior de Criciúma', 18);
INSERT INTO public.instituicao VALUES (9, 'Faculdade de Içara', 19);
INSERT INTO public.instituicao VALUES (10, 'IFSC - Câmpus Urussanga', 20);


--
-- TOC entry 5112 (class 0 OID 17232)
-- Dependencies: 224
-- Data for Name: motorista; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.motorista VALUES (1, 1, 1, 'Carlos Eduardo Martins', '12345678901', '48991110001', '01234567801', '2028-03-15', 3200.00, 5, 'ativo');
INSERT INTO public.motorista VALUES (2, 2, 2, 'João Pedro Rocha', '23456789012', '48991110002', '01234567802', '2027-08-20', 3000.00, 5, 'ativo');
INSERT INTO public.motorista VALUES (3, 3, 3, 'Marcos Antônio Silva', '34567890123', '48991110003', '01234567803', '2029-01-10', 3500.00, 10, 'ativo');
INSERT INTO public.motorista VALUES (4, 4, 4, 'Ricardo Souza Lima', '45678901234', '48991110004', '01234567804', '2027-11-30', 3100.00, 5, 'ativo');
INSERT INTO public.motorista VALUES (5, 5, 5, 'Fernanda Costa Alves', '56789012345', '48991110005', '01234567805', '2028-06-05', 3200.00, 5, 'ativo');
INSERT INTO public.motorista VALUES (6, 6, 6, 'Paulo Henrique Dias', '67890123456', '48991110006', '01234567806', '2027-04-18', 2900.00, 15, 'ativo');
INSERT INTO public.motorista VALUES (7, 7, 7, 'Juliana Ferreira', '78901234567', '48991110007', '01234567807', '2029-09-22', 3000.00, 5, 'ativo');
INSERT INTO public.motorista VALUES (8, 8, 8, 'Anderson Luiz Pereira', '89012345678', '48991110008', '01234567808', '2028-12-01', 3400.00, 10, 'ativo');
INSERT INTO public.motorista VALUES (9, 9, 9, 'Roberto Carlos Nunes', '90123456789', '48991110009', '01234567809', '2027-07-14', 3000.00, 5, 'ativo');
INSERT INTO public.motorista VALUES (10, 10, NULL, 'Sérgio Mendes Ramos', '01234567890', '48991110010', '01234567810', '2026-12-31', 2800.00, 5, 'inativo');


--
-- TOC entry 5120 (class 0 OID 17313)
-- Dependencies: 232
-- Data for Name: rota; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.rota VALUES (1, 'Centro → UNESC (noite)', 1, 1, 'noite', '18:00:00', '22:40:00', 'ativo');
INSERT INTO public.rota VALUES (2, 'Michel → SATC (noite)', 2, 2, 'noite', '18:10:00', '22:30:00', 'ativo');
INSERT INTO public.rota VALUES (3, 'Santa Bárbara → IFSC (noite)', 3, 3, 'noite', '18:15:00', '22:30:00', 'ativo');
INSERT INTO public.rota VALUES (4, 'Pinheirinho → UNISUL (noite)', 4, 4, 'noite', '17:30:00', '23:00:00', 'ativo');
INSERT INTO public.rota VALUES (5, 'Próspera → SENAI (noite)', 5, 5, 'noite', '18:20:00', '22:20:00', 'ativo');
INSERT INTO public.rota VALUES (6, 'Rio Maina → UFSC Araranguá (noite)', 6, 6, 'noite', '17:15:00', '23:10:00', 'ativo');
INSERT INTO public.rota VALUES (7, 'Pinheirinho → UNIBAVE (manhã)', 7, 7, 'manha', '06:30:00', '12:10:00', 'ativo');
INSERT INTO public.rota VALUES (8, 'Operária → ESUCRI (manhã)', 8, 8, 'manha', '06:50:00', '12:00:00', 'ativo');
INSERT INTO public.rota VALUES (9, 'Pio Corrêa → Içara (tarde)', 9, 9, 'tarde', '12:40:00', '18:00:00', 'ativo');
INSERT INTO public.rota VALUES (10, 'São Luiz → IFSC Urussanga (tarde)', 9, 10, 'tarde', '12:20:00', '17:40:00', 'ativo');


--
-- TOC entry 5121 (class 0 OID 17332)
-- Dependencies: 233
-- Data for Name: rota_dia; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.rota_dia VALUES (1, 1);
INSERT INTO public.rota_dia VALUES (2, 1);
INSERT INTO public.rota_dia VALUES (3, 1);
INSERT INTO public.rota_dia VALUES (4, 1);
INSERT INTO public.rota_dia VALUES (5, 1);
INSERT INTO public.rota_dia VALUES (6, 1);
INSERT INTO public.rota_dia VALUES (7, 1);
INSERT INTO public.rota_dia VALUES (8, 1);
INSERT INTO public.rota_dia VALUES (1, 2);
INSERT INTO public.rota_dia VALUES (2, 2);
INSERT INTO public.rota_dia VALUES (3, 2);
INSERT INTO public.rota_dia VALUES (4, 2);
INSERT INTO public.rota_dia VALUES (5, 2);
INSERT INTO public.rota_dia VALUES (6, 2);
INSERT INTO public.rota_dia VALUES (7, 2);
INSERT INTO public.rota_dia VALUES (8, 2);
INSERT INTO public.rota_dia VALUES (1, 3);
INSERT INTO public.rota_dia VALUES (2, 3);
INSERT INTO public.rota_dia VALUES (3, 3);
INSERT INTO public.rota_dia VALUES (4, 3);
INSERT INTO public.rota_dia VALUES (5, 3);
INSERT INTO public.rota_dia VALUES (6, 3);
INSERT INTO public.rota_dia VALUES (7, 3);
INSERT INTO public.rota_dia VALUES (8, 3);
INSERT INTO public.rota_dia VALUES (1, 4);
INSERT INTO public.rota_dia VALUES (2, 4);
INSERT INTO public.rota_dia VALUES (3, 4);
INSERT INTO public.rota_dia VALUES (4, 4);
INSERT INTO public.rota_dia VALUES (5, 4);
INSERT INTO public.rota_dia VALUES (6, 4);
INSERT INTO public.rota_dia VALUES (7, 4);
INSERT INTO public.rota_dia VALUES (8, 4);
INSERT INTO public.rota_dia VALUES (1, 5);
INSERT INTO public.rota_dia VALUES (2, 5);
INSERT INTO public.rota_dia VALUES (3, 5);
INSERT INTO public.rota_dia VALUES (4, 5);
INSERT INTO public.rota_dia VALUES (5, 5);
INSERT INTO public.rota_dia VALUES (6, 5);
INSERT INTO public.rota_dia VALUES (7, 5);
INSERT INTO public.rota_dia VALUES (8, 5);
INSERT INTO public.rota_dia VALUES (9, 1);
INSERT INTO public.rota_dia VALUES (9, 2);
INSERT INTO public.rota_dia VALUES (9, 3);
INSERT INTO public.rota_dia VALUES (9, 4);
INSERT INTO public.rota_dia VALUES (9, 5);
INSERT INTO public.rota_dia VALUES (9, 6);
INSERT INTO public.rota_dia VALUES (10, 1);
INSERT INTO public.rota_dia VALUES (10, 3);
INSERT INTO public.rota_dia VALUES (10, 5);


--
-- TOC entry 5130 (class 0 OID 17416)
-- Dependencies: 242
-- Data for Name: titulo_pagar; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.titulo_pagar VALUES (1, 1, 'salario', 1, NULL, 'Carlos Eduardo Martins', 'Salário Carlos Eduardo Martins - 09/2026', '2026-09-01', 3200.00, '2026-10-05', '2026-10-05', 3200.00, 'pago');
INSERT INTO public.titulo_pagar VALUES (2, 2, 'salario', 2, NULL, 'João Pedro Rocha', 'Salário João Pedro Rocha - 09/2026', '2026-09-01', 3000.00, '2026-10-05', '2026-10-05', 3000.00, 'pago');
INSERT INTO public.titulo_pagar VALUES (3, 3, 'salario', 3, NULL, 'Marcos Antônio Silva', 'Salário Marcos Antônio Silva - 09/2026', '2026-09-01', 3500.00, '2026-10-10', '2026-10-10', 3500.00, 'pago');
INSERT INTO public.titulo_pagar VALUES (4, 1, 'salario', 1, NULL, 'Carlos Eduardo Martins', 'Salário Carlos Eduardo Martins - 10/2026', '2026-10-01', 3200.00, '2026-11-05', NULL, NULL, 'aberto');
INSERT INTO public.titulo_pagar VALUES (5, 2, 'salario', 2, NULL, 'João Pedro Rocha', 'Salário João Pedro Rocha - 10/2026', '2026-10-01', 3000.00, '2026-11-05', NULL, NULL, 'aberto');
INSERT INTO public.titulo_pagar VALUES (6, 1, 'combustivel', NULL, 1, 'Posto Rodovia Ltda', 'Diesel S10 - outubro', '2026-10-01', 1850.75, '2026-10-31', NULL, NULL, 'aberto');
INSERT INTO public.titulo_pagar VALUES (7, 3, 'manutencao', NULL, 3, 'Mecânica Boa Viagem', 'Troca de pastilhas e revisão 50 mil km', '2026-10-01', 1240.00, '2026-10-20', '2026-10-20', 1240.00, 'pago');
INSERT INTO public.titulo_pagar VALUES (8, 5, 'seguro', NULL, 5, 'Seguradora Sul Ltda', 'Seguro anual - parcela 10/12', '2026-10-01', 420.30, '2026-10-15', '2026-10-15', 420.30, 'pago');
INSERT INTO public.titulo_pagar VALUES (9, 7, 'impostos', NULL, 7, 'Governo de SC', 'IPVA 2026 - parcela 10', '2026-10-01', 310.00, '2026-10-25', NULL, NULL, 'cancelado');
INSERT INTO public.titulo_pagar VALUES (10, 4, 'outros', NULL, NULL, 'Gráfica Criciúma', 'Adesivos e carteirinhas dos alunos', '2026-10-01', 260.00, '2026-11-10', NULL, NULL, 'aberto');


--
-- TOC entry 5128 (class 0 OID 17399)
-- Dependencies: 240
-- Data for Name: titulo_receber; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.titulo_receber VALUES (1, 1, '2026-10-01', 450.00, '2026-10-10', '2026-10-08', 450.00, 'pago');
INSERT INTO public.titulo_receber VALUES (2, 2, '2026-10-01', 420.00, '2026-10-10', '2026-10-10', 420.00, 'pago');
INSERT INTO public.titulo_receber VALUES (3, 3, '2026-10-01', 380.00, '2026-10-05', '2026-10-04', 380.00, 'pago');
INSERT INTO public.titulo_receber VALUES (4, 4, '2026-10-01', 520.00, '2026-10-15', '2026-10-17', 530.40, 'pago');
INSERT INTO public.titulo_receber VALUES (5, 5, '2026-10-01', 350.00, '2026-10-05', NULL, NULL, 'aberto');
INSERT INTO public.titulo_receber VALUES (6, 6, '2026-10-01', 600.00, '2026-10-20', '2026-10-20', 600.00, 'pago');
INSERT INTO public.titulo_receber VALUES (7, 7, '2026-10-01', 480.00, '2026-10-10', NULL, NULL, 'aberto');
INSERT INTO public.titulo_receber VALUES (8, 8, '2026-10-01', 400.00, '2026-10-10', '2026-10-09', 400.00, 'pago');
INSERT INTO public.titulo_receber VALUES (9, 9, '2026-10-01', 360.00, '2026-10-25', NULL, NULL, 'aberto');
INSERT INTO public.titulo_receber VALUES (10, 10, '2026-10-01', 390.00, '2026-10-28', NULL, NULL, 'cancelado');


--
-- TOC entry 5110 (class 0 OID 17215)
-- Dependencies: 222
-- Data for Name: veiculo; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.veiculo VALUES (1, 1, 'QJA1B23', 'Mercedes-Benz Sprinter 416', 'Branca', 20, 'ativo');
INSERT INTO public.veiculo VALUES (2, 2, 'QJB2C34', 'Renault Master Minibus', 'Branca', 16, 'ativo');
INSERT INTO public.veiculo VALUES (3, 3, 'MHB1234', 'Volkswagen Volare W9', 'Prata', 28, 'ativo');
INSERT INTO public.veiculo VALUES (4, 4, 'QJD4E56', 'Iveco Daily Minibus', 'Branca', 19, 'ativo');
INSERT INTO public.veiculo VALUES (5, 5, 'QJE5F67', 'Mercedes-Benz Sprinter 515', 'Azul', 20, 'ativo');
INSERT INTO public.veiculo VALUES (6, 6, 'MKC5678', 'Fiat Ducato Minibus', 'Branca', 16, 'ativo');
INSERT INTO public.veiculo VALUES (7, 7, 'QJG7H89', 'Peugeot Boxer Minibus', 'Prata', 16, 'ativo');
INSERT INTO public.veiculo VALUES (8, 8, 'QJH8I90', 'Marcopolo Volare V8L', 'Branca', 24, 'ativo');
INSERT INTO public.veiculo VALUES (9, 9, 'QJI9J01', 'Renault Master Executiva', 'Preta', 15, 'ativo');
INSERT INTO public.veiculo VALUES (10, 10, 'MLD9012', 'Mercedes-Benz Sprinter 416', 'Branca', 20, 'inativo');


--
-- TOC entry 5125 (class 0 OID 17358)
-- Dependencies: 237
-- Data for Name: viagem; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.viagem VALUES (1, 1, 1, 1, '2026-10-29', 'ida', '2026-10-29 17:35:00', '2026-10-29 18:00:00', 'concluida');
INSERT INTO public.viagem VALUES (2, 2, 2, 2, '2026-10-29', 'ida', '2026-10-29 17:40:00', '2026-10-29 18:12:00', 'concluida');
INSERT INTO public.viagem VALUES (3, 3, 3, 3, '2026-10-29', 'ida', '2026-10-29 17:45:00', '2026-10-29 18:15:00', 'concluida');
INSERT INTO public.viagem VALUES (4, 4, 4, 4, '2026-10-29', 'ida', '2026-10-29 17:10:00', '2026-10-29 17:32:00', 'concluida');
INSERT INTO public.viagem VALUES (5, 5, 5, 5, '2026-10-29', 'ida', '2026-10-29 17:50:00', '2026-10-29 18:18:00', 'concluida');
INSERT INTO public.viagem VALUES (6, 6, 6, 6, '2026-10-29', 'ida', '2026-10-29 16:55:00', '2026-10-29 17:20:00', 'concluida');
INSERT INTO public.viagem VALUES (7, 7, 7, 7, '2026-10-29', 'ida', '2026-10-29 06:05:00', '2026-10-29 06:31:00', 'concluida');
INSERT INTO public.viagem VALUES (8, 8, 8, 8, '2026-10-29', 'ida', '2026-10-29 06:25:00', NULL, 'cancelada');
INSERT INTO public.viagem VALUES (9, 9, 9, 9, '2026-10-30', 'ida', NULL, NULL, 'agendada');
INSERT INTO public.viagem VALUES (10, 10, 9, 9, '2026-10-30', 'ida', NULL, NULL, 'agendada');


--
-- TOC entry 5148 (class 0 OID 0)
-- Dependencies: 225
-- Name: area_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.area_id_seq', 10, true);


--
-- TOC entry 5149 (class 0 OID 0)
-- Dependencies: 234
-- Name: dia_sem_aula_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.dia_sem_aula_id_seq', 10, true);


--
-- TOC entry 5150 (class 0 OID 0)
-- Dependencies: 219
-- Name: empresa_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.empresa_id_seq', 10, true);


--
-- TOC entry 5151 (class 0 OID 0)
-- Dependencies: 217
-- Name: endereco_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.endereco_id_seq', 30, true);


--
-- TOC entry 5152 (class 0 OID 0)
-- Dependencies: 229
-- Name: estudante_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.estudante_id_seq', 10, true);


--
-- TOC entry 5153 (class 0 OID 0)
-- Dependencies: 227
-- Name: instituicao_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.instituicao_id_seq', 10, true);


--
-- TOC entry 5154 (class 0 OID 0)
-- Dependencies: 223
-- Name: motorista_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.motorista_id_seq', 10, true);


--
-- TOC entry 5155 (class 0 OID 0)
-- Dependencies: 231
-- Name: rota_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.rota_id_seq', 10, true);


--
-- TOC entry 5156 (class 0 OID 0)
-- Dependencies: 241
-- Name: titulo_pagar_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.titulo_pagar_id_seq', 10, true);


--
-- TOC entry 5157 (class 0 OID 0)
-- Dependencies: 239
-- Name: titulo_receber_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.titulo_receber_id_seq', 10, true);


--
-- TOC entry 5158 (class 0 OID 0)
-- Dependencies: 221
-- Name: veiculo_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.veiculo_id_seq', 10, true);


--
-- TOC entry 5159 (class 0 OID 0)
-- Dependencies: 236
-- Name: viagem_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.viagem_id_seq', 10, true);


--
-- TOC entry 4898 (class 2606 OID 17266)
-- Name: area area_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.area
    ADD CONSTRAINT area_pkey PRIMARY KEY (id);


--
-- TOC entry 4923 (class 2606 OID 17387)
-- Name: chamada chamada_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chamada
    ADD CONSTRAINT chamada_pkey PRIMARY KEY (fk_viagem, fk_estudante);


--
-- TOC entry 4914 (class 2606 OID 17351)
-- Name: dia_sem_aula dia_sem_aula_data_fk_instituicao_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dia_sem_aula
    ADD CONSTRAINT dia_sem_aula_data_fk_instituicao_key UNIQUE NULLS NOT DISTINCT (data, fk_instituicao);


--
-- TOC entry 4916 (class 2606 OID 17349)
-- Name: dia_sem_aula dia_sem_aula_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dia_sem_aula
    ADD CONSTRAINT dia_sem_aula_pkey PRIMARY KEY (id);


--
-- TOC entry 4884 (class 2606 OID 17208)
-- Name: empresa empresa_cnpj_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa
    ADD CONSTRAINT empresa_cnpj_key UNIQUE (cnpj);


--
-- TOC entry 4886 (class 2606 OID 17206)
-- Name: empresa empresa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa
    ADD CONSTRAINT empresa_pkey PRIMARY KEY (id);


--
-- TOC entry 4882 (class 2606 OID 17198)
-- Name: endereco endereco_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.endereco
    ADD CONSTRAINT endereco_pkey PRIMARY KEY (id);


--
-- TOC entry 4903 (class 2606 OID 17296)
-- Name: estudante estudante_cpf_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estudante
    ADD CONSTRAINT estudante_cpf_key UNIQUE (cpf);


--
-- TOC entry 4905 (class 2606 OID 17294)
-- Name: estudante estudante_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estudante
    ADD CONSTRAINT estudante_pkey PRIMARY KEY (id);


--
-- TOC entry 4901 (class 2606 OID 17278)
-- Name: instituicao instituicao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instituicao
    ADD CONSTRAINT instituicao_pkey PRIMARY KEY (id);


--
-- TOC entry 4892 (class 2606 OID 17246)
-- Name: motorista motorista_cnh_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motorista
    ADD CONSTRAINT motorista_cnh_key UNIQUE (cnh);


--
-- TOC entry 4894 (class 2606 OID 17244)
-- Name: motorista motorista_cpf_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motorista
    ADD CONSTRAINT motorista_cpf_key UNIQUE (cpf);


--
-- TOC entry 4896 (class 2606 OID 17242)
-- Name: motorista motorista_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motorista
    ADD CONSTRAINT motorista_pkey PRIMARY KEY (id);


--
-- TOC entry 4912 (class 2606 OID 17337)
-- Name: rota_dia rota_dia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rota_dia
    ADD CONSTRAINT rota_dia_pkey PRIMARY KEY (fk_rota, dia_semana);


--
-- TOC entry 4908 (class 2606 OID 17321)
-- Name: rota rota_fk_motorista_fk_instituicao_turno_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rota
    ADD CONSTRAINT rota_fk_motorista_fk_instituicao_turno_key UNIQUE (fk_motorista, fk_instituicao, turno);


--
-- TOC entry 4910 (class 2606 OID 17319)
-- Name: rota rota_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rota
    ADD CONSTRAINT rota_pkey PRIMARY KEY (id);


--
-- TOC entry 4932 (class 2606 OID 17425)
-- Name: titulo_pagar titulo_pagar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.titulo_pagar
    ADD CONSTRAINT titulo_pagar_pkey PRIMARY KEY (id);


--
-- TOC entry 4927 (class 2606 OID 17409)
-- Name: titulo_receber titulo_receber_fk_estudante_competencia_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.titulo_receber
    ADD CONSTRAINT titulo_receber_fk_estudante_competencia_key UNIQUE (fk_estudante, competencia);


--
-- TOC entry 4929 (class 2606 OID 17407)
-- Name: titulo_receber titulo_receber_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.titulo_receber
    ADD CONSTRAINT titulo_receber_pkey PRIMARY KEY (id);


--
-- TOC entry 4888 (class 2606 OID 17223)
-- Name: veiculo veiculo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculo
    ADD CONSTRAINT veiculo_pkey PRIMARY KEY (id);


--
-- TOC entry 4890 (class 2606 OID 17225)
-- Name: veiculo veiculo_placa_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculo
    ADD CONSTRAINT veiculo_placa_key UNIQUE (placa);


--
-- TOC entry 4919 (class 2606 OID 17366)
-- Name: viagem viagem_fk_rota_data_sentido_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viagem
    ADD CONSTRAINT viagem_fk_rota_data_sentido_key UNIQUE (fk_rota, data, sentido);


--
-- TOC entry 4921 (class 2606 OID 17364)
-- Name: viagem viagem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viagem
    ADD CONSTRAINT viagem_pkey PRIMARY KEY (id);


--
-- TOC entry 4899 (class 1259 OID 17444)
-- Name: ix_area_motorista; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_area_motorista ON public.area USING btree (fk_motorista);


--
-- TOC entry 4924 (class 1259 OID 17445)
-- Name: ix_chamada_estudante; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_chamada_estudante ON public.chamada USING btree (fk_estudante);


--
-- TOC entry 4906 (class 1259 OID 17443)
-- Name: ix_estudante_area; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_estudante_area ON public.estudante USING btree (fk_area);


--
-- TOC entry 4930 (class 1259 OID 17447)
-- Name: ix_pagar_venc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pagar_venc ON public.titulo_pagar USING btree (data_vencimento) WHERE (status = 'aberto'::public.status_titulo);


--
-- TOC entry 4925 (class 1259 OID 17446)
-- Name: ix_receber_venc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_receber_venc ON public.titulo_receber USING btree (data_vencimento) WHERE (status = 'aberto'::public.status_titulo);


--
-- TOC entry 4917 (class 1259 OID 17442)
-- Name: ix_viagem_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_viagem_data ON public.viagem USING btree (data);


--
-- TOC entry 4933 (class 1259 OID 17441)
-- Name: ux_salario_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_salario_mes ON public.titulo_pagar USING btree (fk_motorista, competencia) WHERE (categoria = 'salario'::public.categoria_titulo_pagar);


--
-- TOC entry 4956 (class 2620 OID 17449)
-- Name: estudante tg_estudante_area; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tg_estudante_area BEFORE INSERT OR UPDATE OF fk_endereco ON public.estudante FOR EACH ROW EXECUTE FUNCTION public.definir_area_estudante();


--
-- TOC entry 4938 (class 2606 OID 17267)
-- Name: area area_fk_motorista_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.area
    ADD CONSTRAINT area_fk_motorista_fkey FOREIGN KEY (fk_motorista) REFERENCES public.motorista(id);


--
-- TOC entry 4950 (class 2606 OID 17393)
-- Name: chamada chamada_fk_estudante_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chamada
    ADD CONSTRAINT chamada_fk_estudante_fkey FOREIGN KEY (fk_estudante) REFERENCES public.estudante(id);


--
-- TOC entry 4951 (class 2606 OID 17388)
-- Name: chamada chamada_fk_viagem_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chamada
    ADD CONSTRAINT chamada_fk_viagem_fkey FOREIGN KEY (fk_viagem) REFERENCES public.viagem(id) ON DELETE CASCADE;


--
-- TOC entry 4946 (class 2606 OID 17352)
-- Name: dia_sem_aula dia_sem_aula_fk_instituicao_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dia_sem_aula
    ADD CONSTRAINT dia_sem_aula_fk_instituicao_fkey FOREIGN KEY (fk_instituicao) REFERENCES public.instituicao(id);


--
-- TOC entry 4934 (class 2606 OID 17209)
-- Name: empresa empresa_fk_endereco_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa
    ADD CONSTRAINT empresa_fk_endereco_fkey FOREIGN KEY (fk_endereco) REFERENCES public.endereco(id);


--
-- TOC entry 4940 (class 2606 OID 17307)
-- Name: estudante estudante_fk_area_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estudante
    ADD CONSTRAINT estudante_fk_area_fkey FOREIGN KEY (fk_area) REFERENCES public.area(id);


--
-- TOC entry 4941 (class 2606 OID 17302)
-- Name: estudante estudante_fk_endereco_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estudante
    ADD CONSTRAINT estudante_fk_endereco_fkey FOREIGN KEY (fk_endereco) REFERENCES public.endereco(id);


--
-- TOC entry 4942 (class 2606 OID 17297)
-- Name: estudante estudante_fk_instituicao_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estudante
    ADD CONSTRAINT estudante_fk_instituicao_fkey FOREIGN KEY (fk_instituicao) REFERENCES public.instituicao(id);


--
-- TOC entry 4939 (class 2606 OID 17279)
-- Name: instituicao instituicao_fk_endereco_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instituicao
    ADD CONSTRAINT instituicao_fk_endereco_fkey FOREIGN KEY (fk_endereco) REFERENCES public.endereco(id);


--
-- TOC entry 4936 (class 2606 OID 17247)
-- Name: motorista motorista_fk_empresa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motorista
    ADD CONSTRAINT motorista_fk_empresa_fkey FOREIGN KEY (fk_empresa) REFERENCES public.empresa(id);


--
-- TOC entry 4937 (class 2606 OID 17252)
-- Name: motorista motorista_fk_veiculo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motorista
    ADD CONSTRAINT motorista_fk_veiculo_fkey FOREIGN KEY (fk_veiculo) REFERENCES public.veiculo(id);


--
-- TOC entry 4945 (class 2606 OID 17338)
-- Name: rota_dia rota_dia_fk_rota_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rota_dia
    ADD CONSTRAINT rota_dia_fk_rota_fkey FOREIGN KEY (fk_rota) REFERENCES public.rota(id) ON DELETE CASCADE;


--
-- TOC entry 4943 (class 2606 OID 17327)
-- Name: rota rota_fk_instituicao_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rota
    ADD CONSTRAINT rota_fk_instituicao_fkey FOREIGN KEY (fk_instituicao) REFERENCES public.instituicao(id);


--
-- TOC entry 4944 (class 2606 OID 17322)
-- Name: rota rota_fk_motorista_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rota
    ADD CONSTRAINT rota_fk_motorista_fkey FOREIGN KEY (fk_motorista) REFERENCES public.motorista(id);


--
-- TOC entry 4953 (class 2606 OID 17426)
-- Name: titulo_pagar titulo_pagar_fk_empresa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.titulo_pagar
    ADD CONSTRAINT titulo_pagar_fk_empresa_fkey FOREIGN KEY (fk_empresa) REFERENCES public.empresa(id);


--
-- TOC entry 4954 (class 2606 OID 17431)
-- Name: titulo_pagar titulo_pagar_fk_motorista_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.titulo_pagar
    ADD CONSTRAINT titulo_pagar_fk_motorista_fkey FOREIGN KEY (fk_motorista) REFERENCES public.motorista(id);


--
-- TOC entry 4955 (class 2606 OID 17436)
-- Name: titulo_pagar titulo_pagar_fk_veiculo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.titulo_pagar
    ADD CONSTRAINT titulo_pagar_fk_veiculo_fkey FOREIGN KEY (fk_veiculo) REFERENCES public.veiculo(id);


--
-- TOC entry 4952 (class 2606 OID 17410)
-- Name: titulo_receber titulo_receber_fk_estudante_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.titulo_receber
    ADD CONSTRAINT titulo_receber_fk_estudante_fkey FOREIGN KEY (fk_estudante) REFERENCES public.estudante(id);


--
-- TOC entry 4935 (class 2606 OID 17226)
-- Name: veiculo veiculo_fk_empresa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculo
    ADD CONSTRAINT veiculo_fk_empresa_fkey FOREIGN KEY (fk_empresa) REFERENCES public.empresa(id);


--
-- TOC entry 4947 (class 2606 OID 17377)
-- Name: viagem viagem_fk_motorista_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viagem
    ADD CONSTRAINT viagem_fk_motorista_fkey FOREIGN KEY (fk_motorista) REFERENCES public.motorista(id);


--
-- TOC entry 4948 (class 2606 OID 17367)
-- Name: viagem viagem_fk_rota_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viagem
    ADD CONSTRAINT viagem_fk_rota_fkey FOREIGN KEY (fk_rota) REFERENCES public.rota(id);


--
-- TOC entry 4949 (class 2606 OID 17372)
-- Name: viagem viagem_fk_veiculo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viagem
    ADD CONSTRAINT viagem_fk_veiculo_fkey FOREIGN KEY (fk_veiculo) REFERENCES public.veiculo(id);


-- Completed on 2026-10-30 13:31:02

--
-- PostgreSQL database dump complete
--

\unrestrict blnNdxYW77qeFs1xMnPECq03DBSBDLDdBjwvieL2S9eZe1sMSmz5dgKHx4S74JL

