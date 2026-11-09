<p align="center"><img src="frontend/public/univan-logo-removebg.png" alt="UniVan" width="260" /></p>

<h1 align="center">UniVan</h1>

<p align="center">
  <strong>Sistema de Gestão de Transporte Universitário</strong><br />
  Cadastro de passageiros, motoristas e veículos · rotas e pontos de embarque · viagens diárias ·
  chamada de embarque · relatórios
</p>

<p align="center">
  <img alt="Python" src="https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white" />
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.162-009688?logo=fastapi&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white" />
</p>

---

## Sumário

1. [Sobre o projeto](#1-sobre-o-projeto)
2. [O problema](#2-o-problema)
3. [Público-alvo](#3-público-alvo)
4. [Proposta de valor](#4-proposta-de-valor)
5. [Como o UniVan funciona](#5-como-o-univan-funciona)
6. [Funcionalidades do MVP e situação atual](#6-funcionalidades-do-mvp-e-situação-atual)
7. [Requisitos não funcionais](#7-requisitos-não-funcionais)
8. [Fora do escopo do MVP](#8-fora-do-escopo-do-mvp)
9. [Como rodar o projeto](#9-como-rodar-o-projeto)
10. [Endpoints da API](#10-endpoints-da-api)
11. [Testes](#11-testes)
12. [Estrutura do repositório](#12-estrutura-do-repositório)
13. [Documentação complementar](#13-documentação-complementar)
14. [Padronização de idioma](#14-padronização-de-idioma)
15. [Arquitetura](#15-arquitetura)
16. [Linguagens e tecnologias](#16-linguagens-e-tecnologias)
17. [Equipe](#17-equipe)

---

## 1. Sobre o projeto

O **UniVan** é uma aplicação web para o **gerenciamento das operações de transporte
universitário**, com foco na organização de rotas, no controle de passageiros e no acompanhamento
das viagens feitas por motoristas de vans, micro-ônibus e ônibus.

O sistema centraliza em uma única plataforma as informações que hoje ficam espalhadas em
planilhas e grupos de WhatsApp: quem são os passageiros, onde embarcam, qual motorista e veículo
atendem cada rota, quais viagens acontecem em cada dia e quem embarcou ou faltou em cada uma delas.

O projeto foi desenvolvido para a disciplina **Desenvolvimento de Sistemas para Web** e está sendo
construído como um **Produto Mínimo Viável (MVP)**, priorizando as funcionalidades essenciais para
melhorar a organização e a confiabilidade do transporte. A proposta completa, o escopo e os
requisitos estão em [docs/documentacao-mvp.pdf](docs/documentacao-mvp.pdf).

> **Objetivo ao final do MVP:** demonstrar um fluxo completo de operação, desde o cadastro de
> passageiros e a definição de rotas até a execução de uma viagem, o registro das chamadas e a
> geração de relatórios administrativos.

---

## 2. O problema

A proposta nasceu da observação das dificuldades enfrentadas por **estudantes que dependem de
transporte entre municípios** para chegar às instituições de ensino, e também por **motoristas e
responsáveis pela administração** desse serviço. Os principais problemas identificados são:

| Problema | Consequência no dia a dia |
|---|---|
| Falhas no controle de embarque | Passageiros esquecidos no ponto ou contados errado |
| Dificuldade em localizar pontos de parada | Atrasos e rotas confusas, principalmente para motoristas novos ou substitutos |
| Falta de padronização das chamadas | Cada motorista confere os passageiros de um jeito, sem histórico confiável |
| Dependência de planilhas e mensagens de WhatsApp | Informação descentralizada, desatualizada e difícil de consultar |

---

## 3. Público-alvo

- **Público principal:** proprietários e responsáveis pela administração de empresas ou serviços
  de transporte universitário, e os **motoristas** que fazem o transporte diário de estudantes
  entre municípios, bairros e instituições de ensino.
- **Público beneficiário secundário:** os **estudantes universitários** que usam esses serviços,
  especialmente os que dependem de rotas e horários fixos para chegar à faculdade.

---

## 4. Proposta de valor

- ✅ Melhorar o **controle de embarque** com chamadas digitais vinculadas a cada viagem.
- ✅ Reduzir o risco de **passageiros ficarem sem conferência** durante o percurso.
- ✅ Facilitar a identificação dos **pontos de embarque** com mapas e endereços organizados.
- ✅ **Centralizar** informações sobre estudantes, motoristas, veículos, rotas e viagens.
- ✅ Disponibilizar **históricos e relatórios** para acompanhar a operação.
- ✅ Diminuir a dependência de **controles manuais e planilhas** descentralizadas.

---

## 5. Como o UniVan funciona

O modelo de dados foi pensado a partir da rotina real de uma empresa de transporte universitário
(explicação completa de cada tabela e campo em
[docs/documentacao-banco-edr.pdf](docs/documentacao-banco-edr.pdf) e
[docs/database.md](docs/database.md)).

### Entidades principais

| Entidade | O que representa |
|---|---|
| **Empresa** | A transportadora dona dos veículos e empregadora dos motoristas |
| **Veículo** | Van, micro-ônibus ou ônibus, com placa (padrão antigo ou Mercosul) e capacidade |
| **Motorista** | Quem dirige; tem CPF, CNH, veículo padrão e dados de pagamento |
| **Área** | Região da cidade (um polígono no mapa) atendida por um motorista |
| **Instituição** | A faculdade ou universidade de destino |
| **Estudante (passageiro)** | Aluno que usa o transporte: onde mora, onde estuda, turno e mensalidade |
| **Rota** | A combinação **motorista + instituição + turno**, com os dias da semana em que acontece |
| **Dia sem aula** | Feriados e recessos, gerais ou de uma instituição específica |
| **Viagem** | Cada ida ou volta de uma rota em uma data |
| **Chamada** | A situação de um estudante em uma viagem: pendente, não vai, presente ou ausente |

### O ciclo de um dia de operação

```text
 1. CADASTRO           2. PLANEJAMENTO         3. GERAÇÃO DO DIA        4. OPERAÇÃO              5. ENCERRAMENTO
┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐     ┌──────────────────┐
│ Estudante é  │     │ Rota = motorista│     │ gerar_dia(data)  │     │ Estudante avisa   │     │ concluir_viagem  │
│ cadastrado;  │ ──▶ │ + instituição + │ ──▶ │ cria as viagens  │ ──▶ │ "não vou" (até 1h │ ──▶ │ fecha a viagem;  │
│ o banco      │     │ turno, com dias │     │ de ida e volta e │     │ antes); motorista │     │ quem ficou       │
│ define a área│     │ da semana       │     │ chamadas pendente│     │ marca "presente"  │     │ pendente vira    │
│ pelo endereço│     │                 │     │ (pula feriados)  │     │ no embarque       │     │ ausente          │
└──────────────┘     └─────────────────┘     └──────────────────┘     └───────────────────┘     └──────────────────┘
```

1. **Cadastro.** Ao cadastrar um estudante, um *trigger* do banco descobre em qual **área** fica o
   endereço dele (ponto dentro do polígono) e o associa automaticamente ao motorista daquela área.
2. **Planejamento.** Cada **rota** liga um motorista a uma instituição em um turno (manhã, tarde ou
   noite), e define em quais dias da semana ela roda.
3. **Geração do dia.** A função `gerar_dia(data)` cria as viagens de ida e volta de todas as rotas
   ativas daquele dia, respeitando os dias da semana e os dias sem aula, e já cria uma chamada
   `pendente` para cada estudante esperado. Rodar de novo não duplica nada (é idempotente).
4. **Operação.** O estudante pode avisar que **não vai** (`avisar_nao_vou`) com pelo menos 1 hora de
   antecedência. Durante o trajeto, o motorista marca quem **embarcou**, registrando o horário.
5. **Encerramento.** `concluir_viagem` fecha a viagem e transforma em **ausente** quem continuou
   pendente. O histórico fica guardado para consultas e relatórios, como a view `vw_frequencia`
   (presenças, avisos, faltas e percentual de presença por estudante).

### Regras importantes garantidas pelo sistema

- **Nada é apagado.** Excluir um veículo, motorista ou passageiro significa marcá-lo como
  `inativo`, preservando o histórico de viagens e chamadas.
- **Sem duplicidades:** CPF, CNPJ, CNH e placa são únicos; existe só uma rota por
  motorista + instituição + turno, uma viagem por rota + data + sentido e um estudante por viagem.
- **Formatos validados:** CPF com 11 dígitos, CNPJ com 14, CEP com 8 e placa no formato `ABC1234`
  ou Mercosul `ABC1D23`.
- **Mensagens em português:** qualquer erro, seja de validação ou de restrição do banco, chega ao
  usuário como uma mensagem clara em português.

---

## 6. Funcionalidades do MVP e situação atual

Legenda: ✅ pronto · 🟡 parcial · 🗄️ existe no banco, falta API/tela · ⬜ a fazer

| Código | Requisito | O que prevê | Situação |
|---|---|---|---|
| **RF1** | Autenticação e controle de acesso | Login, perfis de administrador e motorista, restrição de acesso por perfil | ⬜ |
| **RF2** | Gestão de cadastros | Passageiros, motoristas e veículos; associação de passageiros a rotas e pontos de embarque | 🟡 veículos prontos (API + tela) |
| **RF3** | Gerenciamento de viagens e chamadas | Criar viagens por data e turno, listar passageiros esperados, registrar presença e ausência, encerrar viagem | 🗄️ rotinas prontas no banco |
| **RF4** | Cadastro e edição de rotas | Pontos de embarque com localização, sequência e horários previstos, associação de motoristas e veículos | ⬜ |
| **RF5** | Painel administrativo e relatórios | Viagens programadas e realizadas, histórico de chamadas, relatórios por período, rota e turno | 🟡 painel pronto |
| **RF6** | Visualização geográfica | Pontos de embarque em mapa interativo, endereços e sequência das paradas | ⬜ |

### O que já pode ser usado

- **Painel (RF5):** indicadores de passageiros, motoristas, veículos e rotas ativos; viagens do dia
  por situação (agendadas, em andamento, concluídas, canceladas); alerta de passageiros cujo
  endereço não está em nenhuma área.
- **Veículos (RF2):** listar, buscar, cadastrar, editar, inativar e reativar, com validação de
  placa e capacidade.
- **Empresas (RF2):** listagem pela API, usada no formulário de veículos.
- **Menu completo:** as telas que ainda não existem aparecem com a etiqueta **"Em breve"** e
  explicam o que vão fazer quando estiverem prontas.

O detalhamento item por item de cada requisito está em [docs/tarefas.md](docs/tarefas.md).

---

## 7. Requisitos não funcionais

| Código | Requisito | Como o projeto atende |
|---|---|---|
| RNF1 | Usabilidade | Interface simples, toda em português, com mensagens de erro claras |
| RNF2 | Responsividade | Menu vira gaveta no celular, tabelas com rolagem horizontal, grades adaptáveis |
| RNF3 | Segurança | ⬜ Senhas com hash e permissões por perfil dependem do RF1 |
| RNF4 | Integridade dos dados | Restrições no banco + validação nos schemas; exclusão sempre lógica |
| RNF5 | Desempenho | Consultas com `joinedload` e contagens do painel feitas direto no banco |
| RNF6 | Manutenibilidade | Código organizado em módulos e camadas (MVC) e coberto por testes automáticos |
| RNF7 | Disponibilidade | ⬜ Hospedagem a definir |
| RNF8 | Privacidade (LGPD) | ⬜ Acesso restrito a dados pessoais depende do RF1 |

---

## 8. Fora do escopo do MVP

O documento do MVP deixa para versões futuras:

- rastreamento por GPS em tempo real;
- otimização automática de rotas;
- notificações automáticas aos passageiros;
- pagamentos e gestão financeira completa.

O banco já tem a parte financeira (mensalidades, salários, despesas, inadimplentes e resultado do
mês) e os models existem no módulo `financeiro`, mas **não haverá telas para isso no MVP**.

---

## 9. Como rodar o projeto

### Pré-requisitos

| Ferramenta | Versão | Observação |
|---|---|---|
| Python | 3.12 ou superior | Testado com 3.14 |
| Node.js | 20 ou superior | Testado com 24 |

Não é preciso instalar banco de dados: o UniVan usa **SQLite**, que já vem com o Python.

### Jeito mais fácil: 3 scripts, na ordem

Na raiz do projeto, pelo Git Bash (Windows), Linux ou macOS. O número no nome diz a ordem:

| Ordem | Comando | O que faz | Terminal |
|---|---|---|---|
| **1** | `bash scripts/1-banco.sh` | Cria o banco SQLite (`backend/univan.db`) com **5 registros de exemplo** por tabela. Se o banco já existir, pergunta antes de apagar (`--sim` pula a pergunta) | Qualquer um; termina sozinho |
| **2** | `bash scripts/2-backend.sh` | Prepara o Python (ambiente virtual e dependências) e sobe a API em http://localhost:8000/api | Deixe aberto |
| **3** | `bash scripts/3-frontend.sh` | Instala as dependências do Node e sobe a interface em http://localhost:5173 | Outro terminal, deixe aberto |

O passo 1 só precisa ser repetido quando você quiser **voltar aos dados de exemplo**. No dia a
dia, basta rodar o 2 e o 3. Os 5 registros são os de número 1 a 5 de cada tabela dos dados de teste,
que só apontam uns para os outros. Por isso ficam também os 15 endereços que eles usam e os 25 dias
de rota (5 rotas × seg a sex).


### Passo a passo manual

#### 1. Variáveis de ambiente

```bash
cp .env.example .env
```

Um único `.env`, na raiz, é lido pelo backend e pelo frontend:

| Variável | Para que serve |
|---|---|
| `APP_NAME` | Nome exibido na documentação da API |
| `DATABASE_URL` | Banco de dados. Padrão: `sqlite:///backend/univan.db` (caminho relativo à raiz) |
| `DATABASE_ECHO` | `true` para mostrar no console o SQL gerado |
| `CORS_ORIGINS` | Origens liberadas no CORS, separadas por vírgula |
| `VITE_API_URL` | Endereço da API visto pelo navegador (padrão `/api`, via proxy do Vite) |
| `API_PROXY_TARGET` | Para onde o Vite repassa as chamadas a `/api` |

#### 2. Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Os comandos acima são para o Git Bash. Para PowerShell, CMD ou Linux/macOS, e para resolver erros
comuns, veja [docs/setup.md](docs/setup.md).

Na primeira vez, a API cria o arquivo `backend/univan.db` a partir de
[docs/univan-sqlite.sql](docs/univan-sqlite.sql), com tabelas, restrições, views, trigger e dados de
teste (Criciúma e região, SC). Para voltar aos dados originais, pare a API e apague o arquivo.

- API: http://localhost:8000/api
- Documentação interativa (Swagger): http://localhost:8000/api/docs

#### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Acesse http://localhost:5173.

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento com recarga automática |
| `npm run build` | Confere os tipos e gera a versão de produção |
| `npm run typecheck` | Só confere os tipos do TypeScript |
| `npm run preview` | Serve localmente a versão gerada pelo build |

---

## 10. Endpoints da API

Todas as rotas ficam sob o prefixo `/api`. A lista completa, com exemplos e a opção de testar, está
em http://localhost:8000/api/docs.

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/saude` | Verifica se a API e o banco estão respondendo |
| `GET` | `/api/painel/resumo` | Números da tela inicial (indicadores e viagens do dia) |
| `GET` | `/api/empresas` | Lista as empresas |
| `GET` | `/api/veiculos` | Lista os veículos (filtros opcionais `status` e `fk_empresa`) |
| `GET` | `/api/veiculos/{id}` | Busca um veículo |
| `POST` | `/api/veiculos` | Cadastra um veículo |
| `PATCH` | `/api/veiculos/{id}` | Altera um veículo (inclusive reativar) |
| `DELETE` | `/api/veiculos/{id}` | Inativa um veículo (não apaga o registro) |

Os erros seguem sempre o mesmo formato:

```json
{ "mensagem": "Placa inválida. Use o formato ABC1234 ou ABC1D23.", "erros": [] }
```

---

## 11. Testes

```bash
cd backend
.venv/Scripts/python -m pytest
```

Os testes **não precisam de banco instalado**. Os de regras usam repositórios falsos em memória
(os serviços recebem os repositórios por injeção de dependência), e os de ponta a ponta criam um
SQLite temporário a cada teste, sem tocar no `backend/univan.db`.

| Arquivo | O que garante |
|---|---|
| `test_veiculos.py` | Regras e endpoints de veículos (placa, duplicidade, inativação…) |
| `test_painel.py` | Cálculo dos números do painel |
| `test_banco_sqlite.py` | A API funcionando com um SQLite real: criação do banco, veículos, painel, trigger e mensagens das restrições |
| `test_modelos_iguais_ao_banco.py` | Carrega `docs/univan-sqlite.sql` e falha se algum model tiver tabela, coluna ou enum diferente do banco |

---

## 12. Estrutura do repositório

```text
uni-van/
├── backend/                    API REST em Python
│   ├── app/
│   │   ├── main.py             cria a API, configura CORS e erros, registra os controllers
│   │   ├── config/             configuracoes.py (.env), banco.py (conexão), erros.py
│   │   ├── shared/             base.py (base dos models), enums.py (enums do banco)
│   │   └── modules/            um módulo por assunto: veiculo/, empresa/, painel/, estudante/...
│   ├── tests/                  testes automáticos com pytest
│   └── requirements.txt
├── frontend/                   interface web em React + TypeScript
│   ├── public/                 logo e favicon
│   └── src/
│       ├── main.tsx            ponto de entrada
│       ├── App.tsx             rotas da interface
│       ├── styles/index.css    Tailwind + paleta de cores
│       ├── shared/             componentes, layout, hooks, cliente HTTP, páginas genéricas
│       └── modules/            painel/, empresa/, veiculo/...
├── docs/                       documentação, PDFs e scripts do banco SQLite
├── scripts/
│   ├── 1-banco.sh              passo 1: cria o banco SQLite com 5 registros por tabela
│   ├── 2-backend.sh            passo 2: sobe a API
│   └── 3-frontend.sh           passo 3: sobe a interface
├── .claude/skills/prototipo/   skill do Claude Code para protótipos de tela e de lógica
├── .env.example                modelo do .env
└── README.md
```

---

## 13. Documentação complementar

| Documento | Conteúdo |
|---|---|
| [docs/setup.md](docs/setup.md) | Passo a passo por terminal (Git Bash, PowerShell, CMD) e problemas comuns |
| [docs/architecture.md](docs/architecture.md) | O que é MVC, como ele está aplicado no UniVan e a organização em módulos |
| [docs/database.md](docs/database.md) | Tabelas, relacionamentos, enums, regras e rotinas do banco |
| [docs/backend.md](docs/backend.md) | O que cada arquivo e módulo da API faz, e como criar um módulo novo |
| [docs/frontend.md](docs/frontend.md) | Identidade visual, telas, componentes e comunicação com a API |
| [docs/tarefas.md](docs/tarefas.md) | Situação detalhada de cada requisito do MVP (RF1–RF6, RNF1–RNF8) |
| [docs/documentacao-mvp.pdf](docs/documentacao-mvp.pdf) | Proposta, escopo e requisitos do projeto |
| [docs/documentacao-banco-edr.pdf](docs/documentacao-banco-edr.pdf) | Modelo de dados com explicação de cada tabela e campo |

---

## 14. Padronização de idioma

| Item | Idioma |
|---|---|
| Arquivos Python | Português, com o módulo como prefixo (`veiculo_servico.py`) |
| Pastas de módulo | Nome da tabela no banco, em português (`veiculo/`, `estudante/`) |
| Demais arquivos e pastas | Inglês (`VehiclesPage.tsx`, `modules/`, `shared/`) |
| Variáveis, funções, métodos e classes | Português |
| Comentários, docstrings e documentação | Português |
| Interface e mensagens ao usuário | Português |

---

## 15. Arquitetura

O UniVan usa uma arquitetura **cliente-servidor em três partes**, com separação clara entre a
interface web, a API e a camada de persistência:

```text
┌──────────────────────┐   HTTP + JSON   ┌──────────────────────┐   SQL   ┌──────────────────────┐
│  FRONTEND            │ ──────────────▶ │  BACKEND (API REST)  │ ──────▶ │  BANCO DE DADOS      │
│  React + TypeScript  │ ◀────────────── │  Python + FastAPI    │ ◀────── │  SQLite              │
│  Tailwind CSS        │                 │  SQLAlchemy+Pydantic │         │  backend/univan.db   │
└──────────────────────┘                 └──────────────────────┘         └──────────────────────┘
   o que o usuário vê                     regras de negócio                 onde os dados vivem
```

| Parte | Responsabilidade | Nunca faz |
|---|---|---|
| **Frontend** | Mostra as telas, recebe cliques e digitação, chama a API e exibe mensagens | Acessar o banco ou decidir regras de negócio importantes |
| **Backend** | Valida dados, aplica regras de negócio, consulta e grava no banco, devolve JSON | Montar HTML ou se preocupar com aparência |
| **Banco** | Guarda os dados e garante as regras mais críticas (CHECK, UNIQUE, trigger, funções) | Saber que existe uma tela |

### Padrão MVC em camadas

O código segue o padrão **MVC** (*Model-View-Controller*), distribuído entre os dois lados: o
**backend** é dono do **Model** e do **Controller**, e o **frontend** é a **View**. Para que nenhuma
peça fique sobrecarregada, o backend tem duas camadas extras (schema e serviço), formando uma
**arquitetura em camadas**:

| Camada | Arquivo | Papel |
|---|---|---|
| **Controller** | `<modulo>_controller.py` | Declara a rota HTTP, chama o serviço e devolve a resposta |
| **Schema** | `<modulo>_schema.py` | Valida o JSON que chega e define o JSON que sai (Pydantic) |
| **Serviço** | `<modulo>_servico.py` | Aplica as regras de negócio e lança erros com mensagem em português |
| **Repositório** | `<modulo>_repositorio.py` | Faz as consultas e gravações no banco |
| **Model** | `<modulo>_model.py` | Mapeia uma tabela existente do banco para uma classe Python (SQLAlchemy) |

As dependências sempre apontam **para dentro**:

```text
controller ──▶ servico ──▶ repositorio ──▶ model ──▶ banco
```

No frontend, o mesmo raciocínio se repete: a **página** (`*Page.tsx`) monta a tela, os
**componentes** são as peças visuais reaproveitáveis, o **service** (`*Service.ts`) é a ponte até
a API, os **tipos** (`types.ts`) espelham os dados da API e o hook `useRequest` cuida dos estados de
carregando, erro e dados.

### Organização por módulos

Além das camadas, o código é dividido **por assunto**. Cada módulo é uma pasta com o mesmo nome da
tabela no banco, tanto no backend quanto no frontend:

```text
tabela veiculo  ⇄  backend/app/modules/veiculo/  ⇄  frontend/src/modules/veiculo/
```

Assim, tudo sobre um assunto fica junto, os módulos crescem de forma independente e várias pessoas
podem trabalhar em paralelo, atendendo ao RNF6 (manutenibilidade).

### Decisões de arquitetura

| Decisão | Motivo |
|---|---|
| **SQLite em vez de PostgreSQL** | O documento do MVP previa PostgreSQL + Supabase. Trocamos por SQLite: o banco é um arquivo só, sem servidor para instalar, e o projeto roda só com Python e Node |
| **O banco é a referência principal**, sem migrations nem `create_all` | A estrutura vem de `docs/univan-sqlite.sql`; um teste garante que os models batem com ele |
| **Rotinas de negócio em SQL** (`gerar_dia`, `avisar_nao_vou`, `concluir_viagem`) | Ficam em `docs/univan-sqlite-rotinas.sql` e são executadas pelo backend, não reimplementadas em Python |
| **Exclusão lógica** | Preserva o histórico de viagens e chamadas (RNF4) |
| **Regras no schema e no banco** | O schema dá mensagens amigáveis; o banco é a última barreira |
| **Erros padronizados em português** | Mensagens prontas para mostrar ao usuário (RNF1) |
| **Injeção de dependência nos serviços** | Permite testar as regras sem banco |
| **Monorepo com um `.env` só** | Backend e frontend versionados e configurados juntos |

A explicação completa, com uma requisição seguida de ponta a ponta pelo código, está em
[docs/architecture.md](docs/architecture.md).

---

## 16. Linguagens e tecnologias

### Linguagens

| Linguagem | Onde é usada |
|---|---|
| **Python** | Todo o backend: API, regras de negócio, acesso a dados e testes |
| **TypeScript** | Todo o frontend: páginas, componentes, services e tipos |
| **SQL (SQLite)** | Banco de dados: tabelas, restrições, views, trigger e rotinas |
| **HTML + CSS** | Estrutura da página (`index.html`) e estilos com Tailwind (`index.css`) |
| **Bash** | Scripts que criam o banco e sobem backend e frontend (`scripts/1-banco.sh`, `2-backend.sh`, `3-frontend.sh`) |

### Backend

| Tecnologia | Versão | Para que serve |
|---|---|---|
| [FastAPI](https://fastapi.tiangolo.com/) | 0.162 | Framework da API REST e documentação automática (Swagger) |
| [Uvicorn](https://www.uvicorn.org/) | 0.54 | Servidor ASGI que executa a API |
| [SQLAlchemy](https://www.sqlalchemy.org/) | 2.1 | ORM: mapeia as tabelas do banco para classes Python |
| [Pydantic](https://docs.pydantic.dev/) | 2.14 | Validação dos dados de entrada e saída |
| [pydantic-settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) | 2.16 | Leitura das configurações do `.env` |
| [pytest](https://pytest.org/) + [httpx](https://www.python-httpx.org/) | 9.2 / 0.28 | Testes automáticos dos serviços e endpoints |

### Frontend

| Tecnologia | Versão | Para que serve |
|---|---|---|
| [React](https://react.dev/) | 19 | Construção da interface em componentes |
| [TypeScript](https://www.typescriptlang.org/) | 5.9 | Tipagem estática do código do frontend |
| [Vite](https://vite.dev/) | 8 | Servidor de desenvolvimento, proxy da API e build |
| [Tailwind CSS](https://tailwindcss.com/) | 4 | Estilização e layout responsivo |
| [React Router](https://reactrouter.com/) | 7 | Navegação entre as telas |

### Banco de dados e infraestrutura

| Tecnologia | Para que serve |
|---|---|
| [SQLite](https://sqlite.org/) 3.30+ | Banco de dados principal: um arquivo (`backend/univan.db`), com regras, views e trigger |
| [Leaflet](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/) | Mapas dos pontos de embarque e rotas (previsto, RF6) |
| Git + GitHub | Controle de versões e colaboração entre os integrantes |

---

## 17. Equipe

Projeto da disciplina **Desenvolvimento de Sistemas para Web**, com o professor
**Wanderson Muniz de Santana**.

| Integrante |
|---|
| Gabriel Terres Geraldini |
| Vinicius Coutinho Guimarães |
