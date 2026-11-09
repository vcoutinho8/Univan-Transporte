# Arquitetura do UniVan

Este documento explica **como o UniVan está organizado e por quê**. Ele começa pelo quadro geral,
explica o padrão **MVC** do zero e depois mostra, com o código real do projeto, como cada pedaço
do MVC aparece no backend e no frontend.

> Se você só quer rodar o projeto, vá para [setup.md](setup.md). Se quer criar uma tela ou um
> endpoint novo, leia este documento e depois [backend.md](backend.md) e [frontend.md](frontend.md).

---

## 1. O quadro geral: cliente-servidor em três partes

O documento do MVP ([documentacao-mvp.pdf](documentacao-mvp.pdf)) define uma arquitetura
**cliente-servidor**, com separação entre interface, API e banco:

```text
┌──────────────────────┐   HTTP + JSON   ┌──────────────────────┐   SQL   ┌──────────────────────┐
│  FRONTEND            │ ──────────────▶ │  BACKEND (API REST)  │ ──────▶ │  BANCO DE DADOS      │
│  React + TypeScript  │ ◀────────────── │  Python + FastAPI    │ ◀────── │  SQLite              │
│  Tailwind CSS        │                 │  SQLAlchemy+Pydantic │         │  backend/univan.db   │
│  frontend/           │                 │  backend/            │         │  docs/univan-sqlite  │
└──────────────────────┘                 └──────────────────────┘         └──────────────────────┘
   o que o usuário vê                     regras de negócio                 onde os dados vivem
```

| Parte | Responsabilidade | Nunca faz |
|---|---|---|
| **Frontend** | Mostrar telas, receber cliques e digitação, chamar a API, exibir mensagens | Acessar o banco diretamente ou decidir regras de negócio importantes |
| **Backend** | Validar dados, aplicar regras de negócio, consultar e gravar no banco, devolver JSON | Montar HTML ou se preocupar com aparência |
| **Banco** | Guardar os dados e garantir as regras mais críticas (CHECK, UNIQUE, trigger, funções) | Saber que existe uma tela |

Três decisões importantes atravessam o projeto:

1. **O banco é a referência principal.** Ele já existe ([univan-sqlite.sql](univan-sqlite.sql)) e
   tem regras próprias (ex.: placa no formato Mercosul, uma viagem por rota + data + sentido). A
   aplicação **não cria nem altera tabelas**: só usa o que existe. Um teste automático garante que
   os models do Python batem com o banco, coluna por coluna.
2. **Nada é apagado.** Excluir um veículo, motorista ou passageiro significa marcá-lo como
   `inativo`. O histórico das viagens e chamadas continua íntegro (RNF4).
3. **Tudo em português para quem usa.** Mensagens de erro, telas e até os nomes de variáveis e
   funções estão em português, para o código falar a mesma língua do domínio.

---

## 2. O que é MVC

**MVC** (*Model-View-Controller*, ou Modelo-Visão-Controlador) é um padrão de arquitetura que
divide uma aplicação em três papéis, cada um com **um único motivo para mudar**:

| Papel | Pergunta que responde | Analogia com uma empresa de vans |
|---|---|---|
| **Model** (Modelo) | *"Quais são os dados e como eles se relacionam?"* | O **arquivo** da empresa: as fichas de cada veículo, motorista e passageiro |
| **View** (Visão) | *"Como isso aparece para quem usa?"* | O **quadro de avisos** e as planilhas impressas que o motorista lê |
| **Controller** (Controlador) | *"O que fazer quando alguém pede algo?"* | A **recepção**: recebe o pedido, chama quem resolve e devolve a resposta |

### Como uma ação flui no MVC clássico

```text
   Usuário
     │ 1. clica em "Salvar veículo"
     ▼
┌────────────┐  2. repassa o pedido  ┌──────────────┐  3. lê/grava dados  ┌──────────┐
│    VIEW    │ ────────────────────▶ │  CONTROLLER  │ ──────────────────▶ │  MODEL   │
│ (a tela)   │ ◀──────────────────── │ (o porteiro) │ ◀────────────────── │ (dados)  │
└────────────┘  5. mostra o resultado└──────────────┘  4. devolve dados   └──────────┘
```

1. O usuário interage com a **View** (clica, digita).
2. A View avisa o **Controller** do que aconteceu.
3. O Controller pede ao **Model** para ler ou alterar dados.
4. O Model devolve os dados (ou um erro, se uma regra foi violada).
5. O Controller escolhe o que mostrar, e a **View** se atualiza.

### Por que separar assim

- **Mudanças ficam localizadas.** Trocar a cor de um botão mexe só na View. Mudar a regra de
  placa mexe só no Model/regras. Trocar de framework web mexe só no Controller.
- **Testes ficam simples.** Dá para testar as regras sem abrir navegador nem banco (fazemos isso
  em `backend/tests/`).
- **Várias pessoas trabalham em paralelo** sem pisar no código uma da outra.
- **Atende o RNF6** do MVP: *"o código deverá ser organizado em módulos e camadas, facilitando
  correções e a inclusão de novas funcionalidades."*

---

## 3. Como o MVC aparece no UniVan

Num sistema web moderno com API, o MVC fica **distribuído entre os dois lados**: o backend é dono
do **M** e do **C**, e o frontend é a **V**. O JSON que trafega entre eles é a "representação"
que a View consome.

```text
             FRONTEND (View)                                BACKEND (Controller + Model)
┌─────────────────────────────────────────┐      ┌───────────────────────────────────────────────────┐
│ VehiclesPage.tsx  ← o que o usuário vê  │      │ veiculo_controller.py  ← C: recebe a requisição   │
│ VehicleForm.tsx                         │ JSON │        │                                          │
│        │                                │ ───▶ │ veiculo_schema.py      ← valida entrada/saída     │
│ vehicleService.ts ← chama a API         │ ◀─── │ veiculo_servico.py     ← regras de negócio        │
│ types.ts          ← formato dos dados   │      │ veiculo_repositorio.py ← fala com o banco         │
└─────────────────────────────────────────┘      │ veiculo_model.py       ← M: a tabela `veiculo`    │
                                                 └───────────────────────────────────────────────────┘
```

Para não deixar o Controller nem o Model "gordos", o backend usa **duas camadas extras**, muito
comuns em projetos FastAPI e em arquiteturas em camadas (é o que o PDF chama de *"separação entre
endpoints, validação, regras de negócio, acesso a dados e modelos"*):

| Camada | Arquivo | Papel no MVC | Faz | Não deve |
|---|---|---|---|---|
| **Model** | `<modulo>_model.py` | **M** | Mapear uma tabela existente do banco para uma classe Python | Ter regra de negócio ou saber de HTTP |
| **Schema** | `<modulo>_schema.py` | Fronteira entre **C** e **V** | Validar o JSON que chega e definir o JSON que sai | Acessar o banco |
| **Repositório** | `<modulo>_repositorio.py` | Apoio ao **M** | Fazer consultas e gravações | Decidir regra de negócio |
| **Serviço** | `<modulo>_servico.py` | Apoio ao **C** (regras do **M**) | Aplicar regras de negócio, orquestrar repositórios, lançar erros com mensagem em português | Saber que existe HTTP |
| **Controller** | `<modulo>_controller.py` | **C** | Declarar a rota (`GET /api/veiculos`), chamar o serviço, devolver a resposta | Conter regra ou SQL |

No frontend, o mesmo raciocínio se repete em escala menor:

| Peça do frontend | Papel | Exemplo |
|---|---|---|
| **Página** (`*Page.tsx`) | **V** principal: monta a tela e reage às ações do usuário | `VehiclesPage.tsx` |
| **Componente** (`*Form.tsx`, `shared/components/`) | **V** reaproveitável | `VehicleForm.tsx`, `Button.tsx` |
| **Service** (`*Service.ts`) | Ponte até o Controller do backend | `vehicleService.ts` |
| **Tipos** (`types.ts`) | Espelho do Model/Schema, para o TypeScript conferir | `modules/veiculo/types.ts` |
| **Hook** (`useRequisicao`) | Cola entre View e service: carregando, erro, dados | `shared/hooks/useRequest.ts` |

### Regra de ouro: as dependências apontam para dentro

```text
controller ──▶ servico ──▶ repositorio ──▶ model ──▶ banco
    │             │
  schema       erros de negócio
```

O controller conhece o serviço; o serviço conhece o repositório; o repositório conhece o model.
**Nunca o contrário.** O serviço recebe os repositórios pelo construtor (injeção de dependência),
por isso nos testes trocamos o repositório real por um falso em memória e testamos tudo sem banco.

---

## 4. Uma requisição de ponta a ponta

Vamos seguir o clique em **"Salvar"** no formulário de novo veículo, passo a passo, com os nomes
reais do código:

| # | Onde | O que acontece |
|---|---|---|
| 1 | `VehicleForm.tsx` (**View**) | O usuário digita `qja-1b23` na placa e clica em Salvar. A função `enviar` lê o formulário e chama `aoSalvar(dados)`. |
| 2 | `VehiclesPage.tsx` (**View**) | `salvar()` decide se é cadastro ou edição e chama `servicoVeiculo.cadastrar(dados)`. |
| 3 | `vehicleService.ts` → `shared/services/api.ts` | `requisitar()` faz `POST /api/veiculos` com o JSON. |
| 4 | `veiculo_controller.py` (**Controller**) | O FastAPI encontra a rota `cadastrar_veiculo` e monta o `ServicoVeiculo` via `Depends`. |
| 5 | `veiculo_schema.py` (**Schema**) | `VeiculoCriacao` valida o corpo. O validador `normalizar_placa` transforma `qja-1b23` em `QJA1B23`. Se a placa fosse `AB12345`, a resposta seria 422 com *"Placa inválida. Use o formato ABC1234 ou ABC1D23."* |
| 6 | `veiculo_servico.py` (**regras**) | `cadastrar()` confere se a empresa existe e se a placa está livre. Se não estiver, lança `ConflitoDeDados("Já existe um veículo com esta placa.")`. |
| 7 | `veiculo_repositorio.py` | `salvar()` faz `add` + `commit` na sessão do SQLAlchemy. |
| 8 | `veiculo_model.py` (**Model**) → SQLite | O SQLAlchemy gera o `INSERT INTO veiculo ...`. O banco confere os CHECK e UNIQUE (última barreira). |
| 9 | Volta pelo caminho | O controller devolve `VeiculoResposta` como JSON com status 201. |
| 10 | `VehiclesPage.tsx` (**View**) | Mostra o aviso verde *"Veículo QJA1B23 cadastrado."* e recarrega a tabela. |

Se algo der errado em qualquer etapa, o erro vira **sempre** o mesmo formato JSON
(`{"mensagem": "...", "erros": [...]}`), tratado em `backend/app/config/erros.py`, e o frontend
mostra a mensagem em português no `Alerta`.

---

## 5. Organização em módulos

Além das camadas, o código é dividido **por assunto** (módulo). Cada módulo é uma pasta com o nome
da entidade, igual ao nome da tabela no banco, **tanto no backend quanto no frontend**:

```text
backend/app/modules/veiculo/          frontend/src/modules/veiculo/
├── veiculo_model.py                  ├── VehiclesPage.tsx
├── veiculo_schema.py                 ├── VehicleForm.tsx
├── veiculo_repositorio.py            ├── vehicleService.ts
├── veiculo_servico.py                └── types.ts
└── veiculo_controller.py
```

Vantagens de organizar por módulo em vez de "uma pasta por camada":

- **Tudo de um assunto fica junto.** Para mexer em veículos, você abre uma pasta só.
- **Módulos crescem de forma independente.** `estudante/` hoje só tem o model; quando a tela de
  passageiros for feita, os outros arquivos entram na mesma pasta.
- **O nome do módulo é o mesmo nos três lugares**: tabela `veiculo` no banco, pasta `veiculo` no
  backend e pasta `veiculo` no frontend.

O que é usado por todos os módulos fica em pastas comuns:

| Pasta | Conteúdo |
|---|---|
| `backend/app/config/` | Configurações (`.env`), conexão com o banco, tratamento de erros |
| `backend/app/shared/` | Base dos models (`base.py`) e enums do banco (`enums.py`) |
| `frontend/src/shared/` | Componentes visuais, layout (menu e barra superior), hook de requisição, cliente HTTP |

### Mapa dos módulos

| Módulo | Requisito do MVP | Backend | Frontend |
|---|---|---|---|
| `saude` | — | Controller (`GET /api/saude`) | Usado pelo painel |
| `painel` | RF5 | Schema, repositório, serviço, controller | Página do painel |
| `empresa` | RF2 | Completo (só listagem) | Service + tipos |
| `veiculo` | RF2 | **Completo (CRUD)** | **Tela completa** |
| `estudante` (passageiros) | RF2 | Model | Menu "Em breve" |
| `motorista` | RF2 | Model | Menu "Em breve" |
| `endereco` | RF4 / RF6 | Model | — |
| `instituicao` | RF2 | Model | — |
| `area` | RF4 | Model | — |
| `rota` (+ `rota_dia`) | RF4 | Model | Menu "Em breve" |
| `dia_sem_aula` | RF3 | Model | — |
| `viagem` | RF3 | Model | Menu "Em breve" |
| `chamada` | RF3 | Model | Menu "Em breve" |
| `financeiro` | Fora do MVP | Models (`titulo_receber`, `titulo_pagar`) | — |

---

## 6. Estrutura completa do monorepo

```text
uni-van/
├── .claude/skills/prototipo/   skill do Claude Code para protótipos de UI e de lógica
├── backend/
│   ├── app/
│   │   ├── main.py             cria a API, CORS, erros e registra os controllers
│   │   ├── config/             configuracoes.py, banco.py, erros.py
│   │   ├── shared/             base.py, enums.py
│   │   └── modules/            um módulo por assunto (ver tabela acima)
│   ├── tests/                  testes com pytest (não precisam de banco)
│   └── requirements.txt
├── frontend/
│   ├── public/                 favicon.png e univan-logo-removebg.png
│   ├── src/
│   │   ├── main.tsx            ponto de entrada
│   │   ├── App.tsx             rotas da interface
│   │   ├── styles/index.css    Tailwind + paleta de cores
│   │   ├── shared/             componentes, layout, hooks, services, tipos, páginas genéricas
│   │   └── modules/            painel/, empresa/, veiculo/ ...
│   └── package.json
├── docs/                       esta documentação, PDFs e o dump do banco
├── .env.example                modelo do .env (lido pelo backend e pelo frontend)
└── README.md
```

---

## 7. Decisões e o que ainda falta

| Decisão | Motivo |
|---|---|
| SQLite em vez de PostgreSQL | O MVP previa PostgreSQL + Supabase. Com SQLite o banco é um arquivo só, sem servidor para instalar, e o projeto roda só com Python e Node |
| Sem migrations / `create_all` | A estrutura vem dos scripts em `docs/`; no SQLite, a API cria o arquivo a partir de `univan-sqlite.sql` |
| Exclusão lógica (`DELETE` inativa) | Preserva histórico de viagens e chamadas (RNF4) |
| Erros padronizados em português | Mensagens prontas para mostrar ao usuário (RNF1) |
| Regras duplicadas no schema e no banco | O schema dá mensagens amigáveis; o banco é a última barreira |
| Um `.env` só, na raiz | Backend e frontend leem o mesmo arquivo |
| Menu montado a partir dos requisitos do MVP | Telas não prontas aparecem como "Em breve" e explicam o que vão fazer |

**Ainda não existe** (ver [tarefas.md](tarefas.md)): autenticação e perfis (RF1/RNF3 — o banco
ainda não tem tabela de usuários), mapas com Leaflet (RF6) e as telas de passageiros, motoristas,
rotas, viagens, chamadas e relatórios.
