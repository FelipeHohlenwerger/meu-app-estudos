# Contexto e próximas tarefas — App de Estudo Pessoal

> Gerado a partir de uma conversa longa de design/planejamento. Complementa (não substitui) o `resumo-tecnico-projeto.md` original — aquele cobre o que já estava implementado até os callouts; este cobre tudo decidido depois disso.

## Como eu (Claude) devo me comportar nesta continuação

- A pessoa **não é programadora**. Não assumir familiaridade com termos técnicos.
- Ela desenvolve com o **Claude Code** (extensão VS Code) para execução, e usa um chat normal (aqui) para decisões de design/gosto antes de mandar pro Claude Code.
- Quando ela pedir "texto para o Claude Code", entregar um **texto descritivo em português, sem diffs de código** — comportamento esperado, não implementação linha a linha (ela mesma vai colar isso no painel do Claude Code).
- Decisões de visual/UX devem ser **mostradas** (mockup) antes de virarem texto final — ela reage melhor a ver do que a descrição em prosa.
- Ela pediu explicitamente: sempre que um plano do Claude Code vier técnico demais, traduzir para português simples antes de qualquer decisão.

## Stack e estrutura (do resumo original — ainda válido)

Next.js 16 (App Router, TS, Tailwind), CodeMirror 6 via `@uiw/react-codemirror`, Node 24 via nvm, arquivos `.md` como fonte da verdade (sem banco, exceto o índice SQLite descrito abaixo), Manjaro Cinnamon, VS Code + extensão Claude Code.

## O que já foi implementado e confirmado funcionando

- **Callout visual**: `Decoration.line` (não mais `Decoration.mark`), estilo "contorno completo" (Opção B): borda 1.5px colorida por tipo, sem fundo colorido, cantos arredondados só na 1ª/última linha do bloco.
- **Ícone por tipo de callout** (`calloutLabelWidget`, todos outline/stroke, cor = `calloutColors[tipo]`):
  - sintese → clipboard-list · importante → flame · duvidas → question-mark · referencias → book-open · exemplos → list · citacoes → quote
- **Tema escuro do app inteiro** — tokens em `globals.css` (`--background #1b1c1f`, `--foreground #e7e7ea`, `--panel-bg #232427`, `--panel-hover #2f3033`, `--panel-border #3a3b3f`, `--text-muted #9a9ba1`), aplicado em `page.tsx`, `CommentModal.tsx`, `HighlightMenu.tsx`, e `basicDark` no CodeMirror.
- **Correção de contraste do highlight de fundo** (`highlightMarkFor` em `livePreview.ts`) — texto forçado escuro (`#1a1a1a`) dentro da marcação, pra não ficar claro-sobre-claro com o editor escuro.

⚠️ **Não confirmado se já foi testado**: o fix de contraste acima, e se o bug de header/sidebar branco (causa provável: `layout.tsx` sobrescrevendo o fundo) foi resolvido.

## 🔄 Em andamento

**Inserção de callout via slash command** — plano já gerado pelo Claude Code (modo Plan): digitar `/callout` numa linha vazia abre popup inline (↑↓+Enter, ou clique), `Ctrl+Shift+C` insere o último tipo usado, botão da toolbar vira um atalho que digita `/callout` por você. Falta aprovar/executar o plano.

## Decisões de design fechadas (ainda não implementadas)

### Tags (não "Categorias" — nome escolhido de propósito, ver justificativa abaixo)
- Sintaxe inline no corpo da nota: `#nome-da-tag`
- Botão "Tags" na toolbar, mesmo padrão visual do botão "💬 Comentários" existente (toggle, com × pra fechar no mesmo estilo)
- Painel mostra: lista de tags ordenada por frequência (mais usada → menos usada), cada linha com barra horizontal proporcional + contagem; separado embaixo, "Sem categoria" com a contagem de notas sem nenhuma tag
- Clicar numa tag filtra a sidebar de notas por aquela tag e fecha o painel
- Cor das barras: uma cor de destaque única (não uma por tag) — decisão de v1 simplificada
- Por que "Tags" e não "Categorias": consistência com a sintaxe `#tag` que a pessoa digita; "Categorias" era um termo guarda-chuva do resumo original, agora que o modelo é confirmadamente multi-valorado (uma nota pode ter várias), "Tags" comunica isso melhor

### Índice SQLite (base para tags, links e grafo)
- Cache, não fonte da verdade (os `.md` continuam sendo) — reconstruído nota a nota ao salvar (`POST /api/note`), varredura completa só na primeira vez / se desatualizado
- Guarda por nota: tags, aliases, links de saída, e (depois da fase de blocos) os `^id` de bloco encontrados com sua posição
- O painel de Tags deve ler a contagem daqui, não reprocessando arquivos toda vez que abre

### Links bidirecionais `[[nota]]`
- Sintaxe Obsidian-padrão, com autocomplete ao digitar `[[`
- **Aliases**: uma nota pode ter apelidos declarados no topo do arquivo (`aliases: nome1, nome2`); um link resolve por qualquer alias
- **Unlinked mentions**: seção separada (colapsável) listando onde o título/alias da nota aparece como texto solto em outras notas, com botão pra converter em link de verdade naquele ponto exato
- **Backlinks**: mostrar **só o nome da nota** que linka (decisão explícita — sem trecho de contexto)
- **Link quebrado**: nome sem nota correspondente → estilo de aviso no editor, clique oferece criar a nota

### Graph View
- Constrói a partir do índice — nunca reprocessa os `.md` a cada render
- **Dois controles independentes, cada um com toggle**: escopo (`local` = nota atual + vizinhos vs `global` = vault inteiro) e layout (`força-livre` simulação física vs `radial` nota central + círculos concêntricos por distância)
- Um único componente de desenho parametrizado por `layoutMode` + `escopo` — não duplicar em dois componentes
- Nós coloridos pela tag principal da nota (primeira tag se houver mais de uma); legenda lateral clicável isola visualmente (esmaece o resto, não esconde)

### Blocos / transclusão
- Marcar parágrafo: `^algum-id` digitado manualmente no final do parágrafo (geração automática de ID fica pra uma fase futura, não v1)
- `[[nota#^id]]` = **link** (abre e rola até o bloco) · `![[nota#^id]]` = **embute** o conteúdo aqui
- Embed é **somente leitura** — decisão importante, evita ter que sincronizar edição em tempo real entre dois arquivos. Editar exige clicar no rodapé e ir até a nota original
- Visual do embed: mesmo card de contorno do callout Opção B, com legenda "bloco embutido" (ícone de aspas) no topo e rodapé com ícone de link externo + nome da nota de origem
- Bloco não encontrado (`^id` apagado/renomeado): mesmo tratamento visual de link quebrado; texto "bloco não encontrado" no lugar do conteúdo, rodapé mantém link pra nota se ela ainda existir

### Metadados — filosofia geral
Regra usada nesta conversa pra decidir o que vale a pena: **metadado só compensa se alguma tela realmente lê ele de volta.**
- **Automáticos** (sempre valem, sem custo de manutenção): data de criação/edição, contagem de palavras/tempo de leitura, contagem de backlinks, contagem de highlights/comentários
- **Manual único adicionado**: **status de estudo** (não iniciado / lendo / revisado / dominado) — só porque alimenta diretamente o Dashboard e a Homepage abaixo
- Explicitamente descartados por enquanto: prioridade, dificuldade, avaliação em estrelas, data de próxima revisão (a menos que decida investir em repetição espaçada)

### Dashboard de progresso
- Vira uma **seção dentro da Homepage** (não uma tela separada — decisão tomada depois de ver o vídeo de referência)
- Conteúdo: métricas gerais (total de notas, palavras, tags, sem categoria) + distribuição dos 4 status de estudo + notas mais conectadas (via índice de links) + editadas recentemente

## 🎯 PRÓXIMA TAREFA — Homepage editorial (pronta pra implementar)

Essa é a tarefa que ficou pendente quando o limite de mensagens acabou. Texto completo, já revisado e aprovado pela pessoa, pronto pra colar no Claude Code:

---

Quero transformar a tela inicial do app numa página editorial de biblioteca, no lugar da lista simples de notas que existe hoje.

**Tipografia**
Importar a fonte **Fraunces** do Google Fonts, usada só nos títulos desta página (o `h1` "Sua biblioteca" e os títulos de cada seção de tema). O resto da página e do app continuam na fonte sans que já existe.

**Estrutura da página**
1. `h1` "Sua biblioteca" na fonte serifada, com uma linha pequena e discreta abaixo (cor `var(--text-muted)`) mostrando o total de notas e de temas (ex: "14 notas em 3 temas").
2. Seção "Progresso": título também na fonte serifada. Abaixo, os 4 status de estudo lado a lado, cada um mostrando o número (grande, fonte sans normal) e o rótulo (pequeno, `var(--text-muted)`) — sem fundo, sem card. Ao lado do rótulo de cada status, um pontinho colorido pequeno (6px, `border-radius: 50%`): não iniciado = `#9a9ba1`, lendo = `#2f7fd6`, revisado = `#d4af00`, dominado = `#2e9e4e`.
3. Uma seção por tag, ordenada da tag com mais notas pra menos. Cada seção: título serifado com o nome da tag + contagem de notas ao lado em texto pequeno (`var(--text-muted)`). Abaixo, uma grade de cards das notas daquele tema, 2 por linha nesta primeira versão — se houver mais de 2, o último espaço da grade vira um card "+ N outras" (cor de texto `#2f7fd6`, o accent) que abre a lista completa daquele tema ao clicar.
4. Seção final "Sem categoria", mesmo formato, para notas sem tag.
5. Linhas finas (`border-top: 0.5px solid var(--panel-border)`) separam cada seção verticalmente.

**Cada card de nota mostra**
- Título da nota, negrito, fonte sans (não serifada — a serifa é só pros títulos de seção)
- Um resumo de uma linha, gerado automaticamente a partir da primeira linha de texto real do corpo da nota (pulando o H1, se houver), cortado em ~80 caracteres — nenhum campo manual novo
- Uma linha pequena de metadado (`var(--text-muted)`): status de estudo atual + tempo estimado de leitura, calculado pela contagem de palavras

Cards têm borda fina (`1px solid var(--panel-border)`, `border-radius: var(--radius)`), sem preenchimento de cor. Clicar em qualquer card abre a nota no editor normalmente.

**Sem cor de tag nesta tela** — nenhum fundo colorido ou badge por tema. A única cor de destaque usada na página inteira é o azul `#2f7fd6` (já usado em links e no callout "referencias" do app), aplicado só no hover dos cards e no link "+ N outras". Os pontinhos de status são a única outra cor, e são propositalmente pequenos e discretos.

---

## Backlog original ainda não iniciado (do resumo técnico original)

10. Extração PDF/EPUB (lado Python, venv já criado)
11. Anotação em PDF escaneado
12. IA: resumir/explicar via Claude API
13. Exportações (por cor, por comentário, criar nota a partir de marcações)

## Dívida técnica conhecida (não resolvida)

Paleta de cores duplicada entre `livePreview.ts` e `page.tsx` — mencionada desde o resumo original, confirmada ainda presente pelo plano do Claude Code do slash command. Candidata a unificar em `src/lib/colors.ts` quando fizer sentido.
