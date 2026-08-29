# Manual do Usuário — Meu App de Estudos

Este é um guia de uso pessoal: como usar o app no dia a dia, não como o código funciona por dentro. Reflete exatamente o que está implementado e funcionando hoje — nada de recursos planejados ou "quase prontos".

---

## 1. Visão geral

O app é um substituto pessoal e local do Obsidian, com três coisas a mais integradas:

- Editor de Markdown com **Live Preview** (formatação renderizada enquanto você digita, sem precisar alternar entre "editar" e "visualizar").
- Um sistema de **fichamento ativo**: destaques coloridos, comentários tipados e callouts por cima do texto puro, tanto em notas comuns quanto em PDF/EPUB.
- Leitor de **PDF e EPUB** com posição de leitura salva automaticamente, seleção de texto, tradução e (no EPUB) ações de IA por trecho selecionado.
- Integração com uma **biblioteca Calibre** existente (somente leitura da biblioteca em si — o app nunca move nem edita os arquivos do Calibre).
- IA opcional (Gemini): resumir/explicar/gerar perguntas a partir de um trecho selecionado, e um chat por nota.

Tudo roda local — os arquivos `.md`/`.pdf`/`.epub` dentro de uma pasta ("vault") são a fonte de verdade, sem banco de dados de conteúdo. Web (`npm run dev`) e a versão desktop (AppImage, via Tauri) são o mesmíssimo app.

---

## 2. Vaults (bibliotecas de notas)

Um **vault** é só uma pasta com notas/PDFs/EPUBs. O nome do vault ativo aparece no topo, ao lado de "Minha Biblioteca" — clique nele para abrir o menu de vaults.

- **Trocar de vault**: clique no nome de outro vault na lista.
- **Criar um vault novo**: "+ Novo vault" → digite um nome. No app web, isso cria uma pasta nova em `~/vaults/<nome>` automaticamente (o navegador não permite escolher uma pasta existente). Na versão desktop, um botão extra "Escolher pasta existente…" abre o seletor nativo do sistema e registra uma pasta já existente, sem mover nem criar nada.
- **Renomear um vault**: ícone de lápis ao lado do nome. Atenção: isso só muda o nome de exibição, não renomeia a pasta no disco.
- **Remover um vault da lista**: ícone de lixeira, com confirmação. As notas na pasta **não são apagadas** — o vault pode ser re-registrado depois apontando pra mesma pasta.

Um vault pré-existente (`~/projetos/vault-notas`) é registrado automaticamente como "Principal" na primeira vez que o app roda.

---

## 3. Abrindo e importando conteúdo

O botão **"+"** no topo abre um menu com três opções:

1. **Nota em branco** — cria uma nota nova chamada "Sem título" e já foca no campo de título pra renomear.
2. **Importar PDF/EPUB** — abre o seletor de arquivo do sistema e copia o arquivo escolhido pro vault atual.
3. **Importar da web** — cole uma URL de um artigo; o app baixa a página, extrai o conteúdo principal (ignorando menu/propaganda/rodapé) e converte pra Markdown, criando uma nota nova. Essa nota recebe uma linha `fonte: <url>` no topo, que faz o app tratá-la como "livro" pra fins de progresso de leitura, mesmo sendo um `.md`. Imagens do artigo **não são baixadas** — ficam linkadas na URL original. Se a página não tiver conteúdo extraível (sites que renderizam tudo via JavaScript, por exemplo), a importação falha com uma mensagem clara em vez de criar uma nota vazia.

Livros do Calibre não precisam ser "importados" — aparecem direto na aba/página Calibre (ver seção 12), lidos direto da biblioteca Calibre configurada.

---

## 4. Escrevendo notas (Markdown com Live Preview)

Notas comuns são arquivos `.md` editados com formatação já renderizada:

- **Negrito** (`**texto**`) e *itálico* (`*texto*`): a marcação `**`/`*` fica escondida — só aparece se o cursor estiver em cima do trecho, pra editar.
- **Títulos** (`#` a `######`): mesmo comportamento — marcação escondida, revelada só com o cursor em cima.
- **Listas com marcador** (`-`, `*`, `+`), incluindo aninhadas. `Tab`/`Shift+Tab` num item de lista indenta/desindenta.
- **Checkboxes** (`- [ ]` / `- [x]`): sempre clicáveis, viram uma caixinha marcável.
- **Blocos de código** (` ```linguagem `): syntax highlighting automático pra qualquer linguagem reconhecida.
- **Diagramas Mermaid**: um bloco de código com linguagem `mermaid` renderiza como diagrama de verdade, não como texto.
- **Notas de rodapé** (`[^id]`) e **timestamps de vídeo clicáveis** (`mm:ss` ou `h:mm:ss`, em contexto de vídeo).

### Links entre notas (wikilinks)

- `[[Título da Nota]]` cria um link. Digitar `[[` abre um autocomplete com sugestões.
- Link pra uma nota que ainda não existe aparece "fantasma" (esmaecido, sem sublinhado) — clicar oferece criar a nota.
- `[[Nota#p42]]` — link pra uma **página específica de um PDF**. Clicar abre o PDF já naquela página.
- `[[Nota#cap3]]` — link pro **capítulo 3 de um EPUB** (numeração pela ordem real dos capítulos do livro).
- `[[Nota#^id]]` ou `![[Nota#^id]]` — referência/embed de um bloco específico marcado com `^id` no fim de um parágrafo.

Esses links de página/capítulo são exatamente o que os botões "Copiar link desta página/deste capítulo" produzem (seção 9/10) — cole em qualquer nota e o link já sai funcional.

---

## 5. Destaques, sublinhados e comentários

Só disponível em **notas comuns** (`.md`) — PDF e EPUB não têm essa camada de marcação por trecho de texto (eles têm seleção+tradução+IA, ver seção 11).

1. Selecione um trecho de texto na nota.
2. Um menu flutuante aparece com três abas: **Destaque** (fundo colorido), **Sublinhado**, **Comentar**.
3. **Destaque**: 6 cores/tipos — conceito (amarelo), dúvidas (vermelho claro), referências (azul claro), exemplo (laranja claro), ação (cinza), opinião do autor (roxo claro).
4. **Sublinhado**: os mesmos 6 tipos, mais preto e azul (que só existem como sublinhado, sem versão de fundo).
5. **Comentar**: escolhe um tipo (os mesmos 6 de cima) e abre uma caixa de texto pro comentário.

A marcação bruta (`==texto==§tipo`, `~texto~¶tipo{...}`) nunca aparece no texto, mesmo com o cursor em cima — pra editar ou remover um destaque/sublinhado existente, clique na bolinha pequena que aparece no fim do trecho marcado; isso reabre o mesmo menu, já com um botão "Remover marcação". Comentários funcionam do mesmo jeito, com um marcador circular próprio que abre o painel de comentários (seção 8) na entrada certa.

---

## 6. Callouts

Blocos de destaque de parágrafo inteiro, tipo "caixa de aviso":

- Sintaxe: `> [!tipo]` seguido de linhas começando com `>`.
- Tipos disponíveis: síntese (verde), importante (amarelo), dúvidas (vermelho), referências (azul), exemplos (laranja), citações (roxo).
- **Criar digitando**: escreva `/callout` sozinho numa linha (nada mais nela) e um menu de escolha de tipo aparece. O atalho **Ctrl/Cmd+Shift+F** insere esse `/callout` automaticamente pra você.
- **Trocar o tipo de um callout existente**: clique no rótulo colorido do callout (onde aparece o tipo) — reabre o mesmo menu de escolha.
- Um sétimo tipo, "ia" (magenta), existe só para callouts gerados automaticamente por uma ação de IA (seção 13) — não aparece como opção pra criar manualmente.

---

## 7. Tags

- Cada nota tem um campo "+ tag" no topo (visível sempre) e, uma vez com tags, elas aparecem como chips editáveis (duplo clique pra editar).
- Digitar sugere tags já existentes ou oferece "Criar tag: X".
- **Tags não são derivadas do texto da nota** (não existe mais `#tag` no corpo funcionando como tag) — são um dado separado, salvo à parte.
- A aba **"Tags"** na barra lateral (aba padrão ao abrir o app) mostra uma árvore hierárquica de tags (notação por ponto, ex: `Filosofia.Antiga`), com um filtro por tipo de conteúdo (Todos/Livros/Artigos/Notas) e um grupo "Sem tag" pras notas sem nenhuma.
- Clicar num nome de tag abre uma página dedicada com três modos: **Navegação** (entra um nível de cada vez), **Visão Geral** (lista tudo daquele ramo de uma vez) e **Mapa** (grafo visual daquele ramo de tags).

---

## 8. Backlinks, menções e comentários (rodapé da nota)

No fim de cada nota (role até o final):

- **Backlinks**: lista de notas que linkam pra essa nota via `[[...]]`.
- **Livros vinculados**: livros do Calibre vinculados a essa nota (ver "Vincular", seção 12) — clicável, com um "×" pra desvincular.
- **Menções não linkadas**: outras notas que citam o título desta nota em texto puro, sem usar `[[...]]`. Cada uma tem um botão "Converter em link" que reescreve a menção como link de verdade na nota de origem.

O botão **"Comentários"** no topo abre um painel lateral único com todos os comentários da nota — tanto os "ancorados" (criados por seleção de texto, como na seção 5) quanto comentários "gerais" soltos, sem trecho associado, criados por um botão "+ Novo comentário" dentro do próprio painel.

---

## 9. Navegação em PDF

O visualizador de PDF renderiza cada página em rolagem contínua (sem paginação "clique pra virar página").

- **Cabeçalho**: campo "Pág." editável (digite um número + Enter, ou use as setas ‹/›) — navega pra página exata. O número atualiza sozinho conforme você rola, com um pequeno atraso proposital pra não ficar piscando durante a rolagem rápida.
- **Zoom**: botões `−`/`+` ao lado do campo de página pulam entre níveis fixos (50/75/100/125/150/200%). Clicar no percentual (ex: "100%") vira um campo editável pra digitar qualquer valor.
- **Posição de leitura salva automaticamente**: fechar e reabrir o mesmo PDF volta exatamente na última página lida — tanto pra PDFs no vault quanto pra PDFs do Calibre.
- **Link de página**: no menu "⋯ Mais opções", "Copiar link desta página" copia um `[[arquivo#pN]]` pronto pra colar em qualquer nota.
- **Comentários**: dá pra abrir o painel de comentários (seção 8) num PDF, mas só comentários **gerais** (soltos) — não é possível ancorar um comentário a um trecho específico do texto do PDF.

---

## 10. Navegação em EPUB

Rolagem contínua também, com coluna de leitura centralizada e largura confortável fixa.

- **Sumário**: botão de sumário no cabeçalho abre uma gaveta lateral com os capítulos do livro; clicar em um navega direto pra lá. Livros sem sumário mostram um aviso.
- **Fonte e tamanho do texto**: no menu "⋯ Mais opções" → "Fonte e tamanho do texto" — 5 fontes disponíveis (Lora, Literata, Source Serif 4, Inter, Atkinson Hyperlegible) e tamanho ajustável, com opção de aplicar só nesse livro ou como padrão global.
- **Posição de leitura salva automaticamente**, igual ao PDF.
- **Link de capítulo**: "Copiar link deste capítulo" no menu "⋯" copia um `[[arquivo#capN]]`.
- **Comentários**: painel de comentários disponível com comentários gerais **e** comentários ancorados gerados por ação de IA (seção 11) — clicar num desses leva direto ao trecho no livro.

---

## 11. Seleção de texto, tradução e ações de IA

**Em PDF**: selecionar (clicar e arrastar) um trecho de texto abre um botão flutuante "Traduzir". Clicar traduz o trecho no painel de tradução (lado direito da tela). Enquanto esse painel estiver aberto, qualquer seleção nova no PDF traduz sozinha, sem precisar clicar de novo. Não há ações de IA (resumir/explicar/perguntas) disponíveis em PDF.

**Em EPUB**: o mesmo menu flutuante aparece na seleção, mas com quatro opções: "✨ Resumir", "✨ Explicar", "✨ Gerar perguntas de revisão" e "🌐 Traduzir".
- **Traduzir** funciona igual ao PDF (abre/atualiza o painel de tradução).
- **Resumir/Explicar/Gerar perguntas** chamam a IA (Gemini) e o resultado vira automaticamente um **comentário ancorado** naquele trecho do livro (com um marcador clicável no texto que leva até o painel de comentários — seção 8/10).

**Em notas comuns**: mesmo menu de seleção, mas com a diferença de que aqui as ações de IA inserem o resultado direto no corpo da nota como um **callout do tipo "ia"** (seção 6), logo depois do trecho selecionado — não abrem painel nenhum.

Tradução depende de um servidor MTranServer configurado (seção 15); ações de IA dependem de uma chave do Gemini configurada. Sem isso, o botão aparece normalmente mas a ação retorna erro.

---

## 12. Integração com Calibre

Depois de configurar o caminho da biblioteca Calibre (seção 15), livros aparecem em dois lugares:

- **Aba "Calibre"** na barra lateral: campo de busca por título/autor, e três modos de agrupamento (Assunto / Série / Autor).
- **Galeria completa** (link "ver toda a biblioteca" na página inicial): capas reais em grade, com três filtros combináveis (Assunto, Série, Autor) — mas sem campo de busca por texto livre (esse só existe na aba lateral).

Dentro de um livro do Calibre:

- **Favoritar**: estrela no canto da capa (na galeria, na barra lateral ou no cabeçalho do livro aberto) — favoritos são globais, não por vault.
- **Múltiplos formatos**: se o livro tiver mais de um formato (ex: PDF e EPUB), pills de formato aparecem no menu "⋯ Mais opções" pra trocar entre eles. Cada formato mantém sua própria posição de leitura, independente.
- **Vincular a uma nota** ("Vincular", no cabeçalho): abre uma busca pra linkar o livro a uma nota existente, ou criar uma nota nova já vinculada. É só um vínculo de metadado — não insere nenhum texto/link na nota. O vínculo aparece dos dois lados (seção 8, "Livros vinculados" na nota / lista de notas vinculadas no livro).
- **Comentários**: painel de comentários gerais funciona em qualquer livro do Calibre (PDF ou EPUB), do mesmo jeito descrito nas seções 9/10.

**Importante**: este app não sincroniza nem lê destaques/anotações feitas dentro do próprio Calibre — os comentários, favoritos e vínculos acima são inteiramente próprios do app, guardados à parte, sem relação com anotações nativas do Calibre.

---

## 13. Chat com IA

Botão **"Chat"** no cabeçalho de uma nota ou EPUB (não disponível em PDF) abre um chat lateral sobre o conteúdo daquela nota/livro.

- Cada abertura começa uma conversa nova — não retoma um chat anterior.
- Botão **"+ Relacionadas"** inclui o conteúdo das notas linkadas como contexto extra pra IA, além da nota atual.
- Se o contexto ficar grande demais, o app avisa e oferece reduzir o escopo (só o capítulo atual, no caso de EPUB, ou só a nota, sem as relacionadas).
- Toda conversa é salva automaticamente como uma nota nova (título "Chat - <nome> - <data>", tag `chat`), com link de volta pra nota original.

---

## 14. Inserir imagens

Em notas comuns, três jeitos de inserir uma imagem:

1. Botão **"Inserir imagem"** no cabeçalho.
2. **Colar** (Ctrl/Cmd+V) uma imagem copiada.
3. **Arrastar e soltar** um arquivo de imagem no editor.

A imagem é salva na pasta `attachments` do vault. Clicar numa imagem já inserida abre um popup pra ajustar tamanho, formato/recorte e alinhamento.

---

## 15. Exportar destaques

Botão **"Exportar destaques"** (desabilitado se a nota não tiver nenhum destaque/sublinhado/comentário) gera um PDF com o título da nota, uma legenda de cores dos tipos usados, e cada trecho marcado na cor certa (fundo colorido ou sublinhado, conforme o tipo original), junto com o texto de qualquer comentário anexado. Não existe exportação de nota inteira nem exportação em Markdown — só esse relatório de destaques.

---

## 16. Graph View

Botão **"Graph view"** no topo abre um grafo visual das conexões entre notas (via `[[wikilinks]]`) e livros vinculados do Calibre.

- **Local / Global**: "Local" centraliza no que está aberto no momento (só habilitado com uma nota focada); "Global" mostra o vault inteiro.
- **Força / Radial**: dois layouts diferentes ("Radial" só disponível em modo Local, já que precisa de um centro).
- Zoom com scroll/pinça, arrastar pra mover a câmera, arrastar um nó individual pra reposicionar (só no layout "Força").
- Botão de tela cheia e um botão de "restaurar zoom".
- Clicar num nó abre aquela nota/livro; clicar num nó "fantasma" (link pra um título que ainda não existe) cria a nota na hora.
- Nós de livro do Calibre aparecem com um ícone de livro e brilho dourado; notas comuns são estrelas brancas; quanto mais conectado um nó, mais ele brilha.

---

## 17. Modo foco e tela dividida

- **Modo foco** (ícone no cabeçalho de PDF/EPUB): esconde elementos extras da interface e aumenta o espaço de leitura. `Esc` sai do modo foco.
- **Dividir tela** (botão no topo, só em telas maiores que mobile): abre um segundo painel lado a lado, cada um com sua própria nota/livro aberto, cada um rolando de forma independente. Fechar um painel promove o outro a ocupar o espaço inteiro de novo.

---

## 18. Tema e fontes

- **Tema claro/escuro**: ícone de sol/lua no topo. Só essas duas opções — sem tema "automático"/do sistema, sem outras cores.
- **Fonte e tamanho do texto** (botão "Aa" no cabeçalho de uma nota, ou dentro de "⋯ Mais opções" pra EPUB): 5 fontes à escolha, tamanho ajustável entre 10 e 28px. Cada ajuste pode ser salvo como padrão global ou só pra aquela nota/livro específico.

---

## 19. Busca e filtro

Não existe busca por conteúdo de texto no app hoje — a caixa de busca na barra lateral filtra apenas por **título** (aba Notas/Tags) ou **título/autor** (aba Calibre). Não procura dentro do corpo das notas.

---

## 20. Configurações

Não há uma tela de "Configurações" centralizada — os ajustes ficam espalhados, cada um perto de onde é usado:

- **Tema, fonte e tamanho**: seção 18.
- **Biblioteca Calibre**: no menu de vaults (seção 2), seção "Biblioteca Calibre" — na versão desktop, um seletor de pasta nativo; na web, um campo de texto pra colar o caminho absoluto da pasta da biblioteca (precisa conter um `metadata.db` válido). Um filtro opcional por assunto, por vault, também mora ali (ícone de funil ao lado do nome de cada vault).
- **Variáveis de ambiente** (arquivo `.env.local`, só afetam a instância rodando localmente, não têm equivalente na interface):

| Variável | Pra que serve |
|---|---|
| `GEMINI_API_KEY` | Chave da API do Gemini — sem ela, tradução por IA... não, **ações de IA e o chat** falham com erro visível (resumir/explicar/perguntas/chat). |
| `GEMINI_MODEL` | Opcional — qual modelo do Gemini usar. Sem definir, usa o padrão mais recente. |
| `MTRANSERVER_URL` | Endereço do servidor MTranServer (tradução, self-hosted). Sem isso, o botão "Traduzir" sempre retorna erro. |
| `MTRANSERVER_API_TOKEN` | Opcional — só necessário se o MTranServer exigir autenticação. |

O caminho da biblioteca Calibre **não** é uma variável de ambiente — é configurado pela interface, como descrito acima.

---

## 21. Atalhos de teclado

| Atalho | Onde | O que faz |
|---|---|---|
| `Alt+N` | Em qualquer lugar | Cria uma nota em branco na hora. |
| `Esc` | Grafo em tela cheia | Volta o Graph View pro painel lateral. |
| `Esc` | Modo foco ativo | Sai do modo foco. |
| `Esc` | Qualquer menu/popup/modal aberto (vault, fonte, callout, destaque, importar da web, etc.) | Fecha o menu/modal. |
| `Ctrl/Cmd+Shift+F` | Editor de nota | Insere `/callout`, abrindo o menu de escolha de tipo de callout. |
| `/callout` (digitado sozinho numa linha) | Editor de nota | Abre o menu de escolha de tipo de callout — setas para navegar, Enter confirma, Esc cancela. |
| `[[` (digitado) | Editor de nota | Abre autocomplete de wikilink — setas para navegar, Enter confirma, Esc cancela. |
| `Tab` / `Shift+Tab` | Cursor num item de lista | Indenta / desindenta o item. |
| `Enter` | Campos de nome (renomear vault, criar vault, importar da web, tags, filtros do Calibre, campo de página/zoom do PDF) | Confirma o valor digitado. |
| `Shift+Enter` | Campo de mensagem do chat | Quebra de linha (sem enviar). |
| `Enter` | Campo de mensagem do chat | Envia a mensagem. |

Não existe atalho de teclado pra salvar manualmente — o salvamento é automático (com um pequeno atraso após parar de digitar), reforçado por um botão "Salvar" visível.

---

## 22. Limitações conhecidas

Pra não confundir limitação com bug:

- **Seleção de texto em PDF tem alcance limitado pela rolagem virtual**: o app só mantém o texto "vivo" (selecionável) das páginas próximas da tela, pra não consumir memória demais em PDFs grandes. Arrastar uma seleção que ultrapasse esse raio perde o trecho que está fora da janela carregada — role até a página desejada antes de selecionar um trecho grande.
- **Alguns PDFs (principalmente escaneados/OCR'd) têm codificação de fonte problemática**: o texto que aparece na tela é fiel ao original, mas o texto que sai ao *selecionar/copiar* pode vir com letras trocadas — isso é um defeito do PDF em si (mapeamento de fonte incorreto), não do app; nenhum visualizador de PDF escapa disso nesses arquivos específicos.
- **Texto selecionado em PDF vem quebrado por linha, não por frase** — o app tenta juntar quebras de linha automaticamente (inclusive desfazendo hifenização), mas é uma heurística: pode ocasionalmente juntar errado uma palavra composta com hífen de verdade, ou preservar/apagar uma quebra de parágrafo incorretamente. Rara, mas possível.
- **PDFs com páginas corrompidas de origem podem mostrar uma página em branco silenciosamente** — se o arquivo PDF original tiver uma imagem de página truncada/corrompida, o app não trava nem mostra erro; a página aparece em branco. Isso é do arquivo, não do visualizador.
- **Sem busca por conteúdo**: a caixa de busca da barra lateral filtra só por título (e autor, na aba Calibre) — não procura texto dentro das notas.
- **Sem mudança de "status de estudo" pela interface** (ex: "lendo"/"lido"/"rascunho"): esse conceito existe internamente mas não tem nenhum controle na tela hoje pra alterá-lo.
- **Sem sincronização com anotações nativas do Calibre**: favoritos, comentários e vínculos deste app são inteiramente separados de qualquer destaque/anotação feito dentro do próprio Calibre.
- **Comentários ancorados a um trecho específico só existem em notas comuns e em EPUB** (estes últimos só quando gerados por uma ação de IA) — PDF só tem comentários gerais, sem ancoragem a texto.
- **Chat com IA não está disponível em PDF**, só em notas comuns e EPUB.
- **Tradução e ações de IA dependem de serviços externos configurados** (MTranServer self-hosted e chave do Gemini, respectivamente) — sem eles configurados em `.env.local`, os botões aparecem mas retornam erro ao usar.
