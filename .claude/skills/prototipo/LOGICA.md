# Protótipo de lógica

Crie **um único arquivo HTML** que simula uma máquina de estados ou regra de negócio e deixa qualquer pessoa (inclusive quem não programa, como o dono da empresa de transporte) empurrar essa lógica por casos difíceis de pensar no papel.

Se a pergunta for sobre a aparência de uma tela, este é o caminho errado. Use [UI.md](UI.md).

## Quando este é o formato certo

- "O ciclo da viagem (`agendada → em_andamento → concluida / cancelada`) cobre o caso do motorista que esqueceu de iniciar?"
- "O que acontece com a chamada se o estudante avisa 'não vou' e depois desiste dentro do prazo?"
- "O prazo de 1h antes do horário previsto para o 'não vou' é justo em todos os sentidos (ida e volta)?"
- "Se o motorista do dia for substituído, quem aparece na chamada e no histórico?"
- Qualquer regra em que a equipe discorda "de cabeça" e ninguém consegue provar quem está certo.

## Onde fica e como abre

- Arquivo: `docs/prototipos/<assunto>.html` (ex.: `docs/prototipos/ciclo-viagem.html`).
- Abre com dois cliques, sem servidor, sem `npm install`. HTML + CSS + JavaScript puro no mesmo arquivo.
- Primeira linha visível da página: `PROTÓTIPO — descartável` e a pergunta que ele responde.
- Use as cores da paleta do UniVan (marinho #1B3C59, laranja #F2600C, fundo #F2F2F2) para não parecer outro sistema.

## Estrutura do arquivo

### 1. O modelo, em JavaScript puro, no topo

Escreva o estado e as transições como funções puras, espelhando os nomes do banco (`docs/univan-sqlite.sql`):

```js
// Estados vindos dos enums do banco: status_viagem e status_chamada.
const estadoInicial = () => ({
  agora: '2026-11-10T06:00',
  viagem: { status: 'agendada', horario_saida: null },
  chamadas: [
    { estudante: 'Ana', status: 'pendente', horario_previsto: '06:40' },
    { estudante: 'Bruno', status: 'pendente', horario_previsto: '06:55' },
  ],
})

// Cada ação recebe o estado e devolve { estado, mensagem }. Recusas explicam o motivo.
function iniciarViagem(estado) { /* ... */ }
function avisarNaoVou(estado, estudante) { /* regra do prazo de 1h, igual a avisar_nao_vou() */ }
function marcarPresente(estado, estudante) { /* ... */ }
function concluirViagem(estado) { /* pendentes viram ausente, igual a concluir_viagem() */ }
```

Se a regra já existe numa função do banco (`gerar_dia`, `avisar_nao_vou`, `concluir_viagem`), copie o comportamento dela fielmente. O protótipo serve para questionar a regra, não para reinventá-la por engano.

### 2. Aba "Livre"

- Um botão por ação (`Iniciar viagem`, `Ana avisa "não vou"`, `Marcar Bruno presente`, `Concluir viagem`, `Avançar relógio 30 min`).
- Botões de ações impossíveis no estado atual continuam clicáveis: a recusa (e o motivo) é informação valiosa.
- Botão **Recomeçar**.

### 3. Abas de roteiros guiados

Uma aba por cenário difícil, cada uma com passos numerados e um botão **Próximo passo**. Cada passo diz o que vai acontecer e o que se espera ver. Exemplos para o UniVan:

- "Aviso em cima da hora": estudante tenta avisar 'não vou' 50 min antes. Esperado: recusa.
- "Esqueceu de iniciar": motorista marca presença sem iniciar a viagem.
- "Ninguém marcado": viagem concluída com todos pendentes. Esperado: todos `ausente`.
- "Desistiu do não vou": aviso dado e depois desfeito dentro do prazo (regra que o banco ainda não tem).

Quando o resultado de um passo contrariar o esperado, destaque em vermelho: é exatamente isso que o protótipo procura.

### 4. Painel de estado sempre visível

Depois de **cada** ação, mostre o estado completo:

- Uma tabela legível (viagem + chamada por estudante, com status em etiquetas coloridas).
- O JSON bruto logo abaixo, para quem quiser conferir.
- Um histórico das ações (`06:00 Iniciar viagem → ok`, `06:10 Ana avisa "não vou" → recusado: faltam menos de 1h`).

## Regras

- **Sem dependências.** Nada de React, bundler ou CDN obrigatório. Precisa abrir offline.
- **Sem persistência.** Recarregar a página volta ao início; isso é desejável.
- **Sem acabamento.** Sem testes nem abstrações. Legibilidade do modelo é o que importa.
- **Português em tudo**: textos, nomes de funções e variáveis.

## Entregue e registre

1. Informe o caminho do arquivo e diga quais roteiros mais merecem atenção.
2. Quando a regra for decidida, registre o veredito (qual regra vale e por quê) na issue ou num commit.
3. Leve a regra validada para o código de verdade: um `*_servico.py` do módulo no backend ou uma função no banco, com testes.
4. Guarde o HTML no branch descartável (ex.: `prototipo/ciclo-viagem`), como descrito na [SKILL](SKILL.md). A `main` fica só com a regra validada.
