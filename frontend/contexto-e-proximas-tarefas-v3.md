# Contexto e próximas tarefas v3 — App de Estudo Pessoal

> Complementa (não substitui) os arquivos anteriores: `contexto-e-proximas-tarefas.md` (até a Homepage) e `contexto-e-proximas-tarefas-v2.md` (tema sépia noturno, fonte estilo Kindle, extração de PDF/EPUB — que foi posteriormente **abandonada e substituída**, ver abaixo). Este arquivo cobre a virada de arquitetura do visualizador de PDF/EPUB e tudo decidido depois disso.

## Como eu (Claude) devo me comportar nesta continuação

- A pessoa **não é programadora**. Não assumir familiaridade com termos técnicos.
- Ela desenvolve com o **Claude Code** (extensão VS Code) para execução, e usa um chat normal (aqui) para decisões de design/gosto antes de mandar pro Claude Code.
- Quando ela pedir "texto para o Claude Code", entregar um **texto descritivo em português, sem diffs de código** — comportamento esperado, não implementação linha a linha.
- Decisões de visual/UX devem ser **mostradas** (mockup) antes de virarem texto final — ela reage melhor a ver do que a descrição em prosa.
- Sempre que um plano do Claude Code vier técnico demais, traduzir para português simples antes de qualquer decisão.
- **Por padrão, não gerar arquivo de contexto** — mostrar o texto direto na tela, a menos que ela peça explicitamente um arquivo.
- **Regra nova**: se a conversa começar a ficar longa e consumir muitos tokens, **avisar proativamente** e sugerir gerar um arquivo de contexto novo (como este) para começar um chat limpo — não esperar ela pedir.

## Stack e estrutura (ainda válido)

Next.js 16 (App Router, TS, Tailwind), CodeMirror 6 via `@uiw/react-codemirror`, Node 24 via nvm, arquivos `.md` como fonte da verdade para notas de texto (sem banco, exceto o índice SQLite), Manjaro Cinnamon, VS Code + extensão Claude Code.

---

## ⚠️ MUDANÇA DE ARQITETURA: PDF/EPUB não vira mais `.md`

O plano antigo (v2) de converter PDF/EPUB em nota `.md` foi **abandonado por completo**, depois de vários bugs de extração (sumário vazando, título grudado, número de página solto) que se mostraram difíceis de corrigir de forma robusta.

**Novo modelo**: PDF/EPUB mantêm o arquivo original intacto, e o app oferece um **visualizador** por cima. Essa mudança já está em grande parte implementada (ver seção "Confirmado funcionando"), com ajustes finais ainda em andamento (ver "Em aberto").

### Depois disso, outra virada: marcação colorida no PDF foi abandonada

Depois de três rodadas de investigação/correção de um bug de seleção de texto (explicado abaixo), a decisão foi **desistir da marcação colorida dentro do PDF** e usar o **leitor nativo do navegador** para PDF (só leitura, sem destaque). EPUB **mantém** o visualizador próprio com marcação — o problema relatado nele era outro, considerado aceitável por ora.

No lugar da marcação, o novo mecanismo de anotação é: escrever a anotação numa nota de texto normal e **linkar para uma página/capítulo específico** do PDF/EPUB.

---

## ✅ Confirmado funcionando (testado pela pessoa)

Herdado de sessões anteriores (v1/v2): callout visual, tema escuro/claro, correção de contraste, slash command `/callout`, menu lateral com busca/agrupamento por tag, título editável, Homepage editorial, links bidirecionais `[[nota]]`, unlinked mentions, aviso de link quebrado, Graph view.

Desta sessão:
- Visualizador de PDF/EPUB com arquivo original preservado (sem extração pra `.md`)
- Campo de tags dedicado, fora do corpo do texto, com autocompletar + criação de tag nova, funcionando tanto em notas `.md` quanto em PDF/EPUB
- Remoção da sintaxe antiga `#tag` dentro do corpo do texto (deixou de ter função especial — tags antigas escritas assim **não foram migradas**, ficaram órfãs até serem re-adicionadas manualmente pelo campo novo)
- Correção de largura do EPUB (reflui em coluna de leitura confortável, sem estourar a tela)
- Zoom do PDF com dois modos ("ajustar à tela" / "ajustar à largura") + ajuste manual
- Modo de navegação alternável: contínuo (rolagem, estilo Okular) ou paginado (clique, estilo Calibre), preferência salva localmente
- Menu de marcação (`HighlightMenu`) agora fecha corretamente ao clicar fora (`onClose` adicionado)
- Correção do bug de auto-scroll ao arrastar seleção perto da borda inferior (resolvido via "congelar `scrollTop`" com listener de scroll, sem tocar `overflow` — a tentativa anterior que mexia em `overflow` tinha causado uma regressão grave, revertida)

## 🐛 Bug histórico do PDF — por que a marcação foi abandonada

Story completa, para não repetir investigação já feita:

1. Seleção de texto "explodia" (selecionava muito mais do que o pretendido) especificamente em zoom acima de ~130%, piorando progressivamente com mais zoom.
2. Hipóteses testadas e **refutadas com evidência direta**: (a) segundo contêiner de rolagem vazando — não existia; (b) cursor saindo da janela do navegador — descartado com prints reais mostrando o cursor sempre dentro da área do PDF.
3. Causa raiz **encontrada e corrigida** (mas não resolveu o problema todo): `<span>` de linha com pequeno vão (2-3px) entre uma linha e outra; ao arrastar exatamente sobre esse vão, `caretRangeFromPoint` do navegador "caía" no contêiner pai com um offset de índice de filho (não de caractere), fazendo a seleção saltar para um ponto arbitrário. Corrigido calculando a posição a partir das coordenadas do clique em vez de confiar no `Range` nativo (`src/lib/pdfAnchor.ts`, função `offsetFromPoint`).
4. **Mesmo após essa correção, o bug persistiu** meses o suficiente (relato da pessoa: "a seleção ficou muito pior" numa tentativa intermediária, depois "não resolveu" na versão seguinte). Diante disso, decisão pragmática: abandonar a marcação colorida no PDF em vez de continuar investigando.

Este histórico existe para o Claude Code não repetir as mesmas hipóteses já refutadas, caso o assunto volte no futuro.

---

## 🔄 Em aberto — textos já escritos, aguardando envio/implementação

### 1. PDF: usar leitor nativo do navegador (abandona marcação colorida)
PDFs abrem no visualizador nativo de PDF do navegador (o mesmo de abrir um link de PDF direto), sem PDF.js customizado, sem marcação/destaque. Só leitura. EPUB mantém o visualizador próprio com marcação.

### 2. Link para página (PDF) / capítulo (EPUB) específico, referenciável de outra nota
Duas formas de criar o link, ambas devem existir:
- **Manual**: digitar a sintaxe direto na nota, ex. `[[Nome do arquivo#p42]]` (PDF, por página) ou `[[Nome do arquivo#cap3]]` (EPUB, por capítulo).
- **Botão no visualizador**: "Copiar link desta página/capítulo" gera o texto pronto pra colar.

Clicar no link a partir de uma nota abre o PDF/EPUB direto na página/capítulo referenciado.

**Limitação técnica identificada pelo Claude Code**: o leitor nativo do navegador não expõe de forma confiável "em que página o usuário está" para o JavaScript da página — não é escolha de implementação, é limitação real do Chrome/Firefox. **Decisão tomada**: usar campo manual de página para o PDF (a pessoa confirma/digita o número, já que o app não consegue detectar sozinho de forma confiável).

**EPUB — só capítulo, sem posição dentro dele**: decisão explícita de manter simples e robusto (evitar reintroduzir a complexidade de ancoragem de texto que causou os problemas do PDF). O link leva ao início do capítulo, não a um trecho específico.

**EPUB — trocar contagem de "página" por "capítulo"**: a contagem atual de página no EPUB não faz sentido (ex: "Página 1 de 1" para um livro inteiro), porque EPUB não tem página fixa. Trocar para "Capítulo X de Y", usando a divisão de capítulos que já existe na estrutura interna do EPUB.

### 3. Dividir tela em dois painéis
Botão "Dividir tela": divide a área de conteúdo em dois painéis lado a lado. O painel novo aparece vazio com a mensagem **"selecione nota"** até a pessoa clicar em qualquer item da lista lateral já existente (notas, PDF ou EPUB, qualquer combinação) para preenchê-lo. Fechar um painel volta à tela única (o painel restante ocupa a largura toda).

**Escopo técnico confirmado com a pessoa**: implica refatorar toda a lógica de "nota aberta" (hoje ~30 variáveis de estado espalhadas em `page.tsx`) para um componente `NotePanel` autocontido, montável duas vezes — mesmo padrão que `PdfViewer`/`EpubViewer` já usam. Confirmado como refactor grande, mas correto; pessoa já aprovou seguir com o refactor completo.

### 4. Tamanho da área do visualizador
A área do visualizador (tanto o iframe/embed do leitor nativo de PDF quanto o EPUB) deve ocupar bem o espaço disponível, sem sobra grande de espaço vazio ao redor — tanto em painel único (tela cheia) quanto com a tela dividida em dois painéis.

### 5. Bug visual no EPUB: itálico aparecendo como link azul sublinhado
Referências bibliográficas em itálico dentro do texto (ex: títulos de livros citados) aparecem azuis e sublinhadas, como link, provavelmente porque o EPUB usa `<a>` internamente e o visualizador aplica o estilo padrão de link do navegador por cima, ignorando o CSS original (itálico, cor normal). Corrigir para que texto que é só formatação mantenha a aparência pretendida pelo EPUB (cor normal, sem sublinhado), mesmo que estruturalmente esteja dentro de uma tag de link.

### 6. Bug de contraste no EPUB: texto quase invisível
O fundo da área de leitura segue o tema do app (ex: escuro), mas o texto continua com a cor original do CSS do EPUB (ex: preto, pensado pra fundo branco) — contraste ruim. **Decisão**: o texto do EPUB deve sempre seguir o tema ativo do app (claro/escuro, incluindo "sépia noturno"/"creme suave"), sobrescrevendo cor de texto e fundo do CSS original — mas preservando outras formatações (itálico, negrito, alinhamento, tamanho relativo).

---

## 📋 Próximos passos sugeridos (ordem de prioridade)

1. Enviar ao Claude Code, nesta ordem sugerida (itens 1 e 2 são pré-requisito conceitual dos demais):
   - PDF → leitor nativo do navegador (abandona marcação colorida)
   - Link de página (PDF, campo manual)/capítulo (EPUB) + botão "copiar link"
   - Trocar contagem de página por capítulo no EPUB
   - Tamanho da área do visualizador (painel único e dividido)
   - Bug visual: itálico como link azul no EPUB
   - Bug de contraste: texto do EPUB seguindo o tema
   - Dividir tela em dois painéis (maior escopo, pode ser feito por último ou em paralelo, já que é mais isolado)
2. Depois de tudo testado e estável, retomar o backlog:
   - Tema escuro "sépia noturno" + fonte estilo Kindle + inserir imagens (ver v2 — confirmar se já foram implementados; não estavam confirmados como testados neste arquivo)
   - Anotação em PDF escaneado (fora de escopo — precisaria de OCR)
   - IA: resumir/explicar via Claude API
   - Exportação de destaques/comentários em PDF (especificado, mas agora só se aplica a EPUB, já que PDF não tem mais marcação)
   - Aliases de nota (formato e comportamento visual — adiado desde v2)
   - MOBI/AZW3 — decisão explícita de **não** suportar por ora (exigiria conversão via Calibre; pessoa preferiu manter só PDF/EPUB)
3. Deploy — **decidido deixar para depois**. Quando retomar:
   - Fase 1: servidor privado simples (VPS barato). **Opção gratuita identificada**: Fly.io (VM leve + volume persistente, necessário porque o app depende de arquivo em disco, não serverless). Render é alternativa, com cold-start. Vercel/Netlify **não servem** (serverless, sem disco persistente) a menos que se migre para banco de dados real (adiantaria a Fase 3 antes da hora).
   - Fase 2: login por pessoa + pastas isoladas por usuário.
   - Fase 3: público, banco de dados real (Postgres), contas, rate limiting, backups.

## Dívida técnica conhecida (não resolvida)

- Paleta de cores duplicada entre `livePreview.ts` e `page.tsx` — candidata a unificar em `src/lib/colors.ts`.
- Arquivo duplicado encontrado no vault durante investigação: `Sertillanges...-2.pdf` (560KB, mesmo conteúdo do original) — resquício de teste de import, não removido, aguardando a pessoa decidir se apaga.
