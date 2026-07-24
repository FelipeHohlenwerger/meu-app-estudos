# Contexto e próximas tarefas v2 — App de Estudo Pessoal

> Gerado a partir da continuação da conversa de design/planejamento. Complementa (não substitui) o `contexto-e-proximas-tarefas.md` anterior — aquele cobre até a tarefa da Homepage; este cobre tudo decidido depois disso.

## Como eu (Claude) devo me comportar nesta continuação

- A pessoa **não é programadora**. Não assumir familiaridade com termos técnicos.
- Ela desenvolve com o **Claude Code** (extensão VS Code) para execução, e usa um chat normal (aqui) para decisões de design/gosto antes de mandar pro Claude Code.
- Quando ela pedir "texto para o Claude Code", entregar um **texto descritivo em português, sem diffs de código** — comportamento esperado, não implementação linha a linha.
- Decisões de visual/UX devem ser **mostradas** (mockup) antes de virarem texto final — ela reage melhor a ver do que a descrição em prosa.
- Sempre que um plano do Claude Code vier técnico demais, traduzir para português simples antes de qualquer decisão.

## Stack e estrutura (ainda válido)

Next.js 16 (App Router, TS, Tailwind), CodeMirror 6 via `@uiw/react-codemirror`, Node 24 via nvm, arquivos `.md` como fonte da verdade (sem banco, exceto o índice SQLite), Manjaro Cinnamon, VS Code + extensão Claude Code.

---

## ✅ Confirmado funcionando (testado pela pessoa)

- Callout visual, ícones por tipo, tema escuro original, correção de contraste, bug do header/sidebar
- Slash command `/callout` + atalho `Ctrl+Shift+F` para inserir callout
- Menu lateral: busca (filtra por título + tags), agrupamento por tag (colapsado por padrão), nota com múltiplas tags aparece duplicada em cada grupo, destaque visual da nota aberta
- Título editável que renomeia o arquivo de verdade (disco + links + índice SQLite)
- Homepage editorial: título serifado (Fraunces), resumo de notas/temas, seção Progresso com 4 status + pontinhos coloridos, seções por tag em grade de cards, cards com resumo automático e tempo de leitura
- Links bidirecionais `[[nota]]`
- **Unlinked mentions** — seção colapsável funcionando
- **Link quebrado** — aviso visual + oferece criar a nota, funcionando
- **Graph view** — os 4 combos (local/global × força/radial) funcionam de verdade

## 🔄 Em execução no Claude Code (aguardando teste da pessoa)

Sete itens enviados, status por último relato:

1. ✅ Rodando — Corrigir resumo do card (estava mostrando `#tag` em vez do texto real da nota) + remover botão "Callout" redundante do menu superior (slash command e atalho já cobrem a função)
2. ✅ Rodando — Botão "+" para criar nota em branco / importar PDF-EPUB em 3 lugares: Homepage (dashboard), menu superior (ícone "+"), sidebar (acima da busca). Atalho `Alt+N` cria nota em branco direto.
3. ✅ Rodando — Importação de PDF/EPUB → vira nota `.md` (arquivo original descartado depois). Nome da nota = nome do arquivo original sem extensão. Notas de rodapé do documento original viram sintaxe `[^n]` clicável (popup com o conteúdo). Indicador de progresso durante conversão.
4. 🔄 Em implementação — Pós-processamento da extração de PDF: juntar linhas quebradas em parágrafos contínuos (remover hífen de corte de palavra), detectar e separar sumário/índice do corpo do texto. Vale só para próximas importações, não reprocessa notas já importadas.
5. 🔄 Em implementação — Tema claro "creme suave": fundo `#f5f0e6`, cards `#fbf8f1`, bordas `#e0d8c5`, texto principal `#3a3226`, texto muted `#8a7d63`. Switch sol/lua no menu superior, preferência salva localmente.
6. 🔄 Em implementação — Gradiente suave vertical no topo da Homepage (de `#ecdfc4` a `#f5f0e6` em ~260px), com equivalente para o tema escuro.
7. ⏳ Ainda não iniciado — Inserir imagens nas notas (colar/botão/arrastar-soltar), redimensionar com slider de zoom em tempo real, 4 formatos de recorte visual (retangular/quadrado/círculo/oval) via CSS, sem alterar o arquivo original.

⚠️ **Bug identificado nas capturas de tela mais recentes**: no tema claro, o editor de texto (CodeMirror) está com fundo azul-acinzentado fixo, não seguindo o tema — precisa ser corrigido junto com o item abaixo.

## 🆕 Decisões novas desta sessão (ainda não implementadas)

### Tema escuro "sépia noturno" (substituindo o atual)
O tema escuro atual é cinza-azulado neutro e não agradou. Nova paleta, combinando com o tom creme do tema claro:
- Fundo da página e do editor: `#1c1a17`
- Fundo de cards/painéis: `#26221d`
- Bordas: `#3a352c`
- Texto principal: `#e8ddc9`
- Texto secundário/muted: `#8a7f6c`
- Cor de destaque (links, callout "importante", etc): `#d4af6a`

Aplicar em: fundo geral, sidebar, painéis (Comentários, Tags), callouts, editor CodeMirror.

### Correção do editor não seguir o tema
Editor deve usar as mesmas variáveis de cor do tema ativo (claro ou escuro), nunca cor fixa. Fundo do editor = **exatamente o mesmo fundo da página** em ambos os temas (não é um "cartão" destacado — é uma continuação da página, como texto escrito direto na folha).

### Ajuste de tamanho de fonte (estilo Kindle)
- Botão "Aa" na sidebar, próximo ao título/nome da nota
- Abre popup: botão "A" pequeno (diminuir) — número do tamanho atual — botão "A" grande (aumentar), mais uma prévia de linha de texto, mais checkbox "Usar este tamanho só nesta nota"
- Checkbox desmarcado → ajuste altera o padrão global (todas as notas, exceto as com substituição própria)
- Checkbox marcado → ajuste vale só para a nota atual, sobrescrevendo o padrão global
- Preferências (global + por nota) salvas e lembradas entre sessões
- Vale tanto para notas normais quanto notas importadas de PDF/EPUB

### Aliases de nota — adiado
Decisão de usar `aliases: nome1, nome2` no topo do arquivo ficou confirmada como direção, mas **formato exato e comportamento visual do link foram propositalmente adiados** ("vamos deixar para depois"). Retomar quando a pessoa quiser.

---

## 📋 Próximos passos sugeridos (ordem de prioridade)

1. **Testar os itens 1-3** (já devem estar prontos) e reportar problemas
2. **Aguardar itens 4-6 terminarem** (formatação de extração, tema claro, gradiente)
3. **Enviar os 3 textos novos desta sessão** pro Claude Code:
   - Tema escuro "sépia noturno" + correção do editor não seguir tema
   - Menu de tamanho de fonte estilo Kindle
   - (Item 7 do lote anterior — imagens nas notas — ainda pendente de execução)
4. Depois de tudo testado e estável, retomar o backlog:
   - Anotação em PDF escaneado
   - IA: resumir/explicar via Claude API
   - Exportações (por cor, por comentário, criar nota a partir de marcações)
   - Aliases (formato e comportamento visual)
5. Deploy — **decidido deixar para depois**. Quando retomar, contexto já discutido:
   - Fase 1: servidor privado simples (VPS barato, ex. DigitalOcean/Railway/Fly.io), só a pessoa usa, senha simples, arquivos `.md`/SQLite no disco do servidor
   - Fase 2: login por pessoa + pastas de notas isoladas por usuário (mudança de arquitetura)
   - Fase 3: público — migração para banco de dados real (Postgres), contas com recuperação de senha, rate limiting, backups, custos crescentes com uso

## Dívida técnica conhecida (não resolvida)

Paleta de cores duplicada entre `livePreview.ts` e `page.tsx` — candidata a unificar em `src/lib/colors.ts` quando fizer sentido. Com a criação do tema "sépia noturno" e do tema claro, esse é um bom momento para finalmente resolver isso, já que as cores estão sendo revisadas de qualquer forma.

## Backlog original ainda não iniciado (herdado do resumo técnico original)

- Extração PDF/EPUB → **em andamento** (ver seção acima)
- Anotação em PDF escaneado
- IA: resumir/explicar via Claude API
- Exportações (por cor, por comentário, criar nota a partir de marcações)
