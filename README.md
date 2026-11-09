<p align="center"><img src="frontend/public/univan-logo-removebg.png" alt="UniVan" width="260" /></p>

<h1 align="center">UniVan</h1>

<p align="center">
  <strong>Sistema de Gestão de Transporte Universitário</strong><br />
  Passageiros, motoristas e veículos · rotas e pontos de embarque · viagens e chamadas · relatórios
</p>

<p align="center">
  <img alt="Python" src="https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white" />
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white" />
</p>

---

## Sumário

1. [Sobre o projeto](#sobre-o-projeto)
2. [O problema](#o-problema)
3. [Público-alvo](#público-alvo)
4. [Proposta de valor](#proposta-de-valor)
5. [Como funciona](#como-funciona)
6. [Como rodar](#como-rodar)
7. [Arquitetura](#arquitetura)
8. [Tecnologias](#tecnologias)
9. [Documentação](#documentação)
10. [Equipe](#equipe)

---

## Sobre o projeto

O **UniVan** é uma aplicação web para o **gerenciamento do transporte universitário**, com foco na
organização de rotas, no controle de passageiros e no acompanhamento das viagens feitas por
motoristas de vans, micro-ônibus e ônibus.

O sistema reúne em uma única plataforma as informações que hoje ficam espalhadas em planilhas e
grupos de mensagens: quem são os passageiros, onde embarcam, quem atende cada rota, quais viagens
acontecem em cada dia e quem embarcou ou faltou.

O projeto está sendo construído como um **Produto Mínimo Viável (MVP)**, priorizando as
funcionalidades essenciais para tornar o transporte mais organizado e confiável.

---

## O problema

Estudantes que dependem de transporte entre municípios para chegar à faculdade, e as pessoas que
administram esse serviço, enfrentam no dia a dia:

- **falhas no controle de embarque**, com passageiros esquecidos ou contados errado;
- **dificuldade para localizar os pontos de parada**, principalmente para motoristas substitutos;
- **chamadas sem padrão**, feitas de um jeito diferente por cada motorista e sem histórico;
- **dependência de planilhas e mensagens**, com informação descentralizada e desatualizada.

---

## Público-alvo

- **Principal:** empresas e responsáveis pela administração do transporte universitário, e os
  motoristas que fazem o trajeto diário.
- **Secundário:** os estudantes que usam o serviço, especialmente os que dependem de rotas e
  horários fixos.

---

## Proposta de valor

- Controle de embarque com **chamadas digitais** vinculadas a cada viagem.
- Menos risco de **passageiros sem conferência** durante o percurso.
- **Pontos de embarque** fáceis de encontrar, com endereços e mapa.
- Informações de passageiros, motoristas, veículos, rotas e viagens **centralizadas**.
- **Históricos e relatórios** para acompanhar a operação.
- Menos dependência de **controles manuais**.

---

## Como funciona

O dia a dia do transporte segue um ciclo simples:

```text
 CADASTRO        ──▶  PLANEJAMENTO      ──▶  VIAGENS DO DIA     ──▶  EMBARQUE           ──▶  ENCERRAMENTO
 passageiros,         rotas por             geradas a partir        chamada digital:         histórico salvo
 motoristas e         instituição,          das rotas, sem          presente, ausente        para consultas
 veículos             turno e dias          feriados                ou "não vou"             e relatórios
```

1. **Cadastro** de passageiros, motoristas, veículos e instituições de ensino. Cada passageiro é
   ligado automaticamente à região atendida por um motorista, a partir do endereço.
2. **Planejamento** das rotas: qual motorista leva quais passageiros, para qual instituição, em
   qual turno e em quais dias da semana.
3. **Viagens do dia**, de ida e volta, criadas a partir das rotas, respeitando feriados e recessos.
4. **Embarque**: o passageiro pode avisar com antecedência que não vai, e o motorista registra
   quem embarcou.
5. **Encerramento**: a viagem é concluída e o histórico de chamadas fica disponível para relatórios
   de frequência e acompanhamento.

Os cadastros nunca são apagados, só desativados, para que o histórico continue completo.

---

## Como rodar

**Pré-requisitos:** Python 3.12+ e Node.js 20+. O banco é SQLite, que já vem com o Python.

Na raiz do projeto, pelo Git Bash (Windows), Linux ou macOS, rode na ordem:

```bash
bash scripts/1-banco.sh       # 1. cria o banco com dados de exemplo
bash scripts/2-backend.sh     # 2. sobe a API (deixe o terminal aberto)
bash scripts/3-frontend.sh    # 3. sobe a interface, em outro terminal
```

Depois acesse http://localhost:5173. O passo a passo para outros terminais e a solução de
problemas comuns estão em [docs/setup.md](docs/setup.md).

---

## Arquitetura

O UniVan usa uma arquitetura **cliente-servidor em três partes**:

```text
┌──────────────────────┐   HTTP + JSON   ┌──────────────────────┐   SQL   ┌──────────────────────┐
│  FRONTEND            │ ──────────────▶ │  BACKEND (API REST)  │ ──────▶ │  BANCO DE DADOS      │
│  React + TypeScript  │ ◀────────────── │  Python + FastAPI    │ ◀────── │  SQLite              │
└──────────────────────┘                 └──────────────────────┘         └──────────────────────┘
   o que o usuário vê                     regras de negócio                 onde os dados ficam
```

- **Frontend:** mostra as telas e conversa com a API. Não acessa o banco.
- **Backend:** valida os dados, aplica as regras de negócio e devolve JSON.
- **Banco:** guarda os dados e garante as regras mais críticas de integridade.

O código segue o padrão **MVC em camadas**: o frontend é a *View*, e o backend separa
*Controllers* (rotas HTTP), validação, regras de negócio, acesso a dados e *Models*. Além das
camadas, tudo é organizado **por módulo** (veículos, passageiros, rotas…), o que facilita a
manutenção e o trabalho em paralelo.

Mais detalhes em [docs/architecture.md](docs/architecture.md).

---

## Tecnologias

| Camada | Linguagem | Principais tecnologias |
|---|---|---|
| Frontend | TypeScript | React, Vite, Tailwind CSS, React Router |
| Backend | Python | FastAPI, SQLAlchemy, Pydantic, pytest |
| Banco de dados | SQL | SQLite |
| Automação | Bash | Scripts para criar o banco e subir o projeto |
| Versionamento | — | Git e GitHub |

---

## Documentação

| Documento | Conteúdo |
|---|---|
| [Como rodar](docs/setup.md) | Passo a passo por terminal e problemas comuns |
| [Arquitetura](docs/architecture.md) | MVC, camadas e organização em módulos |
| [Banco de dados](docs/database.md) | Tabelas, relacionamentos e regras |
| [Backend](docs/backend.md) | Estrutura da API e como criar um módulo novo |
| [Frontend](docs/frontend.md) | Identidade visual, telas e componentes |
| [Tarefas](docs/tarefas.md) | Situação de cada requisito do MVP |
| [Documento do MVP](docs/documentacao-mvp.pdf) | Proposta, escopo e requisitos |
| [Modelo de dados](docs/documentacao-banco-edr.pdf) | Explicação de cada tabela e campo |

---

## Equipe

Projeto da disciplina **Desenvolvimento de Sistemas para Web**, com o professor
**Wanderson Muniz de Santana**.

- Gabriel Terres Geraldini
- Vinicius Coutinho Guimarães
