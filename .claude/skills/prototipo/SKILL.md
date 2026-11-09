---
name: prototipo
description: Cria um protótipo descartável para responder a uma dúvida de design no UniVan. Use quando quiserem conferir se uma lógica ou modelo de estados faz sentido (ex.: ciclo de vida da viagem e da chamada) ou explorar como uma tela do painel administrativo deveria ficar.
---

# Protótipo

Um protótipo é **código descartável que responde a uma pergunta**. A pergunta define o formato.

## Escolha o caminho

Identifique qual pergunta está sendo respondida, usando o pedido do usuário, o código ao redor ou perguntando, se o usuário estiver disponível:

- **"Essa lógica / esse modelo de estados faz sentido?"** → [LOGICA.md](LOGICA.md). Crie um único arquivo HTML compartilhável (botões livres + roteiros guiados em abas) que leve a máquina de estados por casos difíceis de pensar no papel, e que uma pessoa não desenvolvedora consiga usar. Exemplos no UniVan: `agendada → em_andamento → concluida` da viagem, `pendente → nao_vai / presente / ausente` da chamada, o prazo de 1h do "não vou".
- **"Como essa tela deveria ficar?"** → [UI.md](UI.md). Gere várias variações de interface radicalmente diferentes numa mesma rota, trocadas por um parâmetro na URL (`?variante=`) e por uma barra flutuante no rodapé.

Os dois caminhos produzem artefatos muito diferentes; errar aqui desperdiça o protótipo inteiro. Se a pergunta for ambígua e o usuário não estiver disponível, escolha pelo código ao redor (um módulo do backend → lógica; uma página ou componente do frontend → UI) e registre a suposição no topo do protótipo.

## Regras que valem para os dois

1. **Descartável desde o primeiro dia, e marcado como tal.** Coloque o protótipo perto de onde ele será usado (ao lado do módulo ou da página que ele explora), mas com um nome que deixe claro que é protótipo, não produção. No UniVan:
   - UI: `frontend/src/modules/<modulo>/prototipo/` (ex.: `modules/veiculo/prototipo/VariantesVeiculos.tsx`).
   - Lógica: `docs/prototipos/<assunto>.html` (ex.: `docs/prototipos/ciclo-viagem.html`).
   Respeite a convenção de rotas existente (React Router em `src/App.tsx`); não invente uma estrutura nova.
2. **Fácil de rodar.** Protótipo de UI abre com o comando que já existe (`npm run dev` na pasta `frontend`). Protótipo de lógica é um único HTML que se abre com dois cliques. Nada de passos extras.
3. **Sem persistência por padrão.** O estado vive em memória. Persistência é o que o protótipo está _testando_, não algo do qual ele depende. Se a pergunta envolver o banco de propósito, use um banco de rascunho com nome óbvio (ex.: `univan_prototipo_apagar`), nunca o banco `univan`.
4. **Sem acabamento.** Sem testes, sem tratamento de erro além do necessário para rodar, sem abstrações. O objetivo é aprender rápido.
5. **Mostre o estado.** Depois de cada ação (lógica) ou a cada troca de variante (UI), exiba o estado relevante completo para o usuário ver o que mudou.
6. **Registre quando terminar.** Leve a decisão validada para o código de verdade e guarde o protótipo como **fonte primária**: faça commit dele num branch descartável (ex.: `prototipo/painel-variantes`), fora da `main`, e deixe um ponteiro para esse branch na issue de implementação. Registre também a resposta (o veredito e a pergunta que ele resolveu) na issue ou num commit. A `main` fica só com a decisão validada.

## Padrões do UniVan que os protótipos devem seguir

O UniVan é um **sistema de gestão administrativa**. Mesmo descartável, o protótipo deve parecer parte dele, senão a comparação engana:

- **Paleta** (tokens em `frontend/src/styles/index.css`): `marinho` #1B3C59 (marca, títulos), `marinho-escuro` #102D40 (texto), `laranja` #F2600C (ação principal, item ativo do menu), `laranja-claro` #FE6F07 (hover), `fundo` #F2F2F2 (fundo das telas). Verde/âmbar/vermelho só para situação (ativo, atenção, erro).
- **Estrutura de painel administrativo**: menu lateral à esquerda, barra superior, conteúdo em cartões brancos arredondados (`Cartao`), indicadores com número grande e ícone (`CartaoIndicador`), tabelas dentro de cartões com busca e filtro no topo.
- **Componentes prontos** em `frontend/src/shared/components/` (Botao, Alerta, Cartao, CartaoIndicador, EtiquetaStatus, Icone). Use-os em vez de recriar.
- **Tudo em português** na tela, e nomes de componentes/variáveis em português (`VarianteA`, `TrocadorVariantes`).
- **Responsivo**: confira cada variante em largura de celular; motorista usa o sistema no telefone (RNF1/RNF2).
