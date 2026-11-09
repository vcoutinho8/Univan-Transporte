# Frontend

React 19 · TypeScript · Vite · Tailwind CSS 4 · React Router 7.

O frontend é a **View** do MVC: tudo o que o gestor e o motorista veem e clicam. Ele não acessa o
banco; fala só com a API do backend, em JSON (veja [architecture.md](architecture.md)).

---

## Identidade visual

O UniVan segue o padrão de **sistema de gestão administrativa** (referência:
[DashStack Admin Dashboard UI Kit](https://www.figma.com/pt-br/comunidade/file/1324762163080748317/dashstack-free-admin-dashboard-ui-kit-admin-dashboard-ui-kit-admin-dashboard)):
menu lateral, barra superior, conteúdo em cartões brancos sobre fundo cinza-claro, indicadores com
número grande e ícone colorido, e tabelas com busca e filtro.

### Paleta

| Token | Cor | Uso | Classe Tailwind |
|---|---|---|---|
| `marinho` | `#1B3C59` | Marca, títulos, ícones do menu | `text-marinho`, `bg-marinho` |
| `marinho-escuro` | `#102D40` | Texto principal | `text-marinho-escuro` |
| `laranja` | `#F2600C` | Ação principal, item ativo do menu, destaques | `bg-laranja`, `text-laranja` |
| `laranja-claro` | `#FE6F07` | Hover da ação principal | `hover:bg-laranja-claro` |
| `fundo` | `#F2F2F2` | Fundo das telas, linhas de tabela no hover | `bg-fundo` |

Os tokens ficam em `src/styles/index.css`, no bloco `@theme`. Como são tokens do Tailwind, dá para
usar transparência: `bg-laranja/10` é o laranja com 10% de opacidade (usado nos quadrados de
ícone). Verde, âmbar e vermelho ficam reservados para **situação** (ativo, atenção, erro).

- **Fonte**: Nunito Sans (Google Fonts), a mesma família do DashStack.
- **Logo**: `public/univan-logo-removebg.png`, exibida pelo componente `Logo`.
- **Favicon**: `public/favicon.png`.
- **Campos de formulário**: use a classe `campo` (definida em `index.css`) em `input` e `select`.

---

## Estrutura

```text
frontend/
├── index.html                  título, favicon e fonte
├── public/                     favicon.png, univan-logo-removebg.png
└── src/
    ├── main.tsx                monta o React com BrowserRouter e o CSS
    ├── App.tsx                 rotas da interface
    ├── styles/index.css        Tailwind, paleta e classe .campo
    ├── shared/                 tudo que é usado por mais de um módulo
    │   ├── components/
    │   │   ├── Alert.tsx           Alerta (erro, aviso, sucesso; pode ter botão de fechar)
    │   │   ├── Button.tsx          Botao (primario, secundario, perigo, fantasma)
    │   │   ├── Card.tsx            Cartao (bloco branco com título e ações)
    │   │   ├── Icon.tsx            Icone (SVGs do sistema, sem biblioteca externa)
    │   │   ├── Logo.tsx            Logo (recorta a margem transparente do PNG)
    │   │   ├── PageHeader.tsx      CabecalhoPagina (título, descrição e ações)
    │   │   ├── StatCard.tsx        CartaoIndicador (número grande + ícone)
    │   │   └── StatusBadge.tsx     EtiquetaStatus (Ativo / Inativo)
    │   ├── layout/
    │   │   ├── MainLayout.tsx      LayoutPrincipal (menu + barra + conteúdo)
    │   │   ├── Sidebar.tsx         MenuLateral (fixo no desktop, gaveta no celular)
    │   │   ├── Topbar.tsx          BarraSuperior (data de hoje e usuário)
    │   │   └── menu.ts             itens do menu, ligados aos requisitos do MVP
    │   ├── hooks/useRequest.ts     useRequisicao(): dados, carregando, erro, recarregar
    │   ├── services/api.ts         requisitar() e ErroApi: TODA chamada HTTP passa por aqui
    │   ├── types/api.ts            formato de erro da API e StatusCadastro
    │   └── pages/
    │       ├── ComingSoonPage.tsx  PaginaEmConstrucao (telas "Em breve")
    │       └── NotFoundPage.tsx    PaginaNaoEncontrada (404)
    └── modules/                um módulo por assunto, mesmo nome do backend
        ├── painel/
        │   ├── DashboardPage.tsx   PaginaPainel
        │   ├── dashboardService.ts servicoPainel
        │   └── types.ts            ResumoPainel, ViagensDoDia, Saude
        ├── empresa/
        │   ├── companyService.ts   servicoEmpresa
        │   └── types.ts            Empresa
        └── veiculo/
            ├── VehiclesPage.tsx    PaginaVeiculos
            ├── VehicleForm.tsx     FormularioVeiculo
            ├── vehicleService.ts   servicoVeiculo
            └── types.ts            Veiculo, DadosVeiculo
```

### Convenção de nomes

- **Pasta do módulo** = mesmo nome do módulo no backend e da tabela no banco (`veiculo`, `painel`).
- **Arquivos** em inglês, no padrão do ecossistema React (`VehiclesPage.tsx`, `vehicleService.ts`).
- **Componentes, funções e variáveis** em português (`PaginaVeiculos`, `servicoVeiculo`,
  `aoSalvar`). Hooks mantêm o prefixo `use` exigido pelo React (`useRequisicao`).
- **Todo texto visível** em português.

---

## O MVC dentro do frontend

| Peça | Papel | Exemplo |
|---|---|---|
| `*Page.tsx` | **View** da tela inteira e "mini-controller" das ações do usuário | `PaginaVeiculos` decide se o formulário está aberto, chama o service e mostra o aviso |
| Componentes | **View** reaproveitável, recebe dados e callbacks por props | `FormularioVeiculo` recebe `aoSalvar` e `aoCancelar` |
| `*Service.ts` | Ponte com o **Controller** do backend | `servicoVeiculo.cadastrar(dados)` → `POST /api/veiculos` |
| `types.ts` | Espelho do **Model/Schema** do backend | `Veiculo` = `VeiculoResposta` |
| `useRequisicao` | Cola entre View e service | Controla `carregando`, `erro` e `dados` |

Regra prática: **componente não chama `fetch`**. Componente chama service; service chama
`requisitar`; `requisitar` chama a API.

---

## O que cada tela faz

### Layout (todas as telas)

- **Menu lateral** (`Sidebar.tsx`): logo no topo e itens agrupados em *Geral*, *Cadastros*,
  *Operação* e *Acompanhamento*. O item da tela atual fica em laranja. Itens ainda não
  construídos mostram a etiqueta **"Em breve"**. No celular e tablet, o menu vira uma gaveta
  aberta pelo botão ☰ da barra superior (RNF2).
- **Barra superior** (`Topbar.tsx`): data de hoje por extenso e o bloco do usuário. Como o login
  (RF1) ainda não existe, o usuário aparece fixo como *Administrador*.
- **`menu.ts`** é a fonte única do menu: cada item tem rota, ícone, **requisito do MVP** (RF2,
  RF3...), descrição e se está `pronto`. O `App.tsx` usa essa lista para criar automaticamente a
  rota "Em construção" de cada item não pronto, e o painel usa para mostrar o andamento do MVP.

### Painel (`/`) — RF5

- **Quatro indicadores**: passageiros ativos, motoristas ativos, veículos ativos (clicável, leva à
  frota) e rotas ativas. Os números vêm de `GET /api/painel/resumo`.
- **Viagens de hoje**: barra empilhada com agendadas, em andamento, concluídas e canceladas.
  Sem viagens geradas, mostra *"Nenhuma viagem gerada para hoje."*
- **Pontos de atenção**: avisa quantos passageiros estão **sem área** (o endereço não caiu em
  nenhuma área de motorista e ninguém vai buscá-los) e mostra a conexão com a API e o banco.
- **Andamento do MVP**: um atalho para cada tela do menu, com o requisito e a situação.

### Veículos (`/veiculos`) — RF2

- **Tabela** com placa, modelo, cor, lugares, empresa e situação.
- **Busca** instantânea por placa, modelo, cor ou empresa (filtra a lista já carregada).
- **Filtro de situação**: ativos (padrão), inativos ou todos (este refaz a consulta na API).
- **Novo veículo**: abre o formulário acima da tabela.
- **Editar** (ícone de lápis): abre o mesmo formulário preenchido; salva com `PATCH`.
- **Inativar**: pede confirmação e chama `DELETE` (o veículo continua no histórico).
- **Reativar**: aparece nos inativos; chama `PATCH` com `{"status": "ativo"}`.
- Erros da API aparecem no formulário ou no aviso do topo, com a mensagem do backend
  (ex.: *"Já existe um veículo com esta placa."*).

### Telas "Em breve"

Passageiros, Motoristas (RF2), Rotas (RF4), Viagens e Chamadas (RF3), Mapa (RF6) e Relatórios
(RF5) abrem a `PaginaEmConstrucao`, que mostra o requisito e a descrição do que a tela vai fazer.

---

## Comunicação com a API

- A URL base vem de `VITE_API_URL` (no `.env` da raiz; padrão `/api`). Em `npm run dev`, o Vite
  repassa `/api` para `API_PROXY_TARGET` (padrão `http://127.0.0.1:8000`), sem depender de CORS.
- `requisitar<T>(caminho, { metodo, corpo, parametros })` monta a URL, envia JSON e, em caso de
  erro, lança `ErroApi` com a mensagem que o backend devolveu. `erro.mensagemCompleta` junta os
  erros de cada campo, um por linha.
- Falha de rede vira *"Não foi possível conectar ao servidor. Verifique se a API está rodando."*
- `useRequisicao(buscar, dependencias)` executa a busca ao abrir a tela e de novo sempre que uma
  dependência muda (ex.: o filtro de situação). `recarregar()` força uma nova busca.

---

## Receita: criar a tela de passageiros

1. **Tipos** em `modules/estudante/types.ts`, iguais ao schema de resposta do backend.
2. **Service** em `modules/estudante/studentService.ts`, usando `requisitar`.
3. **Página** em `modules/estudante/StudentsPage.tsx`: `CabecalhoPagina` + `Cartao` com busca e
   tabela, `useRequisicao` para carregar. Use a tela de veículos como modelo.
4. **Formulário** em `modules/estudante/StudentForm.tsx`, com a classe `campo` nos inputs.
5. **Rota** em `App.tsx` e `pronto: true` no item *Passageiros* de `shared/layout/menu.ts`.
6. Confira a tela em largura de celular.

Para explorar visualmente antes de decidir, use a skill de protótipo do projeto
(`.claude/skills/prototipo/`): ela gera variações da tela trocadas por `?variante=` na URL.

---

## Comandos

```bash
npm run dev        # servidor de desenvolvimento (http://localhost:5173)
npm run build      # checa tipos e gera dist/
npm run typecheck  # só checa tipos
```
