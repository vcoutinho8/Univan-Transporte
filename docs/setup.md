# Como subir o backend

Passo a passo para rodar a API do UniVan na sua máquina, até a primeira requisição.

> **Atalho:** na raiz do projeto (Git Bash, Linux ou macOS), rode na ordem:
>
> 1. `bash scripts/1-banco.sh`: cria o banco com 5 registros de exemplo por tabela
> 2. `bash scripts/2-backend.sh`: sobe a API (deixe o terminal aberto)
> 3. `bash scripts/3-frontend.sh`: sobe a interface, em outro terminal

## 1. Pré-requisitos

| Ferramenta | Versão | Como conferir |
|---|---|---|
| Python | 3.12 ou superior | `python --version` |

Só isso. O banco é **SQLite**, que já vem com o Python: não há servidor de banco para instalar.

## 2. Configurar o `.env`

Na raiz do projeto, copie o modelo:

```bash
cp .env.example .env
```

A linha do banco já vem pronta:

```text
DATABASE_URL=sqlite:///backend/univan.db
```

O caminho é relativo à raiz do projeto, então funciona não importa de qual pasta a API for
iniciada. O `.env` não vai para o git (está no `.gitignore`).

## 3. Criar o ambiente virtual e instalar as dependências

Só é preciso fazer uma vez (ou quando o `requirements.txt` mudar). Dentro da pasta `backend`:

| Terminal | Comandos |
|---|---|
| **Git Bash** | `python -m venv .venv` <br> `.venv/Scripts/python -m pip install -r requirements.txt` |
| **PowerShell** | `python -m venv .venv` <br> `.venv\Scripts\python -m pip install -r requirements.txt` |
| **CMD** | `python -m venv .venv` <br> `.venv\Scripts\python -m pip install -r requirements.txt` |
| **Linux / macOS** | `python3 -m venv .venv` <br> `.venv/bin/python -m pip install -r requirements.txt` |

## 4. Criar o banco

Na raiz do projeto:

```bash
bash scripts/1-banco.sh
```

Cria `backend/univan.db` com **5 registros de exemplo** por tabela. Só é preciso repetir para
voltar aos dados de exemplo (o script pergunta antes de apagar o banco que já existe).

> Sem o Git Bash? Se a API subir e o arquivo não existir, ela mesma cria o banco, com os dados de
> teste completos (10 por tabela). No terminal aparece
> `Banco ...\backend\univan.db não encontrado. Criando a partir de univan-sqlite.sql.`

## 5. Subir a API

Dentro da pasta `backend`:

| Terminal | Comando |
|---|---|
| **Git Bash** | `.venv/Scripts/python -m uvicorn app.main:app --reload` |
| **PowerShell** | `.venv\Scripts\python -m uvicorn app.main:app --reload` |
| **CMD** | `.venv\Scripts\python -m uvicorn app.main:app --reload` |
| **Linux / macOS** | `.venv/bin/python -m uvicorn app.main:app --reload` |

> **Atenção à barra.** O Git Bash (o terminal que mostra `MINGW64`) usa `/`. Com `\`, o caminho
> vira `.venvScriptspython` e aparece `command not found`. PowerShell e CMD usam `\`.

Se preferir ativar o ambiente virtual antes, depois disso basta digitar `uvicorn app.main:app --reload`:

| Terminal | Ativar |
|---|---|
| Git Bash | `source .venv/Scripts/activate` |
| PowerShell | `.venv\Scripts\Activate.ps1` |
| CMD | `.venv\Scripts\activate.bat` |
| Linux / macOS | `source .venv/bin/activate` |

Para parar o servidor: **Ctrl + C**.

## 6. Conferir se funcionou

| Endereço | Esperado |
|---|---|
| http://localhost:8000/api/saude | `{"api": "ok", "banco": "conectado"}` |
| http://localhost:8000/api/docs | Documentação interativa, onde dá para testar os endpoints |
| http://localhost:8000/api/veiculos | Lista dos veículos do banco de teste |

## 7. Rodar os testes

Dentro da pasta `backend` (os testes criam bancos temporários e não mexem no `univan.db`):

```bash
.venv/Scripts/python -m pytest      # Git Bash
.venv\Scripts\python -m pytest      # PowerShell / CMD
```

## Problemas comuns

| Sintoma | Causa | Solução |
|---|---|---|
| `bash: .venvScriptspython: command not found` | Barra invertida no Git Bash | Use `.venv/Scripts/python` |
| `Activate.ps1 não pode ser carregado... execução de scripts foi desabilitada` | Política do PowerShell | Rode uma vez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, ou chame `.venv\Scripts\python` direto, sem ativar |
| `did not find executable at 'C:\Users\<outro usuário>\...\python.exe'` | O `.venv` foi criado em outra máquina (ele guarda o caminho do Python de quem criou) | Apague a pasta `.venv` e refaça o passo 3. O `.venv` nunca deve ir para o git nem ser copiado entre PCs |
| `No module named uvicorn` / `No module named fastapi` | Dependências não instaladas, ou rodou com o Python global | Faça o passo 3 e use o Python de `.venv` |
| `No module named 'app'` | Comando rodado fora da pasta `backend` | `cd backend` e rode de novo |
| `/api/saude` mostra `"banco": "indisponível"` | A API não conectou no banco | Confira a `DATABASE_URL` no `.env` |
| `no such table: veiculo` | O `univan.db` existe, mas está vazio ou incompleto (ex.: criado por outro programa) | Pare a API e rode `bash scripts/1-banco.sh --sim` |
| `database is locked` | Outro programa (um visualizador de SQLite, por exemplo) está com o arquivo aberto gravando | Feche o outro programa |
| Quero os dados de exemplo de volta | O `univan.db` guarda tudo o que foi cadastrado | Pare a API e rode `bash scripts/1-banco.sh` |
| `DATABASE_URL inválida` ao subir a API | O `.env` aponta para outro banco (ex.: uma URL antiga do PostgreSQL) | Troque para `sqlite:///backend/univan.db` |
| `[Errno 10048]` / `address already in use` | Porta 8000 ocupada | Use `--port 8001` e ajuste `API_PROXY_TARGET` no `.env` |
| Mudei o `.env` e nada mudou | O `--reload` só observa o código | Pare (Ctrl + C) e suba de novo |
| Frontend mostra "Não foi possível conectar ao servidor" | API parada, ou porta/URL diferente | Suba a API, confira `API_PROXY_TARGET` e reinicie o `npm run dev` |

## Próximo passo: o frontend

Com a API no ar, em outro terminal, na raiz do projeto:

```bash
bash scripts/3-frontend.sh
```

(ou, à mão: `cd frontend`, `npm install` na primeira vez e `npm run dev`)

Acesse http://localhost:5173. Mais detalhes em [frontend.md](frontend.md).
