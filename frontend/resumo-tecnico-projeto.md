# Resumo Técnico — App de Estudo Pessoal

## 1. Objetivo
Ferramenta pessoal de estudo que substitui o Obsidian, com:
- Editor Markdown com Live Preview (estilo Obsidian)
- Sistema de fichamento ativo (highlights coloridos, sublinhado, comentários tipados, callouts)
- Futuro: PDF/EPUB, IA (Claude API), Graph View, Dashboard, categorias/links [[nota]]

## 2. Stack
- **OS dev**: Linux Manjaro
- **Runtime**: Node.js 24.18.0 via nvm 0.40.5
- **Framework**: Next.js 16 (App Router, TypeScript, Tailwind)
- **Editor**: CodeMirror 6 via `@uiw/react-codemirror` com Live Preview customizado
- **Python**: 3.14.5 com venv (reservado para extração PDF/EPUB futura)
- **Repositório**: https://github.com/FelipeHohlenwerger/meu-app-estudos

## 3. Estrutura de arquivos
```
~/projetos/
├── vault-notas/          ← arquivos .md do usuário (FORA do projeto)
│   ├── teste.md
│   ├── segunda-nota.md
│   └── terceira-nota.md
└── meu-app-estudo/
    └── frontend/
        └── src/
            ├── app/
            │   ├── page.tsx              ← página principal (ARQUIVO CENTRAL)
            │   ├── globals.css
            │   └── api/
            │       ├── note/route.ts     ← lê/escreve .md específico
            │       └── notes/route.ts    ← lista todos .md da vault
            ├── components/
            │   ├── HighlightMenu.tsx     ← menu flutuante de marcação
            │   └── CommentModal.tsx      ← modal de criação/edição de comentário
            └── lib/
                └── livePreview.ts        ← TODA a lógica de decoration do CodeMirror
```

**Armazenamento**: arquivos `.md` como fonte da verdade. Sem banco de dados.
**Rolagem**: página inteira rola (não o editor internamente). `sectionRef` como referência de posicionamento.

## 4. Implementado com sucesso

### Editor (livePreview.ts)
- Live Preview: negrito, itálico, 6 níveis de título (H1-H6)
- Bullets (`-`/`*`/`+` → `•`), checkbox clicável (`- [ ]`/`- [x]`)
- GFM habilitado (`@lezer/markdown` com extensões GFM)
- Syntax highlighting customizado (sem sublinhado nativo em títulos)
- Sem números de linha (`basicSetup={{ lineNumbers: false, foldGutter: false }}`)

### Sistema de marcação (6 tipos novos — PALETA ATUALIZADA)
**Highlight (fundo):**
```
conceito: "#fff3a0"    (amarelo)
duvidas: "#ffd0d0"     (vermelho)
referencias: "#cfe8ff" (azul)
exemplo: "#ffe4c2"     (laranja)
acao: "#dde4ea"        (cinza-azulado)
opiniao_autor: "#e6d9f7" (roxo)
```
**Sublinhado (mesmo conjunto + preto + azul extras):**
```
conceito: "#d4af00" | duvidas: "#d04444" | referencias: "#2f7fd6"
exemplo: "#d6822f" | acao: "#5b6b78" | opiniao_autor: "#8d5fc7"
preto: "#000000" | azul: "#1e5fd6"
```
**Sintaxe**: `==texto==§tipo` (fundo) | `==texto==§tipo:sub` (sublinhado)
**Ícone ●** clicável após cada highlight (abre menu de edição/remoção)

### Sistema de comentários
**Sintaxe**: `~texto~¶tipo{comentário}`
- Sublinhado ondulado customizado (SVG inline via background-image)
- Hover no balão ou clique no texto → destaque sincronizado via `StateField`/`StateEffect`
- Balões na coluna de margem direita (260px fixos), com anti-colisão (MIN_GAP=56px)
- Posicionamento calculado via `requestAnimationFrame` + listener de scroll/resize na `window`
- `sectionRef` como referência de `getBoundingClientRect()`
- Painel lateral "💬 Comentários" (toggle na barra de ferramentas)
- Edição via duplo-clique ou ícone ✏️ (SVG); exclusão via ícone 🗑 (SVG)
- Proteção contra seleção parcial em highlight/comentário existente

### Callouts (parcialmente implementado — visual ainda pendente)
**Sintaxe**: `> [!tipo]` seguido de linhas com `>`
**Tipos e cores:**
```
sintese: "#2e9e4e"    (verde)
importante: "#d4af00" (amarelo)
duvidas: "#d04444"    (vermelho)
referencias: "#2f7fd6"(azul)
exemplos: "#d6822f"   (laranja)
citacoes: "#8d5fc7"   (roxo)
```
**O que funciona**: parser `findCallouts()` detecta blocos, `CalloutLabelWidget` esconde `> [!tipo]` e mostra rótulo
**O que NÃO está certo**: visual muito apagado (fundo quase transparente + borda fina)
**Forma de inserção**: botão "📦 Callout" na barra de ferramentas existe mas o usuário NÃO gostou do dropdown — ainda decidindo a forma de inserção

### Infraestrutura
- Layout: `<main flex-col>` → `<header>` + `<div flex overflow-auto>` → `<aside>notas` + `<section flex position-relative>` → `<div flex-1>editor</div>` + `<div 260px>margem balões</div>` + `<aside>painel comentários</aside>`
- Git inicializado, primeiro commit feito, push para GitHub OK

## 5. Próximos passos (em ordem de prioridade)

### IMEDIATO — Corrigir visual dos callouts
Trocar `Decoration.mark` por `Decoration.line` para aplicar estilo em linhas inteiras.
Visual desejado: **fundo sólido com cor forte + texto branco** (igual aos balões de comentário).
Usar `calloutColorsPalette` já definido no `page.tsx`.

### IMEDIATO — Decidir forma de inserção de callout
Usuário está entre:
- **Opção 1**: slash command (`/callout` inline, estilo Notion)
- **Opção 2**: aba "Callout" no menu flutuante de highlight existente
- **Opção 3**: botão contextual barra lateral
- **Opção 4**: atalho de teclado (`Ctrl+Shift+C`)

### SEQUÊNCIA APÓS CALLOUTS
6. ✅ Callouts → em andamento
7. Categorias + links `[[nota]]` + índice SQLite
8. Graph View
9. Dashboard de biblioteca/progresso
10. Extração PDF/EPUB (lado Python)
11. Anotação em PDF escaneado
12. IA: resumir/explicar via Claude API
13. Exportações (por cor, por comentário, criar nota a partir de marcações)

## 6. Decisões técnicas importantes já tomadas
- `activeCommentField` (StateField) + `setActiveCommentEffect` (StateEffect) exportados de `livePreview.ts` e registrados como extensão no CodeMirror — necessário para destaque sincronizado
- `commentClickHandler` (EditorView.domEventHandlers) captura clique em `.comment-anchor` sem mover cursor
- Comentários NUNCA expõem sintaxe bruta ao clicar (sem `cursorTouches` pra comentários)
- Highlights expõem sintaxe ao cursor tocar (modo edição)
- Callouts expõem sintaxe só na linha `> [!tipo]` quando cursor está nela
- `view.scrollDOM.scrollTop` NÃO é mais usado para posicionamento (página rola, não o editor)
- Dívida técnica conhecida: paleta de cores duplicada em `livePreview.ts` e `page.tsx` (a unificar em `src/lib/colors.ts` futuro)
- Tipo pendente no conjunto Destaque/Sublinhado/Comentário: usuário vai decidir depois
