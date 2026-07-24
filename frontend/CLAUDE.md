# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A personal study tool (Portuguese-language project) intended as an Obsidian replacement: a Markdown editor with a custom Live Preview mode, plus an "active fichamento" system — colored highlights, underlines, and typed comments layered on top of plain Markdown. Callouts are mid-implementation. See `resumo-tecnico-projeto.md` for the fuller roadmap and decision log (in Portuguese).

## Commands

Run from `frontend/` (this directory):

```bash
npm run dev     # start dev server (http://localhost:3000)
npm run build   # production build
npm run start   # run a production build
npm run lint    # eslint
```

There is no test framework configured (no jest/vitest/playwright) — there are no test commands to run.

## Architecture

### Storage: files, not a database

`.md` files are the single source of truth. There is no database. Notes live in a vault directory *outside* this repo, at `~/projetos/vault-notas`, and the app will fail to read/list notes if that directory doesn't exist locally.

- `src/app/api/notes/route.ts` — `GET`, lists all `.md` filenames in the vault.
- `src/app/api/note/route.ts` — `GET`/`POST` a single note by filename. Both routes hardcode `VAULT_PATH = ~/projetos/vault-notas` and resolve incoming filenames through `path.basename` before joining, to prevent path traversal outside the vault.

### Core files

- `src/app/page.tsx` — the central file: page state, toolbar, notes list/sidebar, comment side panel.
- `src/lib/livePreview.ts` — all CodeMirror 6 decoration logic: Live Preview rendering (headings, bold/italic, bullets, checkboxes), and the parsing/decoration for highlights, comments, and callouts.
- `src/components/HighlightMenu.tsx` — floating menu shown on text selection for applying a highlight/underline type.
- `src/components/CommentModal.tsx` — create/edit modal for typed comments.
- `src/lib/colors.ts` — single source of truth for every color palette/mapping in the app (highlight/underline/callout colors, study-status colors, Graph View background). Anything needing one of these imports it from here — don't redefine a palette locally.

### Custom inline/block syntaxes

These are invented conventions layered on top of Markdown, parsed in `livePreview.ts` — not standard Markdown/GFM:

- Highlight (background): `==texto==§tipo`
- Underline: `==texto==§tipo:sub`
- Typed comment: `~texto~¶tipo{comentário}`
- Callout block: `> [!tipo]` followed by `>`-prefixed lines

### Comment highlight sync

Clicking a comment anchor in the text and hovering its margin bubble are kept in sync via a CodeMirror `StateField`/`StateEffect` pair (`activeCommentField` / `setActiveCommentEffect`, exported from `livePreview.ts` and registered as an editor extension) — not local component state. Comments never expose their raw syntax on click (unlike highlights, which do when the cursor touches them in edit mode).

### Layout / positioning model

Each `NotePanel` instance scrolls independently (its own `overflow-y: auto` container in `NotePanel.tsx`), not the whole page — this matters because split-screen mode (`page.tsx`) renders two `NotePanel`s side by side, and each must scroll on its own without affecting the other. Within a single panel, the CodeMirror editor itself still does not scroll internally (`height: "auto"` on both the CodeMirror instance and `editorTheme`'s `&` rule) — its content grows naturally and the panel's own scroll container handles overflow, which is also what lets Backlinks/Menções live below the fold (a `minHeight: "100%"` wrapper around the title+content forces the panel to be at least a full screen tall before those sections begin). Comment anchors render as an inline circular marker at the end of the highlighted span (`CommentMarkerWidget` in `livePreview.ts`) that opens the unified comments panel — there is no separate margin-bubble column anymore.

## Contexto do projeto
Ver resumo-tecnico-projeto.md para o histórico completo de decisões.

## Convenções críticas (não redescobrir isso lendo o código)
- Sintaxe de marcação: `==texto==§tipo` (fundo) ou `==texto==§tipo:sub` (sublinhado)
- Sintaxe de comentário: `~texto~¶tipo{comentário}`
- Paleta de cores unificada em src/lib/colors.ts (highlight/underline/callout/status/Graph View) —
  qualquer arquivo que precise de uma dessas cores importa dali, nunca redefine localmente
- Comentários NUNCA expõem sintaxe bruta ao clicar; highlights expõem ao cursor tocar
- Cada NotePanel rola de forma independente (overflow-y:auto próprio) — não é mais a página inteira que rola,
  porque no modo Dividir tela cada painel precisa rolar sem afetar o outro. Dentro de um painel, o editor
  CodeMirror continua sem scroll interno próprio (height:"auto") — não usar view.scrollDOM.scrollTop
