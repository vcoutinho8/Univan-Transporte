# Protótipo de UI

Gere **várias variações de interface radicalmente diferentes** numa mesma rota, trocadas por uma barra flutuante no rodapé. O usuário alterna entre as variantes no navegador, escolhe uma (ou junta pedaços de cada) e descarta o resto.

Se a pergunta for sobre lógica/estado e não sobre aparência, este é o caminho errado. Use [LOGICA.md](LOGICA.md).

## Quando este é o formato certo

- "Como deveria ficar a tela de chamada do motorista?"
- "Quero ver algumas opções para o painel antes de decidir."
- "Tenta outro layout para a lista de passageiros."
- Sempre que o usuário fosse passar um dia escolhendo entre três rascunhos vagos na cabeça.

## Dois sub-formatos: prefira muito o A

Um protótipo de UI é bem mais fácil de avaliar quando está **encostado no resto do sistema**: menu lateral de verdade, barra superior de verdade, dados de verdade, densidade de verdade. Uma rota solta no vazio engana: toda variante parece boa isolada. Use o sub-formato A sempre que houver uma página existente plausível para hospedar as variantes. Só use o B se o protótipo realmente não tiver onde morar.

### Sub-formato A: ajuste numa página existente (preferido)

A rota já existe (ex.: `/veiculos`, `/`). As variantes são renderizadas **na mesma rota**, escolhidas pelo parâmetro `?variante=` da URL. A busca de dados (`useRequisicao`, services do módulo) continua igual; só a renderização muda. Este é o padrão.

Se o protótipo for de algo que ainda não tem página, mas que *naturalmente moraria dentro de uma* (um novo cartão no painel, uma nova coluna na tabela de veículos, um novo passo num fluxo), ainda é sub-formato A: monte as variantes dentro da página hospedeira.

### Sub-formato B: página nova (último recurso)

Só quando a coisa realmente não tem página para morar (ex.: uma tela nova de nível superior, como a chamada do motorista no celular, ou um fluxo que não cabe em lugar nenhum).

Crie uma **rota descartável** seguindo a convenção do projeto: registre em `src/App.tsx`, dentro do `LayoutPrincipal`, com `prototipo` no caminho (ex.: `/prototipo/chamada`). O componente fica em `src/modules/<modulo>/prototipo/`. Mesmo esquema de `?variante=`.

Antes de partir para o B, confira: não existe mesmo nenhuma página onde isso caiba? Uma rota vazia esconde problemas de design que uma página cheia revelaria.

Nos dois sub-formatos a barra flutuante é idêntica.

## Processo

### 1. Escreva a pergunta e escolha N

Padrão: **3 variantes**. Mais de 5 deixa de ser radicalmente diferente e vira ruído; esse é o limite.

Escreva o plano em uma linha, num comentário no topo do arquivo do protótipo:

> "Três variantes da tela de veículos, trocadas por `?variante=`, na rota existente `/veiculos`."

Isso funciona com ou sem o usuário por perto para contestar.

### 2. Gere variantes radicalmente diferentes

Rascunhe cada variante respeitando:

- O propósito da página e os dados disponíveis (os tipos em `modules/<modulo>/types.ts`).
- O sistema de estilos do projeto: Tailwind CSS 4 com os tokens da paleta (`bg-laranja`, `text-marinho`, `bg-fundo`...) e os componentes de `shared/components/`.
- Um nome claro para o componente exportado: `VarianteA`, `VarianteB`, `VarianteC`, cada um com um nome legível (ex.: `'Tabela compacta'`).

As variantes precisam ser **estruturalmente diferentes**: layout diferente, hierarquia de informação diferente, ação principal diferente; não só cores diferentes. Três grades de cartões levemente ajustadas não são protótipo, são papel de parede. Ideias de eixos que costumam render variantes reais num painel administrativo:

- **Tabela densa** (muitas linhas, ações na linha) × **cartões** (um por item, foco no status) × **mestre-detalhe** (lista à esquerda, detalhe à direita).
- **Indicadores no topo** × **linha do tempo do dia** × **mapa como elemento principal**.
- **Formulário em página** × **gaveta lateral** × **edição direto na linha da tabela**.

Se dois rascunhos saírem parecidos demais, refaça um com uma orientação explícita do tipo "não use grade de cartões".

### 3. Ligue tudo

Crie um único componente trocador na rota:

```tsx
// src/modules/veiculo/prototipo/VariantesVeiculos.tsx
// PROTÓTIPO: três variantes da tela de veículos, trocadas por ?variante=, na rota /veiculos.
import { useSearchParams } from 'react-router-dom'

const VARIANTES = { A: VarianteA, B: VarianteB, C: VarianteC }

export default function VariantesVeiculos(props: DadosTela) {
  const [parametros] = useSearchParams()
  const chave = (parametros.get('variante') ?? 'A') as keyof typeof VARIANTES
  const Variante = VARIANTES[chave] ?? VarianteA
  return (
    <>
      <Variante {...props} />
      <TrocadorVariantes variantes={['A', 'B', 'C']} atual={chave} />
    </>
  )
}
```

No sub-formato A: mantenha toda a busca de dados na página existente, acima do trocador; só a árvore renderizada muda por variante.

No sub-formato B: a rota descartável `/prototipo/<nome>` monta o mesmo trocador.

### 4. Construa a barra flutuante

Uma barra pequena, fixa no rodapé, centralizada, com três partes:

- **Seta esquerda**: vai para a variante anterior (dá a volta no fim).
- **Rótulo da variante**: mostra a chave atual e, se houver, o nome. Ex.: `B (Mestre-detalhe)`.
- **Seta direita**: vai para a próxima (dá a volta).

Comportamento:

- Clicar numa seta atualiza o parâmetro da URL com o roteador do projeto (`setSearchParams({ variante }, { replace: true })` do React Router), para a variante poder ser compartilhada e sobreviver ao recarregar.
- Teclado: `←` e `→` também alternam. Não intercepte as setas quando um `<input>`, `<textarea>`, `<select>` ou `[contenteditable]` estiver em foco.
- Visualmente distinta da página (ex.: pílula `bg-marinho-escuro text-white` com sombra) para ficar óbvio que não faz parte do design avaliado.
- Escondida em produção: só renderize se `import.meta.env.DEV` for verdadeiro (é o equivalente do Vite ao `NODE_ENV !== 'production'`), para que um merge acidental não mostre a barra aos usuários.

Coloque a barra num único componente compartilhado, `src/shared/components/PrototypeSwitcher.tsx` (exportando `TrocadorVariantes`), para os dois sub-formatos reaproveitarem.

### 5. Entregue

Informe a URL e as chaves `?variante=` (ex.: `http://localhost:5173/veiculos?variante=B`). O usuário vai alternar quando puder. O retorno mais interessante costuma ser **"quero o cabeçalho da B com a tabela da C"**, que é o design que ele realmente quer.

### 6. Registre a resposta e limpe

Quando uma variante vencer, registre a resposta (qual variante e por quê) e guarde o protótipo como descrito na [SKILL](SKILL.md). Leve a vencedora para o código de verdade e mova o resto para o branch descartável, não para a `main`:

- **Sub-formato A**: incorpore a vencedora na página existente; tire da `main` as variantes perdedoras e o trocador.
- **Sub-formato B**: promova a vencedora a uma rota de verdade (e marque `pronto: true` no `shared/layout/menu.ts`, se for item do menu); tire da `main` a rota descartável e o trocador.

O conjunto completo de variantes é a fonte primária, então vai para o branch descartável, não para o lixo. Componentes de variante e trocador deixados na `main` apodrecem rápido e confundem quem vier depois.

## Anti-padrões

- **Variantes que só mudam cor ou texto.** Isso é ajuste, não protótipo. Variantes de verdade discordam na estrutura.
- **Compartilhar código demais entre variantes.** Usar o `Cartao` ou o `Botao` de `shared/` é ok; um "layout" compartilhado entre variantes derrota o propósito. Cada variante deve poder jogar o layout fora.
- **Ligar variantes a gravações reais.** Protótipo só de leitura é ok. Se uma variante precisar gravar, aponte para um stub em memória: a pergunta é "como deve ficar", não "o backend funciona".
- **Promover o protótipo direto para produção.** O código das variantes foi escrito sob as regras de protótipo (sem testes, tratamento de erro mínimo). Reescreva direito ao incorporar.
