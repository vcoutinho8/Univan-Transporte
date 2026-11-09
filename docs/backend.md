# Backend

Python · FastAPI · SQLAlchemy 2 · Pydantic 2 · SQLite.

O backend é a **API REST** do UniVan: recebe pedidos do frontend em JSON, aplica as regras de
negócio, conversa com o banco e devolve JSON. Ele é dono do **Model** e do **Controller** do MVC
(veja a explicação completa em [architecture.md](architecture.md)).

Para rodar a API na sua máquina, veja [setup.md](setup.md).

---

## Estrutura

```text
backend/
├── app/
│   ├── main.py
│   ├── config/
│   │   ├── configuracoes.py
│   │   ├── banco.py
│   │   └── erros.py
│   ├── shared/
│   │   ├── base.py
│   │   └── enums.py
│   └── modules/
│       ├── __init__.py          registro de todos os models
│       ├── saude/               saude_controller.py
│       ├── painel/              painel_schema / _repositorio / _servico / _controller
│       ├── empresa/             empresa_model / _schema / _repositorio / _servico / _controller
│       ├── veiculo/             veiculo_model / _schema / _repositorio / _servico / _controller
│       ├── endereco/            endereco_model.py
│       ├── instituicao/         instituicao_model.py
│       ├── motorista/           motorista_model.py
│       ├── area/                area_model.py
│       ├── estudante/           estudante_model.py
│       ├── rota/                rota_model.py  (Rota e RotaDia)
│       ├── dia_sem_aula/        dia_sem_aula_model.py
│       ├── viagem/              viagem_model.py
│       ├── chamada/             chamada_model.py
│       └── financeiro/          titulo_receber_model.py, titulo_pagar_model.py
├── tests/
├── pytest.ini
└── requirements.txt
```

### Convenção de nomes

- **Pasta do módulo** = nome da tabela no banco (`veiculo`, `estudante`, `dia_sem_aula`).
- **Arquivo** = `<modulo>_<camada>.py`. O prefixo deixa óbvio de onde é o arquivo mesmo quando
  ele aparece sozinho numa aba do editor ou num erro.
- **Classes** em português: `ServicoVeiculo`, `RepositorioVeiculo`, `VeiculoCriacao`.
- Cada pasta tem um `__init__.py` com uma frase descrevendo o módulo.

---

## O que cada arquivo comum faz

### `app/main.py` — o ponto de partida

Cria a aplicação FastAPI (`criar_aplicacao()`), configura:

- a documentação interativa em `/api/docs`;
- o **CORS** (quais endereços de frontend podem chamar a API), lido do `.env`;
- os **tratadores de erro** de `config/erros.py`;
- a lista `CONTROLLERS`: cada controller expõe um `roteador`, incluído com o prefixo `/api`.

Também importa `app.modules`, o que **registra todos os models** antes de qualquer consulta.

### `app/config/configuracoes.py` — o `.env`

Classe `Configuracoes` (pydantic-settings) que lê o `.env` da raiz do monorepo. As variáveis de
ambiente ficam em inglês (`DATABASE_URL`), os atributos em português (`url_banco`).
`obter_configuracoes()` lê uma vez só e guarda em cache.

### `app/config/banco.py` — a conexão

Cria o `motor` (engine do SQLAlchemy) e a `FabricaSessao`. A função `obter_sessao()` é uma
**dependência do FastAPI**: abre uma sessão por requisição e fecha ao final, mesmo se der erro.

- `criar_motor(url)`: liga `PRAGMA foreign_keys = ON` em cada conexão (sem isso o SQLite não
  confere chaves estrangeiras) e libera o uso em várias threads. Recusa uma `DATABASE_URL` que
  não seja SQLite.
- `preparar_banco(url)`: chamada quando a API sobe (`ciclo_de_vida` em `main.py`). Se o arquivo
  do banco não existir, cria a partir de `docs/univan-sqlite.sql`. Se já existir, não faz nada.
- Para **recomeçar do zero** com os dados de exemplo, pare a API e rode `bash scripts/1-banco.sh`.

### `app/config/erros.py` — erros em português

- **Erros de negócio**: `ErroNegocio` (400) e as filhas `RecursoNaoEncontrado` (404),
  `ConflitoDeDados` (409) e `DadosInvalidos` (422). Os serviços lançam essas exceções com a
  mensagem pronta.
- **`MENSAGENS_RESTRICOES`**: tradução de cada restrição do banco (`veiculo_placa_key` →
  *"Já existe um veículo com esta placa."*). Se o banco recusar uma gravação, o usuário recebe a
  frase certa.
- **`nome_restricao(erro)`**: descobre qual restrição foi violada. O SQLite informa no texto
  (`CHECK constraint failed: veiculo_placa_check`) e, no caso de `UNIQUE`, só as colunas
  (`veiculo.placa`), traduzidas pelo mapa `RESTRICOES_UNIQUE_SQLITE`.
  Chave estrangeira inexistente vira *"Registro relacionado não encontrado."*
- **`MENSAGENS_VALIDACAO`**: tradução dos erros do Pydantic (`missing` → *"Campo obrigatório."*).
- **`registrar_tratadores_erro(app)`**: transforma tudo no formato padrão de resposta.

### `app/shared/base.py` — a base dos models

- `Base`: classe mãe de todos os models. Define o formato de data e hora gravado no SQLite
  (`06:30:00` e `2026-11-10 06:30:00`, sem microssegundos), igual ao dos dados e ao que as
  rotinas esperam.
- `enum_do_banco()`: liga um enum Python a uma coluna de texto que já tem `CHECK (... IN (...))`
  no banco, gravando o valor (`'ativo'`) e sem tentar criar nada.

### `app/shared/enums.py` — os enums do banco

`StatusCadastro`, `Turno`, `Sentido`, `StatusViagem`, `StatusChamada`, `StatusTitulo`,
`CategoriaTituloPagar`. Os valores são idênticos aos do `CREATE TYPE` do dump.

### `app/modules/__init__.py` — o registro

Importa todos os models. Isso é necessário porque os relacionamentos são declarados por nome
(`relationship("Empresa")`) e o SQLAlchemy só os resolve se todas as classes estiverem carregadas.

---

## As cinco camadas de um módulo, com o exemplo de `veiculo`

### 1. `veiculo_model.py` — Model (M do MVC)

```python
class Veiculo(Base):
    __tablename__ = "veiculo"
    id: Mapped[int] = mapped_column(primary_key=True)
    placa: Mapped[str] = mapped_column(String(7), unique=True)
    ...
    empresa: Mapped["Empresa"] = relationship()
```

Espelha a tabela, coluna por coluna. **Não crie campos que não existem no banco**: o teste
`test_modelos_iguais_ao_banco.py` compara cada model com os dois scripts do banco e falha se
houver diferença.

### 2. `veiculo_schema.py` — o formato do JSON

| Classe | Uso |
|---|---|
| `VeiculoCriacao` | Corpo do `POST`. Todos os campos obrigatórios; `extra="forbid"` recusa campos desconhecidos |
| `VeiculoAtualizacao` | Corpo do `PATCH`. Tudo opcional; só o que for enviado é alterado |
| `VeiculoResposta` | O que a API devolve, incluindo a empresa resumida |

Os validadores reproduzem as regras do banco com mensagens amigáveis. Exemplo:
`normalizar_placa("qja-1b23")` → `"QJA1B23"`, e `"AB12345"` → erro *"Placa inválida..."*.

### 3. `veiculo_repositorio.py` — acesso a dados

`RepositorioVeiculo(sessao)` com `listar(status, fk_empresa)`, `buscar_por_id`,
`buscar_por_placa` e `salvar`. Só SQL/ORM, nenhuma decisão.

### 4. `veiculo_servico.py` — regras de negócio

`ServicoVeiculo(repositorio, repositorio_empresa)`:

- `cadastrar`: confere se a empresa existe e se a placa está livre;
- `atualizar`: só altera o que veio, recusa apagar campo obrigatório (`{"modelo": null}`);
- `inativar`: muda o status para `inativo` (nada é apagado) e recusa inativar duas vezes.

### 5. `veiculo_controller.py` — Controller (C do MVC)

```python
roteador = APIRouter(prefix="/veiculos", tags=["Veículos"])

@roteador.post("", response_model=VeiculoResposta, status_code=201)
def cadastrar_veiculo(dados: VeiculoCriacao, servico: Servico):
    return servico.cadastrar(dados)
```

Cada função tem uma linha de lógica: receber, chamar o serviço, devolver. `obter_servico_veiculo`
monta o serviço com os repositórios (e é o ponto que os testes substituem).

---

## Os módulos, um a um

### `saude` — "a API está viva?"

`GET /api/saude` executa `SELECT 1` no banco e responde `{"api": "ok", "banco": "conectado"}`
ou `"indisponível"`. O painel usa isso para o indicador de conexão.

### `painel` — os números da tela inicial (RF5)

Módulo **sem tabela própria**: só lê as outras. `GET /api/painel/resumo?data=AAAA-MM-DD`
(padrão: hoje) devolve:

```json
{
  "data": "2026-11-09",
  "veiculos_ativos": 4,
  "motoristas_ativos": 3,
  "estudantes_ativos": 42,
  "rotas_ativas": 5,
  "estudantes_sem_area": 2,
  "viagens_hoje": { "agendada": 6, "em_andamento": 0, "concluida": 2, "cancelada": 0 }
}
```

- `RepositorioPainel` faz `SELECT count(*)` com filtro `status = 'ativo'` em cada tabela, e um
  `GROUP BY status` nas viagens do dia.
- `estudantes_sem_area` conta passageiros ativos cujo endereço não caiu em nenhuma área (o
  trigger do banco não conseguiu definir `fk_area`). É um **ponto de atenção** para o gestor.
- `ServicoPainel.resumo()` junta tudo e completa com zero as situações sem viagens.

### `empresa` — a transportadora

`GET /api/empresas` lista as empresas em ordem de razão social. Usado no seletor do formulário de
veículos. Cadastro/edição de empresa ainda não existe.

### `veiculo` — a frota (RF2)

CRUD completo. Ver a seção anterior.

### Módulos com só o model (próximos passos)

| Módulo | Tabela(s) | Para que vai servir |
|---|---|---|
| `estudante` | `estudante` | **Passageiros** (RF2): cadastro, edição, consulta e desativação. A área (`fk_area`) é definida pelo trigger do banco, nunca pela API |
| `motorista` | `motorista` | Cadastro de motoristas (RF2), com CPF e CNH únicos e veículo padrão |
| `endereco` | `endereco` | Endereços com latitude/longitude, base dos pontos de embarque no mapa (RF4/RF6) |
| `instituicao` | `instituicao` | Faculdades de destino |
| `area` | `area` | Regiões (polígonos) atendidas por cada motorista |
| `rota` | `rota`, `rota_dia` | Rotas (RF4): motorista + instituição + turno, horários e dias da semana |
| `dia_sem_aula` | `dia_sem_aula` | Feriados e recessos: `gerar_dia` não cria viagens nesses dias |
| `viagem` | `viagem` | Viagens do dia (RF3): gerar, iniciar, encerrar, substituir motorista/veículo |
| `chamada` | `chamada` | Presença/ausência de cada passageiro numa viagem (RF3) |
| `financeiro` | `titulo_receber`, `titulo_pagar` | Mensalidades e despesas. **Fora do escopo do MVP** |

---

## Endpoints atuais

| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/saude` | Situação da API e da conexão com o banco |
| GET | `/api/painel/resumo?data=` | Números do painel (padrão: hoje) |
| GET | `/api/empresas` | Lista empresas |
| GET | `/api/veiculos?status=&fk_empresa=` | Lista veículos (filtros opcionais) |
| GET | `/api/veiculos/{id}` | Busca um veículo |
| POST | `/api/veiculos` | Cadastra (placa normalizada: `qja-1b23` → `QJA1B23`) |
| PATCH | `/api/veiculos/{id}` | Altera só os campos enviados (também usado para reativar: `{"status": "ativo"}`) |
| DELETE | `/api/veiculos/{id}` | **Inativa** (não apaga) |

Documentação interativa, onde dá para testar cada endpoint: http://localhost:8000/api/docs

---

## Formato dos erros

| Situação | HTTP | Corpo |
|---|---|---|
| Validação de entrada | 422 | `{"mensagem": "Dados inválidos.", "erros": [{"campo": "placa", "mensagem": "..."}]}` |
| Regra de negócio | 400/409/422 | `{"mensagem": "Já existe um veículo com esta placa."}` |
| Não encontrado | 404 | `{"mensagem": "Veículo não encontrado."}` |
| Restrição do banco | 409 | Mensagem de `MENSAGENS_RESTRICOES` |
| Banco fora do ar | 503 | `{"mensagem": "Banco de dados indisponível..."}` |

Nos serviços, lance `RecursoNaoEncontrado`, `ConflitoDeDados` ou `DadosInvalidos` com a mensagem
já em português. Nos schemas, `raise ValueError("...")` dentro de um `field_validator` vira a
mensagem do campo.

---

## Receita: criar o módulo de passageiros (`estudante`)

1. **Model**: já existe em `modules/estudante/estudante_model.py`. Não acrescente campos.
2. **Schema** `estudante_schema.py`: `EstudanteCriacao`, `EstudanteAtualizacao`,
   `EstudanteResposta`. Reproduza os CHECK do banco: CPF com 11 números, `dia_vencimento` de
   1 a 28, `valor_mensal` não negativo. **Não aceite `fk_area`** na criação.
3. **Repositório** `estudante_repositorio.py`: `RepositorioEstudante(sessao)` com `listar`
   (filtros por status, instituição, turno, busca por nome), `buscar_por_id`, `buscar_por_cpf`,
   `salvar`.
4. **Serviço** `estudante_servico.py`: `ServicoEstudante(...)` com as regras (CPF único,
   instituição existente, inativar sem apagar).
5. **Controller** `estudante_controller.py`: `roteador = APIRouter(prefix="/estudantes",
   tags=["Passageiros"])` e `obter_servico_estudante`.
6. **Registre** o controller na tupla `CONTROLLERS` de `main.py`.
7. **Teste** em `tests/test_estudantes.py`, com repositórios falsos (copie o padrão de
   `test_veiculos.py`).
8. Atualize esta página e [tarefas.md](tarefas.md).

Lembretes do domínio:

- Para rotinas que já existem no banco, **chame a função SQL** no repositório em vez de
  reescrever em Python: `sessao.scalar(text("SELECT avisar_nao_vou(:e, :d, :s)"), {...})`.
- Use `joinedload` para trazer relacionamentos que a resposta vai exibir (evita N+1 consultas, RNF5).

---

## Testes

```bash
cd backend
.venv/Scripts/python -m pytest      # Git Bash
.venv\Scripts\python -m pytest      # PowerShell / CMD
```

| Arquivo | O que garante |
|---|---|
| `test_modelos_iguais_ao_banco.py` | Models, colunas e enums idênticos ao `univan-sqlite.sql` |
| `test_banco_sqlite.py` | API de ponta a ponta com um SQLite real (criado numa pasta temporária): criação do banco, veículos, painel, trigger da área, formato dos horários e mensagens das restrições |
| `test_veiculos.py` | Cadastro, validações em português, placa duplicada, edição e inativação de veículos |
| `test_painel.py` | Formato do resumo do painel e uso da data de hoje como padrão |

Nenhum teste precisa de banco instalado: `test_veiculos.py` e `test_painel.py` usam repositórios
em memória (via `app.dependency_overrides`), e `test_banco_sqlite.py` cria um arquivo SQLite
temporário a cada teste, sem tocar no `backend/univan.db`.
