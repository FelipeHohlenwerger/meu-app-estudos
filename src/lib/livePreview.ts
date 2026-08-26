import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, keymap } from "@codemirror/view";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import { WidgetType } from "@codemirror/view";
import { StateEffect, StateField, Prec } from "@codemirror/state";
import { parseWikiMatches, findBlockMarkers } from "@/lib/wikiLinkSyntax";
import {
  IMAGE_REGEX,
  DEFAULT_IMAGE_SIZE,
  DEFAULT_IMAGE_SHAPE,
  DEFAULT_IMAGE_ALIGN,
  DEFAULT_IMAGE_WRAP,
  type ImageShape,
  type ImageAlign,
  type ImageWrap,
} from "@/lib/imageSyntax";
import { highlightColors, underlineColors, calloutColors, HEADING_COLORS } from "@/lib/colors";
import { CodeBlockWidget, MermaidWidget } from "@/lib/codeBlockWidget";
import { parseVideoEmbedUrl } from "@/lib/videoEmbed";

// Vault ativo, pro ImageWidget montar a URL de anexos locais (/api/attachments
// precisa saber de qual vault). Este arquivo não é um componente React (é
// lógica pura do CodeMirror), então não tem acesso direto ao Contexto de
// vault — uma variável de módulo simples (mesmo padrão de outros estados
// "de fora do React" já usados aqui) resolve isso: NotePanel.tsx chama
// setActiveVaultId sempre que o vault ativo muda. Nunca precisa ser reativo
// no meio da visualização de uma nota específica, já que trocar de vault
// sempre fecha todos os painéis de nota primeiro.
let activeVaultId: string | null = null;
export function setActiveVaultId(id: string): void {
  activeVaultId = id;
}

const boldMark = Decoration.mark({ attributes: { style: "font-weight: bold" } });
const italicMark = Decoration.mark({ attributes: { style: "font-style: italic" } });

const headingMarks = [
  Decoration.mark({ attributes: { style: `font-size: 1.8em; font-weight: bold; color: ${HEADING_COLORS[0]};` } }),
  Decoration.mark({ attributes: { style: `font-size: 1.6em; font-weight: bold; color: ${HEADING_COLORS[1]};` } }),
  Decoration.mark({ attributes: { style: `font-size: 1.4em; font-weight: bold; color: ${HEADING_COLORS[2]};` } }),
  Decoration.mark({ attributes: { style: `font-size: 1.2em; font-weight: bold; color: ${HEADING_COLORS[3]};` } }),
  Decoration.mark({ attributes: { style: `font-size: 1.1em; font-weight: bold; color: ${HEADING_COLORS[4]};` } }),
  Decoration.mark({
    attributes: { style: `font-size: 1em; font-weight: bold; opacity: 0.8; color: ${HEADING_COLORS[5]};` },
  }),
];

// highlightColors/underlineColors/calloutColors vêm de @/lib/colors (fonte
// única da paleta — ver comentário lá) — só os ícones dos callouts (não são
// cor, então ficam fora do colors.ts) continuam definidos aqui.
export const calloutIcons: Record<string, string> = {
  sintese: `<path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2"/><path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z"/><path d="M9 12l.01 0"/><path d="M13 12l2 0"/><path d="M9 16l.01 0"/><path d="M13 16l2 0"/>`,
  importante: `<path d="M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -1.056 -3.94 -2 -5c-1.786 3 -2.791 3 -4 2z"/>`,
  duvidas: `<path d="M8.5 8.5a3.5 3.5 0 1 1 5 3.163c-.94 .462 -1.5 1.443 -1.5 2.337v.5"/><path d="M12 19l0 .01"/>`,
  referencias: `<path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6l0 13"/><path d="M12 6l0 13"/><path d="M21 6l0 13"/>`,
  exemplos: `<path d="M9 6l11 0"/><path d="M9 12l11 0"/><path d="M9 18l11 0"/><path d="M5 6l0 .01"/><path d="M5 12l0 .01"/><path d="M5 18l0 .01"/>`,
  citacoes: `<path d="M10 11h-4a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v6c0 2.667 -1.333 4.333 -4 5"/><path d="M19 11h-4a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v6c0 2.667 -1.333 4.333 -4 5"/>`,
  ia: `<path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6"/>`,
};

// Reconhece um bloco callout estilo Obsidian:
// > [!tipo]
// > linha 1
// > linha 2 (continua enquanto as linhas começarem com ">")
function findCallouts(docText: string) {
  const results: { tipo: string; headerFrom: number; headerTo: number; from: number; to: number }[] = [];
  const lines = docText.split("\n");
  let offset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^>\s*\[!(\w+)\]\s*$/);

    if (headerMatch) {
      const headerFrom = offset;
      const headerTo = offset + line.length;
      let blockEnd = headerTo;
      let cursor = offset + line.length + 1; // pula a quebra de linha

      // Continua enquanto as próximas linhas também começarem com ">"
      let j = i + 1;
      while (j < lines.length && /^>/.test(lines[j])) {
        blockEnd = cursor + lines[j].length;
        cursor += lines[j].length + 1;
        j++;
      }

      results.push({
        tipo: headerMatch[1],
        headerFrom,
        headerTo,
        from: headerFrom,
        to: blockEnd,
      });

      i = j - 1; // pula as linhas já consumidas pelo bloco
      offset = cursor;
      continue;
    }

    offset += line.length + 1;
  }

  return results;
}

function calloutLineAttrs(tipo: string, position: "single" | "first" | "middle" | "last") {
  const color = calloutColors[tipo] ?? "#888";
  const radius =
    position === "single" ? "8px" :
    position === "first" ? "8px 8px 0 0" :
    position === "last" ? "0 0 8px 8px" :
    "0";

  const border =
    position === "single" ? `border: 1.5px solid ${color};` :
    position === "first" ? `border-left: 1.5px solid ${color}; border-right: 1.5px solid ${color}; border-top: 1.5px solid ${color}; border-bottom: none;` :
    position === "last" ? `border-left: 1.5px solid ${color}; border-right: 1.5px solid ${color}; border-bottom: 1.5px solid ${color}; border-top: none;` :
    `border-left: 1.5px solid ${color}; border-right: 1.5px solid ${color}; border-top: none; border-bottom: none;`;

  return Decoration.line({
    attributes: {
      style: `${border} border-radius: ${radius}; padding: 6px 14px; box-sizing: border-box; background-color: transparent;`,
    },
  });
}

function calloutLabelWidget(tipo: string) {
  const color = calloutColors[tipo] ?? "#888";

  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "6px";
  wrapper.style.marginBottom = "2px";

  const icon = calloutIcons[tipo] ?? `<path d="M18 7v14l-6 -4l-6 4v-14a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4z"/>`;
  wrapper.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`;

  const label = document.createElement("span");
  label.textContent = tipo.toUpperCase();
  label.style.fontWeight = "bold";
  label.style.fontSize = "0.75em";
  label.style.color = color;

  wrapper.appendChild(label);
  return wrapper;
}

class CalloutLabelWidget extends WidgetType {
  constructor(
    private tipo: string,
    private headerFrom: number,
    private headerTo: number
  ) {
    super();
  }
  eq(other: CalloutLabelWidget) {
    return other.tipo === this.tipo && other.headerFrom === this.headerFrom && other.headerTo === this.headerTo;
  }
  toDOM(view: EditorView) {
    const el = calloutLabelWidget(this.tipo);
    // Cabeçalho do callout nunca expõe a sintaxe crua "[!tipo]" — clicar no
    // rótulo reabre o mesmo menu de tipos (CalloutSlashMenu) pra trocar o
    // tipo, já que digitar por cima do texto (antes sempre revelado ao tocar
    // o cursor) deixou de ser possível.
    el.style.cursor = "pointer";
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.dom.dispatchEvent(
        new CustomEvent("callout-label-click", {
          detail: { tipo: this.tipo, headerFrom: this.headerFrom, headerTo: this.headerTo },
          bubbles: true,
        })
      );
    });
    return el;
  }
  ignoreEvent(event: Event) {
    return event.type === "mousedown" || event.type === "click";
  }
}


function underlineMarkFor(tipo: string) {
  const color = underlineColors[tipo] ?? "#666666";
  return Decoration.mark({
    attributes: { style: `text-decoration: underline; text-decoration-color: ${color}; text-decoration-thickness: 2px;` },
  });
}

function wavyUnderlineMarkFor(tipo: string, comentarioId: string) {
  const color = underlineColors[tipo] ?? "#666666";
  // SVG de onda customizada, mais sutil (amplitude baixa) que o "wavy" nativo do navegador.
  // %23 = "#" codificado (necessário dentro de uma data URI).
  const encodedColor = color.replace("#", "%23");
  const svgWave = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='4' viewBox='0 0 6 4'%3E%3Cpath d='M0 2 Q1.5 0.5 3 2 T6 2' stroke='${encodedColor}' fill='none' stroke-width='0.8'/%3E%3C/svg%3E`;
  return Decoration.mark({
    attributes: {
      style: `background-image: url("${svgWave}"); background-repeat: repeat-x; background-position: 0 100%; background-size: 6px 4px; padding-bottom: 2px;`,
      "data-comment-id": comentarioId,
      class: "comment-anchor",
    },
  });
}

function activeCommentMarkFor(tipo: string, comentarioId: string) {
  const color = underlineColors[tipo] ?? "#666666";
  return Decoration.mark({
    attributes: {
      style: `background-color: ${color}; color: white; border-radius: 2px;`,
      class: "comment-anchor",
      "data-comment-id": comentarioId,
    },
  });
}

// Marcador circular (~14px) no fim de um trecho comentado — substitui a antiga
// coluna fixa de balões: clicar nele dispara "comment-marker-click" (ver
// NotePanel.tsx), que abre o painel único de comentários já rolado até o card
// correspondente. Não ocupa espaço além do próprio tamanho (widget inline).
class CommentMarkerWidget extends WidgetType {
  constructor(
    private tipo: string,
    private commentId: string | null
  ) {
    super();
  }

  eq(other: CommentMarkerWidget) {
    return other.tipo === this.tipo && other.commentId === this.commentId;
  }

  toDOM(view: EditorView) {
    const color = underlineColors[this.tipo] ?? "#666666";
    const span = document.createElement("span");
    span.title = "Ver comentário";
    span.style.cssText = `
      display: inline-flex; align-items: center; justify-content: center;
      width: 14px; height: 14px; border-radius: 50%; margin-left: 3px;
      background-color: ${color}; cursor: pointer; vertical-align: middle;
    `;
    span.innerHTML =
      '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

    span.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.dom.dispatchEvent(
        new CustomEvent("comment-marker-click", { detail: { commentId: this.commentId }, bubbles: true })
      );
    });

    return span;
  }

  ignoreEvent(event: Event) {
    return event.type === "mousedown" || event.type === "click";
  }
}

function highlightMarkFor(tipo: string) {
  const color = highlightColors[tipo] ?? "#eeeeee"; // cor neutra se o tipo não existir
  return Decoration.mark({ attributes: { style: `background-color: ${color}; color: #1a1a1a; border-radius: 2px;` } });
}

// Link válido: cor/sublinhado/hover vêm da classe "wiki-link" (ver globals.css).
function wikiLinkMarkFor(filename: string) {
  return Decoration.mark({
    attributes: {
      class: "wiki-link",
      "data-target-filename": filename,
    },
  });
}

// Link quebrado: não corresponde a nenhuma nota (nem por título/alias) — "nota
// fantasma", discreta (cor fraca, sem sublinhado) em vez de aviso chamativo;
// clicar oferece criar a nota (ver wikiLinkClickHandler em page.tsx).
function brokenWikiLinkMarkFor(rawTarget: string) {
  return Decoration.mark({
    attributes: {
      style: "color: var(--text-muted); cursor: pointer; text-decoration: none;",
      class: "wiki-link-broken",
      "data-target-title": rawTarget,
      title: "Nota ainda não existe — clique para criar",
    },
  });
}

// Referência de página válida ([[arquivo#p42]], só PDF — tem página de
// verdade): mesmo estilo do link normal (classe "wiki-page-link", ver
// globals.css), com o dado extra de qual página abrir.
function wikiPageLinkMarkFor(filename: string, pageRaw: string) {
  return Decoration.mark({
    attributes: {
      class: "wiki-page-link",
      "data-target-filename": filename,
      "data-target-page": pageRaw,
    },
  });
}

// Referência de página quebrada: nota não existe (mesmo tratamento de criar
// nota que um link normal quebrado tem).
function brokenWikiPageLinkMarkFor(rawTarget: string) {
  return Decoration.mark({
    attributes: {
      style: "color: var(--text-muted); cursor: pointer; text-decoration: none;",
      class: "wiki-page-link-broken",
      "data-target-title": rawTarget,
      title: "Nota ainda não existe — clique para criar",
    },
  });
}

// Referência de capítulo válida ([[arquivo#cap3]], só EPUB — não tem página
// fixa, mas tem divisão natural em capítulos pelo spine): mesmo estilo do link
// normal (classe "wiki-chapter-link", ver globals.css), com o dado extra de
// qual capítulo abrir (número pela ordem natural do spine, 1-based).
function wikiChapterLinkMarkFor(filename: string, chapterRaw: string) {
  return Decoration.mark({
    attributes: {
      class: "wiki-chapter-link",
      "data-target-filename": filename,
      "data-target-chapter": chapterRaw,
    },
  });
}

// Referência de capítulo quebrada: nota não existe (mesmo tratamento de criar
// nota que um link normal quebrado tem).
function brokenWikiChapterLinkMarkFor(rawTarget: string) {
  return Decoration.mark({
    attributes: {
      style: "color: var(--text-muted); cursor: pointer; text-decoration: none;",
      class: "wiki-chapter-link-broken",
      "data-target-title": rawTarget,
      title: "Nota ainda não existe — clique para criar",
    },
  });
}

// Marcador de nota de rodapé "[^id]": estilo de link (classe "footnote-ref",
// ver globals.css), mas nada precisa ser escondido — o próprio "[^id]" já é o
// texto visível, só fica destacado/clicável. font-size/vertical-align são só
// dela, ficam inline (não fazem parte do estilo compartilhado de link).
function footnoteRefMarkFor(id: string) {
  return Decoration.mark({
    attributes: {
      style: "font-size: 0.8em; vertical-align: super;",
      class: "footnote-ref",
      "data-footnote-id": id,
    },
  });
}

// Timestamp clicável ("mm:ss"/"h:mm:ss"): mesmo estilo de link (classe
// "video-timestamp", ver globals.css). O texto em si já é o "mm:ss" digitado
// — nada precisa ser escondido/revelado, diferente de wiki-link. `seconds` vai
// num data-attribute pro click handler (videoTimestampClickHandler) ler sem
// precisar reparsear o texto.
function timestampMarkFor(seconds: number) {
  return Decoration.mark({
    attributes: {
      class: "video-timestamp",
      "data-timestamp-seconds": String(seconds),
    },
  });
}

// Referência de bloco válida ([[nota#^id]] com bloco encontrado): mesmo estilo
// do link normal (classe "wiki-block-link", ver globals.css), mas com dados
// extras pro clique rolar até o parágrafo.
function blockLinkMarkFor(filename: string, blockId: string) {
  return Decoration.mark({
    attributes: {
      class: "wiki-block-link",
      "data-target-filename": filename,
      "data-target-block": blockId,
    },
  });
}

// Referência de bloco quebrada: nota não existe (data-target-title permite criar,
// igual a um link normal quebrado) ou nota existe mas o ^id não foi encontrado nela
// (nesse caso data-target-filename permite abrir a nota mesmo assim, sem rolar).
function brokenBlockLinkMarkFor(noteRaw: string, blockId: string, noteExists: boolean, noteFilename: string | null) {
  return Decoration.mark({
    attributes: {
      style: "color: var(--text-muted); cursor: pointer; text-decoration: none;",
      class: "wiki-block-link-broken",
      "data-target-title": noteRaw,
      "data-target-filename": noteFilename ?? "",
      "data-target-block": blockId,
      "data-note-exists": noteExists ? "1" : "0",
      title: noteExists ? "Bloco não encontrado nesta nota — clique para abrir a nota" : "Nota ainda não existe — clique para criar",
    },
  });
}

// Marcador "^id" de bloco endereçável: fica sempre visível (nunca escondido, ao
// contrário da sintaxe de comentário), só discreto/menor.
const blockMarkerMark = Decoration.mark({
  attributes: { style: "opacity: 0.5; font-size: 0.85em;" },
});

// Reconhece: ~texto ancorado~¶tipo{comentário}¶id — o "¶id" final é o id da
// linha placeholder em book_comments (só pra ordenar junto com os comentários
// gerais e permitir apagar; opcional no regex pra continuar reconhecendo
// comentários já existentes gravados antes desse id existir — ver
// migrateOldAnchoredComments em NotePanel.tsx).
export const COMMENT_REGEX = /~(.+?)~¶(\w+){([^}]*)}(?:¶(\d+))?/g;

// Reconhece a REFERÊNCIA de nota de rodapé "[^id]" (não a definição "[^id]:",
// que fica de fora via o "(?!:)" — essa continua visível como markdown puro).
const FOOTNOTE_REF_REGEX = /\[\^([^\]]+)\](?!:)/g;

// Reconhece um timestamp "mm:ss" ou "h:mm:ss" solto no texto — sem sintaxe
// nova, é o próprio texto digitado (ex: "12:34" ou "1:02:03") que vira link
// clicável (ver timestampMarkFor/videoTimestampClickHandler). Segundos (e
// minutos, quando há horas) sempre com 2 dígitos 0-59 — isso já exclui coisas
// como "16:9" (proporção) de virarem timestamp por engano.
const TIMESTAMP_REGEX = /\b(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)\b/g;


// Reconhece: ==texto destacado==§tipo
export const HIGHLIGHT_REGEX = /==(.+?)==§(\w+)(:sub)?/g;

class HighlightIconWidget extends WidgetType {
  constructor(
    private tipo: string,
    private modo: "fundo" | "sublinhado",
    private from: number,
    private to: number
  ) {
    super();
  }

  eq(other: HighlightIconWidget) {
    return other.tipo === this.tipo && other.modo === this.modo && other.from === this.from && other.to === this.to;
  }

  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.textContent = "●";
    span.title = `${this.tipo} (${this.modo}) — clique para editar`;
    span.style.cursor = "pointer";
    span.style.fontSize = "1em";
    span.style.marginLeft = "3px";
    span.style.padding = "0 3px";
    span.style.color = this.modo === "fundo" ? highlightColors[this.tipo] : underlineColors[this.tipo];
    span.style.fontWeight = "bold";
    span.style.userSelect = "none";

    // mousedown em vez de click: dispara antes do CodeMirror processar
    // o clique como posicionamento de cursor, evitando a corrida de eventos.
    span.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.dom.dispatchEvent(
        new CustomEvent("highlight-icon-click", {
          detail: { tipo: this.tipo, modo: this.modo, from: this.from, to: this.to },
          bubbles: true,
        })
      );
    });

    return span;
  }

  ignoreEvent(event: Event) {
    // Garante que QUALQUER evento de mouse/clique dentro do widget
    // seja ignorado pelo CodeMirror (não move o cursor).
    return event.type === "mousedown" || event.type === "click";
  }
}

class BulletWidget extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.textContent = "•";
    span.style.color = "var(--text-muted)";
    span.style.paddingRight = "0.3em";
    return span;
  }
}
class CheckboxWidget extends WidgetType {
  constructor(
    private checked: boolean,
    private pos: number // posição no documento onde está o "[ ]" ou "[x]"
  ) {
    super();
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.pos === this.pos;
  }

  toDOM(view: EditorView) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.style.marginRight = "0.4em";
    input.style.cursor = "pointer";

    input.addEventListener("click", (e) => {
      e.preventDefault(); // evita comportamento padrão do navegador no checkbox
      const newText = this.checked ? "[ ]" : "[x]";
      view.dispatch({
        changes: { from: this.pos, to: this.pos + 3, insert: newText },
      });
    });

    return input;
  }

  ignoreEvent() {
    return false; // permite que o clique no widget seja processado normalmente
  }
}

// Imagem inserida na nota ("![alt](caminho)§size:N§shape:tipo§wrap:tipo") —
// sempre renderizada (não alterna com a sintaxe bruta como highlight/
// comentário, já que não faz sentido editar uma imagem caractere por
// caractere). Clique dispara "image-click" em view.dom (mesmo padrão de
// HighlightIconWidget), pra abrir o painel de tamanho/recorte em page.tsx —
// agora um popup flutuante ancorado na própria imagem, não mais fixo no topo
// da nota (ver NotePanel.tsx), por isso o detail do evento inclui a posição
// na tela de onde o clique partiu.
class ImageWidget extends WidgetType {
  constructor(
    private alt: string,
    private srcPath: string,
    private size: number,
    private shape: ImageShape,
    private align: ImageAlign,
    private wrap: ImageWrap,
    private from: number,
    private to: number,
    private selected: boolean
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return (
      other.alt === this.alt &&
      other.srcPath === this.srcPath &&
      other.size === this.size &&
      other.shape === this.shape &&
      other.align === this.align &&
      other.wrap === this.wrap &&
      other.from === this.from &&
      other.to === this.to &&
      other.selected === this.selected
    );
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("span");
    // "block" (não "inline-block"): precisa de uma largura própria pra
    // moldura/imagem acompanharem o slider de tamanho juntas — um
    // inline-block sem largura definida vira "shrink-to-fit" (colapsa pro
    // tamanho intrínseco do conteúdo) em vez de assumir "size%" do container.
    // É essa largura do wrapper (não a do <img>) que define o tamanho visível
    // do card inteiro; o <img> só preenche 100% dela.
    wrapper.style.display = "block";
    wrapper.style.width = `${this.size}%`;
    wrapper.style.maxWidth = "100%";
    if (this.wrap === "none") {
      wrapper.style.marginLeft = this.align === "left" ? "0" : "auto";
      wrapper.style.marginRight = this.align === "right" ? "0" : "auto";
    } else {
      // "wrap" é nomeado pela perspectiva do TEXTO (ver ImageWrap em
      // imageSyntax.ts) — "right" (texto à direita) floata a imagem à
      // esquerda, "left" (texto à esquerda) floata à direita. Margem fixa dos
      // dois lados (não tenta acompanhar contorno circular/oval — sem
      // shape-outside de propósito, ver plano).
      wrapper.style.float = this.wrap === "right" ? "left" : "right";
      wrapper.style.marginLeft = this.wrap === "right" ? "0" : "1rem";
      wrapper.style.marginRight = this.wrap === "right" ? "1rem" : "0";
      wrapper.style.marginBottom = "0.5rem";
    }
    if (this.selected) {
      wrapper.style.outline = "2px solid var(--accent)";
      wrapper.style.outlineOffset = "2px";
      wrapper.style.borderRadius = this.shape === "circle" || this.shape === "oval" ? "50%" : "4px";
    }

    const img = document.createElement("img");
    // Imagem de artigo importado da web referencia a URL original do site
    // direto (nunca baixada) — só caminhos locais passam pelo endpoint de anexos.
    const isExternal = /^https?:\/\//i.test(this.srcPath);
    if (isExternal) {
      img.src = this.srcPath;
    } else {
      const basename = this.srcPath.split("/").pop() ?? this.srcPath;
      img.src = `/api/attachments/${encodeURIComponent(basename)}?vault=${encodeURIComponent(activeVaultId ?? "")}`;
    }
    img.alt = this.alt;
    img.style.width = "100%";
    img.style.height = "auto";
    img.style.display = "block";
    img.style.cursor = "pointer";

    if (this.shape === "square" || this.shape === "circle") {
      img.style.aspectRatio = "1 / 1";
      img.style.objectFit = "cover";
    }
    if (this.shape === "circle" || this.shape === "oval") {
      img.style.borderRadius = "50%";
    }

    wrapper.appendChild(img);

    wrapper.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = wrapper.getBoundingClientRect();
      view.dom.dispatchEvent(
        new CustomEvent("image-click", {
          detail: {
            alt: this.alt,
            path: this.srcPath,
            size: this.size,
            shape: this.shape,
            align: this.align,
            wrap: this.wrap,
            from: this.from,
            to: this.to,
            // Ancora o popup flutuante de controles logo abaixo da imagem,
            // não mais fixo no topo da nota (ver NotePanel.tsx) — mesmo
            // offset de 6px já usado pelos outros popups ancorados do app.
            anchor: { x: rect.left, y: rect.bottom + 6 },
          },
          bubbles: true,
        })
      );
    });

    return wrapper;
  }

  ignoreEvent(event: Event) {
    return event.type === "mousedown" || event.type === "click";
  }
}

// Embed de vídeo (YouTube/Vimeo) — a linha inteira com a URL crua (ver
// parseVideoEmbedUrl em videoEmbed.ts) vira um player embutido, só
// referenciando a URL original (nada baixado/armazenado no vault, mesmo
// princípio já usado pra imagens de artigo importado da web). Decoração de
// bloco (block: true), então é aplicada em buildCodeBlockDecorations junto
// com blocos de código/Mermaid — não pode vir do ViewPlugin principal.
class VideoEmbedWidget extends WidgetType {
  constructor(
    private embedUrl: string,
    private provider: "youtube" | "vimeo",
    private from: number
  ) {
    super();
  }

  eq(other: VideoEmbedWidget) {
    return other.embedUrl === this.embedUrl && other.provider === this.provider && other.from === this.from;
  }

  toDOM() {
    const container = document.createElement("div");
    container.style.background = "var(--panel-bg)";
    container.style.border = "1px solid var(--panel-border)";
    container.style.borderRadius = "8px";
    container.style.padding = "0.5rem";
    container.style.margin = "0.4rem 0";
    // Lidos por videoTimestampClickHandler pra achar "o vídeo mais próximo
    // acima" de um timestamp clicado, sem precisar cruzar dado com o
    // StateField principal (que é onde os timestamps são decorados) na hora
    // de construir a decoração — resolvido só em tempo de clique, direto no DOM.
    container.dataset.videoEmbedFrom = String(this.from);
    container.dataset.videoProvider = this.provider;

    const frameWrap = document.createElement("div");
    frameWrap.style.position = "relative";
    frameWrap.style.width = "100%";
    frameWrap.style.aspectRatio = "16 / 9";

    const iframe = document.createElement("iframe");
    iframe.src = this.embedUrl;
    iframe.style.position = "absolute";
    iframe.style.inset = "0";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    iframe.style.borderRadius = "4px";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;

    frameWrap.appendChild(iframe);
    container.appendChild(frameWrap);
    return container;
  }

  ignoreEvent() {
    return false;
  }
}

// Manda o comando de "pular pro tempo X" direto pro protocolo de postMessage
// já documentado de cada player, sem carregar nenhum SDK externo
// (iframe_api.js/player.js) — evita dependência de rede extra só pra isso,
// mesmo espírito de "só referencia a URL" do embed. Não recarrega o iframe.
function seekEmbeddedVideo(iframe: HTMLIFrameElement, provider: string, seconds: number) {
  if (!iframe.contentWindow) return;
  if (provider === "youtube") {
    iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [seconds, true] }), "*");
    iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*");
  } else if (provider === "vimeo") {
    iframe.contentWindow.postMessage(JSON.stringify({ method: "setCurrentTime", value: seconds }), "*");
    iframe.contentWindow.postMessage(JSON.stringify({ method: "play" }), "*");
  }
}

// Clique num timestamp (".video-timestamp", ver timestampMarkFor): acha o
// embed de vídeo mais próximo ACIMA dele no documento (maior
// data-video-embed-from que ainda seja <= a posição clicada — cobre bem o
// caso de vários vídeos na mesma nota) e manda pular pro tempo certo. Sem
// estado React nenhum (só DOM), por isso pode ficar self-contained aqui — só
// precisa entrar no array de extensions do CodeMirror em NotePanel.tsx.
export const videoTimestampClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target as HTMLElement;
    const tsEl = target.closest(".video-timestamp") as HTMLElement | null;
    if (!tsEl) return false;
    const seconds = Number(tsEl.getAttribute("data-timestamp-seconds"));
    if (Number.isNaN(seconds)) return false;

    const pos = view.posAtDOM(tsEl);
    const wraps = view.dom.querySelectorAll<HTMLElement>("[data-video-embed-from]");
    let bestFrom = -1;
    let bestIframe: HTMLIFrameElement | null = null;
    let bestProvider = "";
    for (const wrap of wraps) {
      const from = Number(wrap.getAttribute("data-video-embed-from"));
      if (from > pos || from <= bestFrom) continue;
      const iframe = wrap.querySelector("iframe");
      if (!iframe) continue;
      bestFrom = from;
      bestIframe = iframe;
      bestProvider = wrap.getAttribute("data-video-provider") ?? "";
    }
    if (!bestIframe) return false;

    seekEmbeddedVideo(bestIframe, bestProvider, seconds);
    event.preventDefault();
    return true;
  },
});

// Rastreia qual imagem está selecionada (painel de tamanho/recorte aberto),
// pra desenhar o contorno de destaque nela — mesmo padrão do
// activeCommentField, só que guardando a posição em vez de um id.
export const setSelectedImageEffect = StateEffect.define<{ from: number; to: number } | null>();

export const selectedImageField = StateField.define<{ from: number; to: number } | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSelectedImageEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

// Mecanismo para "avisar" o editor qual comentário está ativo (hover no balão)
export const setActiveCommentEffect = StateEffect.define<string | null>();

export const activeCommentField = StateField.define<string | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setActiveCommentEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

// Menu inline de slash-command (`/callout`): abre quando o texto de uma linha
// é exatamente "/callout" com o cursor no final dela.
export type SlashMenuState = {
  open: boolean;
  from: number;
  to: number;
  selectedIndex: number;
  dismissed: boolean;
} | null;

export const setSlashMenuEffect = StateEffect.define<
  { type: "setIndex"; index: number } | { type: "close" }
>();

export const slashMenuField = StateField.define<SlashMenuState>({
  create() {
    return null;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSlashMenuEffect)) {
        const e = effect.value;
        if (e.type === "close") {
          return value ? { ...value, open: false, dismissed: true } : value;
        }
        if (e.type === "setIndex" && value) {
          return { ...value, selectedIndex: e.index };
        }
      }
    }

    // Nada relevante mudou (ex: só um efeito de foco) — não recalcula.
    if (!tr.docChanged && tr.startState.selection.eq(tr.newSelection)) {
      return value;
    }

    const pos = tr.state.selection.main.head;
    const line = tr.state.doc.lineAt(pos);

    if (line.text === "/callout" && pos === line.to) {
      // Se foi dispensado (Esc) e o texto/posição não mudaram, continua fechado.
      if (value && value.dismissed && value.from === line.from && value.to === line.to) {
        return value;
      }
      // Já está aberto na mesma posição — devolve a MESMA referência (mantém
      // o selectedIndex atual, de navegação por seta) em vez de um objeto
      // novo com valores equivalentes. Cada transação nessa mesma linha
      // (inclusive as disparadas por re-renders não relacionados, já que os
      // plugins de extensão são recriados a cada render do React) recalcula
      // esse campo; devolver sempre um objeto novo faz o slashMenuWatcher
      // achar que o estado "mudou" pra sempre, disparando setState em loop
      // (Maximum update depth exceeded).
      if (value && value.open && !value.dismissed && value.from === line.from && value.to === line.to) {
        return value;
      }
      return { open: true, from: line.from, to: line.to, selectedIndex: 0, dismissed: false };
    }

    return null;
  },
});

// Keymap com prioridade máxima: precisa vencer o keymap padrão/autocomplete
// do basicSetup (que também é Prec.highest) para capturar as setas/Enter/Esc
// enquanto o menu de callout estiver aberto; quando fechado, devolve `false`
// e deixa o comportamento padrão do editor seguir normalmente.
export function createCalloutSlashKeymap(
  types: string[],
  onConfirm: (tipo: string, range: { from: number; to: number }) => void
) {
  return Prec.highest(
    keymap.of([
      {
        key: "ArrowDown",
        run(view) {
          const menu = view.state.field(slashMenuField, false);
          if (!menu || !menu.open) return false;
          const nextIndex = (menu.selectedIndex + 1) % types.length;
          view.dispatch({ effects: setSlashMenuEffect.of({ type: "setIndex", index: nextIndex }) });
          return true;
        },
      },
      {
        key: "ArrowUp",
        run(view) {
          const menu = view.state.field(slashMenuField, false);
          if (!menu || !menu.open) return false;
          const nextIndex = (menu.selectedIndex - 1 + types.length) % types.length;
          view.dispatch({ effects: setSlashMenuEffect.of({ type: "setIndex", index: nextIndex }) });
          return true;
        },
      },
      {
        key: "Enter",
        run(view) {
          const menu = view.state.field(slashMenuField, false);
          if (!menu || !menu.open) return false;
          onConfirm(types[menu.selectedIndex], { from: menu.from, to: menu.to });
          return true;
        },
      },
      {
        key: "Escape",
        run(view) {
          const menu = view.state.field(slashMenuField, false);
          if (!menu || !menu.open) return false;
          view.dispatch({ effects: setSlashMenuEffect.of({ type: "close" }) });
          return true;
        },
      },
    ])
  );
}

// Mapa de alvos de link válidos (chave normalizada: nome de arquivo sem .md,
// título ou alias, tudo em minúsculo -> {filename, title}), populado a partir de
// /api/note-targets. Igual ao activeCommentField: estado externo que o decorator
// precisa ler durante buildDecorations.
export type LinkTargetsMap = Map<string, { filename: string; title: string }>;

export const setLinkTargetsEffect = StateEffect.define<LinkTargetsMap>();

export const linkTargetsField = StateField.define<LinkTargetsMap>({
  create() {
    return new Map();
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLinkTargetsEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

// Mapa de referências de bloco já resolvidas (chave: "noteRaw em minúsculo::blockId"),
// populado a partir de /api/blocks. Mesmo papel que linkTargetsField, mas pra
// "[[nota#^id]]"/"![[nota#^id]]" — precisa do texto do bloco (pro embed), não só
// se resolve ou não.
export type BlockRefInfo = {
  noteExists: boolean;
  noteFilename: string | null;
  noteTitle: string | null;
  blockFound: boolean;
  text: string | null;
};
export type BlockRefsMap = Map<string, BlockRefInfo>;

export function blockRefKey(noteRaw: string, blockId: string): string {
  return `${noteRaw.toLowerCase()}::${blockId.toLowerCase()}`;
}

export const setBlockRefsEffect = StateEffect.define<BlockRefsMap>();

export const blockRefsField = StateField.define<BlockRefsMap>({
  create() {
    return new Map();
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setBlockRefsEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

// Menu inline de autocomplete pra "[[": abre enquanto o cursor estiver logo após
// um "[[" ainda não fechado por "]]" na mesma linha; o texto entre os dois vira o
// filtro ao vivo. Diferente do menu de "/callout" (que exige a linha inteira igual
// a um texto fixo), aqui o "from" fica fixo (posição logo após "[[") e "to"/"query"
// avançam a cada tecla digitada.
export type WikiLinkMenuState = {
  open: boolean;
  from: number;
  to: number;
  query: string;
  selectedIndex: number;
  dismissed: boolean;
} | null;

export const setWikiLinkMenuEffect = StateEffect.define<
  { type: "setIndex"; index: number } | { type: "close" }
>();

export const wikiLinkMenuField = StateField.define<WikiLinkMenuState>({
  create() {
    return null;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setWikiLinkMenuEffect)) {
        const e = effect.value;
        if (e.type === "close") {
          return value ? { ...value, open: false, dismissed: true } : value;
        }
        if (e.type === "setIndex" && value) {
          return { ...value, selectedIndex: e.index };
        }
      }
    }

    if (!tr.docChanged && tr.startState.selection.eq(tr.newSelection)) {
      return value;
    }

    const pos = tr.state.selection.main.head;
    const line = tr.state.doc.lineAt(pos);
    const textBeforeCursor = line.text.slice(0, pos - line.from);
    const lastOpen = textBeforeCursor.lastIndexOf("[[");
    const lastClose = textBeforeCursor.lastIndexOf("]]");

    if (lastOpen !== -1 && lastOpen > lastClose) {
      const from = line.from + lastOpen + 2;
      const to = pos;
      const query = textBeforeCursor.slice(lastOpen + 2);

      // Se foi dispensado (Esc) nesse mesmo ponto de gatilho, continua fechado
      // enquanto o usuário continuar digitando ali (mesma posição "from").
      if (value && value.dismissed && value.from === from) {
        return { ...value, to, query, dismissed: true, open: false };
      }
      return { open: true, from, to, query, selectedIndex: 0, dismissed: false };
    }

    return null;
  },
});

// Keymap com prioridade máxima, mesmo motivo do keymap de callout: precisa vencer
// o keymap padrão/autocomplete do basicSetup pra capturar setas/Enter/Esc enquanto
// o menu estiver aberto.
export function createWikiLinkKeymap(
  getSuggestions: (query: string) => { label: string; filename: string }[],
  onConfirm: (item: { label: string; filename: string }, range: { from: number; to: number }) => void
) {
  return Prec.highest(
    keymap.of([
      {
        key: "ArrowDown",
        run(view) {
          const menu = view.state.field(wikiLinkMenuField, false);
          if (!menu || !menu.open) return false;
          const items = getSuggestions(menu.query);
          if (items.length === 0) return true;
          const nextIndex = (menu.selectedIndex + 1) % items.length;
          view.dispatch({ effects: setWikiLinkMenuEffect.of({ type: "setIndex", index: nextIndex }) });
          return true;
        },
      },
      {
        key: "ArrowUp",
        run(view) {
          const menu = view.state.field(wikiLinkMenuField, false);
          if (!menu || !menu.open) return false;
          const items = getSuggestions(menu.query);
          if (items.length === 0) return true;
          const nextIndex = (menu.selectedIndex - 1 + items.length) % items.length;
          view.dispatch({ effects: setWikiLinkMenuEffect.of({ type: "setIndex", index: nextIndex }) });
          return true;
        },
      },
      {
        key: "Enter",
        run(view) {
          const menu = view.state.field(wikiLinkMenuField, false);
          if (!menu || !menu.open) return false;
          const items = getSuggestions(menu.query);
          if (items.length === 0) return false;
          const item = items[Math.min(menu.selectedIndex, items.length - 1)];
          onConfirm(item, { from: menu.from, to: menu.to });
          return true;
        },
      },
      {
        key: "Escape",
        run(view) {
          const menu = view.state.field(wikiLinkMenuField, false);
          if (!menu || !menu.open) return false;
          view.dispatch({ effects: setWikiLinkMenuEffect.of({ type: "close" }) });
          return true;
        },
      },
    ])
  );
}


// Tab/Shift-Tab dentro de um item de lista aumenta/diminui o nível de
// aninhamento — não existia nenhum atalho de Tab no editor antes disso (Tab
// fora de uma lista continua sem fazer nada aqui, deixando o navegador tirar
// o foco do editor, comportamento padrão). 4 espaços por nível: suficiente
// pra ultrapassar o limiar de continuação do CommonMark tanto pra marcadores
// "-"/"*" (2 colunas) quanto pra a maioria dos numerados ("1."/"99.", 3-4
// colunas), então dispara o reconhecimento de aninhamento pelo parser de
// forma confiável. A profundidade visual (padding-left/linha-guia, ver
// buildListGuideStyle) vem da árvore de sintaxe, não da contagem de espaços
// — então um Tab pode "não fazer nada visualmente" se não houver
// item-irmão anterior pra aninhar sob; isso é o parser funcionando certo,
// não um bug. Escopo: só a linha do cursor, sem indentar seleção múltipla.
const LIST_TAB_INDENT = "    ";

export const listIndentKeymap = Prec.highest(
  keymap.of([
    {
      key: "Tab",
      run(view) {
        const pos = view.state.selection.main.head;
        if (listItemDepthAt(view, pos) === 0) return false;
        const line = view.state.doc.lineAt(pos);
        view.dispatch({
          changes: { from: line.from, insert: LIST_TAB_INDENT },
          selection: { anchor: pos + LIST_TAB_INDENT.length },
        });
        return true;
      },
    },
    {
      key: "Shift-Tab",
      run(view) {
        const pos = view.state.selection.main.head;
        if (listItemDepthAt(view, pos) === 0) return false;
        const line = view.state.doc.lineAt(pos);
        const leadingMatch = /^ */.exec(line.text);
        const removeLen = Math.min(LIST_TAB_INDENT.length, leadingMatch ? leadingMatch[0].length : 0);
        if (removeLen === 0) return true; // já sem recuo — consome o evento, mas não faz nada
        view.dispatch({
          changes: { from: line.from, to: line.from + removeLen, insert: "" },
          selection: { anchor: Math.max(line.from, pos - removeLen) },
        });
        return true;
      },
    },
  ])
);

const bulletReplace = Decoration.replace({ widget: new BulletWidget() });

// Decoration que "esconde" um trecho (os símbolos ** ou #, por exemplo)
const hideMark = Decoration.replace({});

// Verifica se o cursor (ou alguma seleção) toca o intervalo [from, to]
function cursorTouches(view: EditorView, from: number, to: number): boolean {
  for (const range of view.state.selection.ranges) {
    if (range.from <= to && range.to >= from) {
      return true;
    }
  }
  return false;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Renderização estática (não interativa) do texto de um parágrafo embutido: só as
// regras inline que fazem sentido num trecho somente-leitura — negrito, itálico e
// highlight/sublinhado (==texto==§tipo). Comentários não fazem sentido aqui (são
// ancorados no parágrafo original, não fariam sentido duplicados no card).
function renderEmbedBodyHtml(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/==(.+?)==§(\w+)(:sub)?/g, (_match, inner: string, tipo: string, isSub: string) => {
    if (isSub) {
      const color = underlineColors[tipo] ?? "#666666";
      return `<span style="text-decoration: underline; text-decoration-color: ${color}; text-decoration-thickness: 2px;">${inner}</span>`;
    }
    const color = highlightColors[tipo] ?? "#eeeeee";
    return `<span style="background-color: ${color}; color: #1a1a1a; border-radius: 2px;">${inner}</span>`;
  });
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  return html;
}

// Embed de bloco (![[nota#^id]]): card somente leitura com legenda, conteúdo do
// parágrafo referenciado e rodapé pra navegar até a nota original.
class BlockEmbedWidget extends WidgetType {
  constructor(private info: BlockRefInfo) {
    super();
  }

  eq(other: BlockEmbedWidget) {
    return (
      other.info.noteExists === this.info.noteExists &&
      other.info.noteFilename === this.info.noteFilename &&
      other.info.blockFound === this.info.blockFound &&
      other.info.text === this.info.text
    );
  }

  toDOM(view: EditorView) {
    const found = this.info.blockFound;
    const borderColor = found ? "#888" : "#d04444";

    const wrapper = document.createElement("div");
    wrapper.style.cssText = `border: 1.5px solid ${borderColor}; border-radius: 8px; padding: 6px 14px; margin: 2px 0; box-sizing: border-box;`;

    const header = document.createElement("div");
    header.style.cssText =
      "display: flex; align-items: center; gap: 6px; font-size: 0.75em; color: var(--text-muted); margin-bottom: 4px;";
    header.innerHTML = `<span>&#10077;</span><span>bloco embutido</span>`;
    wrapper.appendChild(header);

    const body = document.createElement("div");
    if (found) {
      body.innerHTML = renderEmbedBodyHtml(this.info.text ?? "");
    } else {
      body.textContent = "bloco não encontrado";
      body.style.color = "#d04444";
      body.style.fontStyle = "italic";
    }
    wrapper.appendChild(body);

    if (this.info.noteExists) {
      const footer = document.createElement("div");
      footer.style.cssText =
        "display: flex; align-items: center; gap: 4px; font-size: 0.75em; color: var(--text-muted); margin-top: 6px; cursor: pointer;";
      footer.innerHTML = `<span>&#8599;</span><span>${escapeHtml(this.info.noteTitle ?? this.info.noteFilename ?? "")}</span>`;
      footer.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        view.dom.dispatchEvent(
          new CustomEvent("block-embed-open", { detail: { filename: this.info.noteFilename }, bubbles: true })
        );
      });
      wrapper.appendChild(footer);
    }

    return wrapper;
  }

  ignoreEvent() {
    return true;
  }
}

// Recuo fixo (estilo Obsidian) por nível de lista aninhada — independente da
// contagem de espaços no texto ou da fonte escolhida (as 5 fontes de
// fonts.ts são proporcionais, não monoespaçadas, então espaço em branco cru
// nunca teria largura fixa por conta própria). LIST_GUIDE_OFFSET é onde,
// dentro de cada coluna de 54px, a linha vertical fica (roughly onde um
// marcador de bullet aninhado apareceria) — ajustado visualmente, não deriva
// de nada.
const LIST_INDENT_PX = 54;
const LIST_GUIDE_OFFSET_PX = 9;
const LIST_GUIDE_TICK_WIDTH_PX = 20;
const LIST_GUIDE_COLOR = "var(--panel-border)";

// Profundidade de aninhamento de listas na posição `pos`: conta quantos nós
// ListItem existem entre o nó mais interno ali e a raiz, usando o entendimento
// do próprio parser (CommonMark-aware) em vez de contar espaços — funciona
// mesmo em notas antigas com indentação irregular (2 espaços, tabs, etc.),
// sem precisar de nenhuma "correção". 0 = fora de qualquer lista; 1 = primeiro
// nível (sem recuo visual); 2+ = níveis aninhados (recebem padding-left e
// linha-guia abaixo).
// `side`: -1 resolve pro nó que TERMINA em `pos` (certo pra checar onde o
// cursor está — ele quase sempre fica no fim do que acabou de ser digitado);
// 1 resolve pro nó que COMEÇA em `pos` (certo pro início de uma linha, ver
// uso abaixo). Usar o lado errado pode resolver pro nó VIZINHO (fora do
// ListItem) bem na borda entre eles — foi exatamente esse bug que apareceu
// ao testar o Tab com o cursor no fim da linha.
function listItemDepthAt(view: EditorView, pos: number, side: -1 | 1 = -1): number {
  let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, side);
  let depth = 0;
  while (node) {
    if (node.name === "ListItem") depth++;
    node = node.parent;
  }
  return depth;
}

// Um único `style` combinado (mesmo padrão de calloutLineAttrs): padding-left
// fixo pelo nível + uma linha vertical por nível ancestral (a "coluna" de
// cada pai, corrida por toda a altura da linha — simplificação aceita pra v1:
// não para exatamente no último filho de cada pai, exigiria olhar os irmãos
// seguintes) + um traço horizontal curto no próprio nível do item, conectando
// a última linha vertical (a coluna do pai imediato) até o marcador — o
// "elbow" que indica onde este item se conecta. Tudo via `background-image`
// em camadas (múltiplos `linear-gradient` de 1px, cada um só na posição
// exata) — a única forma de desenhar várias linhas finas posicionadas com
// precisão dentro de um único atributo `style` de linha, sem introduzir
// classes/pseudo-elementos CSS novos.
function buildListGuideStyle(nestingLevel: number): string {
  // nestingLevel = listItemDepthAt() - 1: 0 no primeiro nível (sem recuo).
  if (nestingLevel <= 0) return "";

  const layers: string[] = [];
  const sizes: string[] = [];
  const positions: string[] = [];

  for (let level = 0; level < nestingLevel; level++) {
    layers.push(`linear-gradient(${LIST_GUIDE_COLOR}, ${LIST_GUIDE_COLOR})`);
    sizes.push("1px 100%");
    positions.push(`${level * LIST_INDENT_PX + LIST_GUIDE_OFFSET_PX}px 0`);
  }

  // Traço horizontal: da última coluna (pai imediato) até perto do marcador.
  layers.push(`linear-gradient(${LIST_GUIDE_COLOR}, ${LIST_GUIDE_COLOR})`);
  sizes.push(`${LIST_GUIDE_TICK_WIDTH_PX}px 1px`);
  positions.push(`${(nestingLevel - 1) * LIST_INDENT_PX + LIST_GUIDE_OFFSET_PX}px 50%`);

  return (
    `padding-left: ${nestingLevel * LIST_INDENT_PX}px; ` +
    `background-image: ${layers.join(", ")}; ` +
    `background-size: ${sizes.join(", ")}; ` +
    `background-position: ${positions.join(", ")}; ` +
    `background-repeat: no-repeat;`
  );
}

function buildDecorations(view: EditorView): DecorationSet {
  type Entry = { from: number; to: number; decoration: Decoration };
  const entries: Entry[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        // --- NEGRITO ---
        if (node.name === "StrongEmphasis") {
          const editing = cursorTouches(view, node.from, node.to);
          if (editing) {
            entries.push({ from: node.from, to: node.to, decoration: boldMark });
          } else {
            entries.push({ from: node.from, to: node.from + 2, decoration: hideMark });
            entries.push({ from: node.from + 2, to: node.to - 2, decoration: boldMark });
            entries.push({ from: node.to - 2, to: node.to, decoration: hideMark });
          }
        }

        // --- ITÁLICO ---
        if (node.name === "Emphasis") {
          const editing = cursorTouches(view, node.from, node.to);
          if (editing) {
            entries.push({ from: node.from, to: node.to, decoration: italicMark });
          } else {
            entries.push({ from: node.from, to: node.from + 1, decoration: hideMark });
            entries.push({ from: node.from + 1, to: node.to - 1, decoration: italicMark });
            entries.push({ from: node.to - 1, to: node.to, decoration: hideMark });
          }
        }

        // --- TÍTULOS (6 níveis) ---
        const headingMatch = node.name.match(/^ATXHeading(\d)$/);
        if (headingMatch) {
          const level = parseInt(headingMatch[1], 10);
          const mark = headingMarks[level - 1];
          const editing = cursorTouches(view, node.from, node.to);
          const markerLength = level + 1;

          if (editing) {
            entries.push({ from: node.from, to: node.to, decoration: mark });
          } else {
            entries.push({ from: node.from, to: node.from + markerLength, decoration: hideMark });
            entries.push({ from: node.from + markerLength, to: node.to, decoration: mark });
          }
        }

        // --- BULLET POINTS / TASK ---
        if (node.name === "ListMark") {
          const markerText = view.state.doc.sliceString(node.from, node.to);
          const isBulletChar = markerText === "-" || markerText === "*" || markerText === "+";
          const restOfLine = view.state.doc.sliceString(node.to, node.to + 4);
          const isTaskItem = /^\s?\[[ xX]\]/.test(restOfLine);

          if (isBulletChar) {
            const editing = cursorTouches(view, node.from, node.to);
            if (!editing) {
              entries.push({
                from: node.from,
                to: node.to,
                decoration: isTaskItem ? hideMark : bulletReplace,
              });
            }
          }

          // Esconde o espaço em branco cru antes do marcador — o recuo fixo
          // (padding-left, ver buildListGuideStyle abaixo) já cuida da
          // posição visual, então esse espaço só serviria pra "empurrar"
          // duas vezes. Só quando o cursor não está tocando a linha (mesma
          // convenção de negrito/itálico/heading acima): esconder pra
          // sempre tornaria Backspace/edição manual do recuo praticamente
          // inutilizável em notas com indentação irregular, já que o cursor
          // pode ficar logicamente dentro do intervalo escondido sem
          // nenhuma pista visual de quanto ainda há ali.
          const markerLine = view.state.doc.lineAt(node.from);
          if (node.from > markerLine.from && !cursorTouches(view, markerLine.from, node.from)) {
            entries.push({ from: markerLine.from, to: node.from, decoration: hideMark });
          }
        }

        // --- CHECKBOX (task list) ---
        if (node.name === "TaskMarker") {
          const markerText = view.state.doc.sliceString(node.from, node.to);
          const checked = markerText === "[x]" || markerText === "[X]";
          const widget = new CheckboxWidget(checked, node.from);
          entries.push({ from: node.from, to: node.to, decoration: Decoration.replace({ widget }) });
        }
      },
    });

    // --- RECUO + LINHA-GUIA DE LISTA ANINHADA — por LINHA visível, não por
    // entrada/saída de ListItem na árvore: cobre corretamente linhas de
    // continuação (item com mais de um parágrafo) que pertencem ao mesmo
    // ListItem mas não têm nenhum ListMark nelas. Ver buildListGuideStyle.
    {
      let linePos = from;
      while (linePos <= to) {
        const line = view.state.doc.lineAt(linePos);
        // Resolve no FIM da linha (não no início) — resolver dentro do
        // espaço em branco inicial de uma linha aninhada faz o parser
        // enxergar uma posição ainda "de fora" do ListItem mais interno
        // (a estrutura aninhada só começa depois de toda a indentação).
        const nestingLevel = listItemDepthAt(view, line.to, -1) - 1;
        if (nestingLevel > 0) {
          const style = buildListGuideStyle(nestingLevel);
          if (style) {
            entries.push({ from: line.from, to: line.from, decoration: Decoration.line({ attributes: { style } }) });
          }
        }
        if (line.to >= to) break;
        linePos = line.to + 1;
      }
    }

    // --- HIGHLIGHT (==texto==§tipo) e SUBLINHADO (==texto==§tipo:sub) — via regex ---
    const text = view.state.doc.sliceString(from, to);
    let match: RegExpExecArray | null;
    HIGHLIGHT_REGEX.lastIndex = 0;
    while ((match = HIGHLIGHT_REGEX.exec(text)) !== null) {
      const fullStart = from + match.index;
      const fullEnd = fullStart + match[0].length;
      const innerText = match[1];
      const tipo = match[2];
      const isSub = Boolean(match[3]); // ":sub" presente?

      const innerStart = fullStart + 2; // depois do "=="
      const innerEnd = innerStart + innerText.length;
      const suffixEnd = fullEnd; // até o fim de "§tipo" ou "§tipo:sub"

      const mark = isSub ? underlineMarkFor(tipo) : highlightMarkFor(tipo);
      const iconWidget = new HighlightIconWidget(tipo, isSub ? "sublinhado" : "fundo", fullStart, suffixEnd);

      // Destaque/sublinhado nunca expõe a sintaxe bruta — sempre escondida,
      // mesmo com o cursor em cima (estilo Word, não Obsidian). Editar/remover
      // continua acessível clicando no ícone (●), que reabre o menu de marcação.
      entries.push({ from: fullStart, to: innerStart, decoration: hideMark });
      entries.push({ from: innerStart, to: innerEnd, decoration: mark });
      entries.push({ from: innerEnd, to: suffixEnd, decoration: hideMark });
      entries.push({ from: suffixEnd, to: suffixEnd, decoration: Decoration.widget({ widget: iconWidget, side: 1 }) });
    }
    // --- COMENTÁRIO ANCORADO (~texto~¶tipo{comentário}¶id) — sempre escondido ---
    COMMENT_REGEX.lastIndex = 0;
    let commentMatch: RegExpExecArray | null;
    while ((commentMatch = COMMENT_REGEX.exec(text)) !== null) {
      const fullStart = from + commentMatch.index;
      const anchorText = commentMatch[1];
      const tipo = commentMatch[2];
      const persistedId = commentMatch[4] ?? null;
      const anchorStart = fullStart + 1;
      const anchorEnd = anchorStart + anchorText.length;
      const fullEnd = fullStart + commentMatch[0].length;
      const commentId = `${fullStart}`;
      const isActive = view.state.field(activeCommentField, false) === commentId;
      const underlineStyle = isActive
        ? activeCommentMarkFor(tipo, commentId)
        : wavyUnderlineMarkFor(tipo, commentId);
      const markerWidget = new CommentMarkerWidget(tipo, persistedId);

      // Comentários nunca expõem a sintaxe bruta — sempre escondida, mesmo com o cursor dentro.
      entries.push({ from: fullStart, to: anchorStart, decoration: hideMark });
      entries.push({ from: anchorStart, to: anchorEnd, decoration: underlineStyle });
      entries.push({ from: anchorEnd, to: fullEnd, decoration: hideMark });
      entries.push({ from: anchorEnd, to: anchorEnd, decoration: Decoration.widget({ widget: markerWidget, side: 1 }) });
    }

    // --- REFERÊNCIA DE NOTA DE RODAPÉ ([^id]) — clicável, ver footnoteClickHandler em page.tsx ---
    FOOTNOTE_REF_REGEX.lastIndex = 0;
    let footnoteMatch: RegExpExecArray | null;
    while ((footnoteMatch = FOOTNOTE_REF_REGEX.exec(text)) !== null) {
      const fullStart = from + footnoteMatch.index;
      const fullEnd = fullStart + footnoteMatch[0].length;
      const id = footnoteMatch[1];
      entries.push({ from: fullStart, to: fullEnd, decoration: footnoteRefMarkFor(id) });
    }

    // --- TIMESTAMP DE VÍDEO (mm:ss / h:mm:ss) — clicável, ver videoTimestampClickHandler ---
    TIMESTAMP_REGEX.lastIndex = 0;
    let timestampMatch: RegExpExecArray | null;
    while ((timestampMatch = TIMESTAMP_REGEX.exec(text)) !== null) {
      const fullStart = from + timestampMatch.index;
      const fullEnd = fullStart + timestampMatch[0].length;
      const hours = timestampMatch[1] ? parseInt(timestampMatch[1], 10) : 0;
      const minutes = parseInt(timestampMatch[2], 10);
      const seconds = parseInt(timestampMatch[3], 10);
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      entries.push({ from: fullStart, to: fullEnd, decoration: timestampMarkFor(totalSeconds) });
    }

    // --- IMAGEM (![alt](caminho)§size:N§shape:tipo§wrap:tipo) — sempre widget, nunca sintaxe bruta ---
    IMAGE_REGEX.lastIndex = 0;
    let imageMatch: RegExpExecArray | null;
    while ((imageMatch = IMAGE_REGEX.exec(text)) !== null) {
      const fullStart = from + imageMatch.index;
      const fullEnd = fullStart + imageMatch[0].length;
      const alt = imageMatch[1];
      const srcPath = imageMatch[2];
      const size = imageMatch[3] ? parseInt(imageMatch[3], 10) : DEFAULT_IMAGE_SIZE;
      const shape = (imageMatch[4] as ImageShape) || DEFAULT_IMAGE_SHAPE;
      const align = (imageMatch[5] as ImageAlign) || DEFAULT_IMAGE_ALIGN;
      const wrap = (imageMatch[6] as ImageWrap) || DEFAULT_IMAGE_WRAP;
      const selectedImage = view.state.field(selectedImageField, false);
      const selected = selectedImage?.from === fullStart && selectedImage?.to === fullEnd;
      const widget = new ImageWidget(alt, srcPath, size, shape, align, wrap, fullStart, fullEnd, selected);
      entries.push({ from: fullStart, to: fullEnd, decoration: Decoration.replace({ widget }) });
    }

    // --- LINKS ([[nome]]), REFERÊNCIAS DE BLOCO ([[nota#^id]]) E EMBEDS (![[nota#^id]]) ---
    for (const wikiMatch of parseWikiMatches(text)) {
      const fullStart = from + wikiMatch.from;
      const fullEnd = from + wikiMatch.to;
      const editing = cursorTouches(view, fullStart, fullEnd);
      const innerStart = fullStart + 2;
      const innerEnd = fullEnd - 2;

      if (wikiMatch.kind === "link") {
        const rawTarget = wikiMatch.raw;
        const resolved = view.state.field(linkTargetsField, false)?.get(rawTarget.toLowerCase());
        const mark = resolved ? wikiLinkMarkFor(resolved.filename) : brokenWikiLinkMarkFor(rawTarget);

        if (editing) {
          entries.push({ from: fullStart, to: fullEnd, decoration: mark });
        } else {
          entries.push({ from: fullStart, to: innerStart, decoration: hideMark });
          entries.push({ from: innerStart, to: innerEnd, decoration: mark });
          entries.push({ from: innerEnd, to: fullEnd, decoration: hideMark });
        }
        continue;
      }

      if (wikiMatch.kind === "pageRef") {
        const resolved = view.state.field(linkTargetsField, false)?.get(wikiMatch.noteRaw.toLowerCase());
        const mark = resolved
          ? wikiPageLinkMarkFor(resolved.filename, wikiMatch.pageRaw)
          : brokenWikiPageLinkMarkFor(wikiMatch.noteRaw);

        if (editing) {
          entries.push({ from: fullStart, to: fullEnd, decoration: mark });
        } else {
          entries.push({ from: fullStart, to: innerStart, decoration: hideMark });
          entries.push({ from: innerStart, to: innerEnd, decoration: mark });
          entries.push({ from: innerEnd, to: fullEnd, decoration: hideMark });
        }
        continue;
      }

      if (wikiMatch.kind === "chapterRef") {
        const resolved = view.state.field(linkTargetsField, false)?.get(wikiMatch.noteRaw.toLowerCase());
        const mark = resolved
          ? wikiChapterLinkMarkFor(resolved.filename, wikiMatch.chapterRaw)
          : brokenWikiChapterLinkMarkFor(wikiMatch.noteRaw);

        if (editing) {
          entries.push({ from: fullStart, to: fullEnd, decoration: mark });
        } else {
          entries.push({ from: fullStart, to: innerStart, decoration: hideMark });
          entries.push({ from: innerStart, to: innerEnd, decoration: mark });
          entries.push({ from: innerEnd, to: fullEnd, decoration: hideMark });
        }
        continue;
      }

      // Referência de bloco (link ou embed)
      const key = blockRefKey(wikiMatch.noteRaw, wikiMatch.blockId);
      const info: BlockRefInfo = view.state.field(blockRefsField, false)?.get(key) ?? {
        noteExists: false,
        noteFilename: null,
        noteTitle: null,
        blockFound: false,
        text: null,
      };

      if (!wikiMatch.embed) {
        const mark =
          info.blockFound && info.noteFilename
            ? blockLinkMarkFor(info.noteFilename, wikiMatch.blockId)
            : brokenBlockLinkMarkFor(wikiMatch.noteRaw, wikiMatch.blockId, info.noteExists, info.noteFilename);

        if (editing) {
          entries.push({ from: fullStart, to: fullEnd, decoration: mark });
        } else {
          entries.push({ from: fullStart, to: innerStart, decoration: hideMark });
          entries.push({ from: innerStart, to: innerEnd, decoration: mark });
          entries.push({ from: innerEnd, to: fullEnd, decoration: hideMark });
        }
        continue;
      }

      // Embed: sintaxe crua enquanto o cursor tocar nela, card somente-leitura fora disso.
      if (editing) {
        const mark =
          info.blockFound && info.noteFilename
            ? blockLinkMarkFor(info.noteFilename, wikiMatch.blockId)
            : brokenBlockLinkMarkFor(wikiMatch.noteRaw, wikiMatch.blockId, info.noteExists, info.noteFilename);
        entries.push({ from: fullStart, to: fullEnd, decoration: mark });
      } else {
        entries.push({
          from: fullStart,
          to: fullEnd,
          decoration: Decoration.replace({ widget: new BlockEmbedWidget(info) }),
        });
      }
    }

    // --- CALLOUTS (> [!tipo] ... linhas com >) ---
    // Processado sobre o documento inteiro (não só o range visível), pois blocos
    // podem ter múltiplas linhas e a posição de início pode estar fora do range.
  }

  // Blocos de código / Mermaid: ver codeBlockDecorationsField mais abaixo —
  // decorações de bloco (block: true) não podem vir de um ViewPlugin (CodeMirror
  // lança "Block decorations may not be specified via plugins"), só de um
  // StateField, por isso ficam num field separado em vez de entrar aqui.

  // Callouts processados uma única vez, fora do loop de visibleRanges
  const fullText = view.state.doc.toString();
  const callouts = findCallouts(fullText);
  for (const c of callouts) {
    // Monta a lista de linhas do bloco (header + linhas de conteúdo com ">")
    const blockLines: { from: number; to: number }[] = [];
    let linePos = c.headerFrom;
    while (true) {
      const line = view.state.doc.lineAt(linePos);
      blockLines.push({ from: line.from, to: line.to });
      if (line.to >= c.to) break;
      linePos = line.to + 1;
    }

    // Aplica Decoration.line em cada linha do bloco, com cantos arredondados
    // só na primeira e na última (ou nos 4 cantos se for bloco de 1 linha só)
    blockLines.forEach((line, idx) => {
      const position =
        blockLines.length === 1 ? "single" :
        idx === 0 ? "first" :
        idx === blockLines.length - 1 ? "last" :
        "middle";
      entries.push({ from: line.from, to: line.from, decoration: calloutLineAttrs(c.tipo, position) });
    });

    // Cabeçalho do callout nunca expõe a sintaxe crua "[!tipo]" — igual a
    // destaque/sublinhado/comentário, mesmo com o cursor em cima. Editar o
    // tipo continua acessível clicando no rótulo (ver CalloutLabelWidget).
    entries.push({
      from: c.headerFrom,
      to: c.headerTo,
      decoration: Decoration.replace({ widget: new CalloutLabelWidget(c.tipo, c.headerFrom, c.headerTo) }),
    });
  }

  // --- MARCADORES DE BLOCO (^id) — processados sobre o documento inteiro, mesmo
  // motivo dos callouts: um parágrafo pode ficar fora do range visível atual mesmo
  // com o marcador dentro dele. Sempre visível, nunca escondido.
  for (const marker of findBlockMarkers(fullText)) {
    entries.push({ from: marker.markerFrom, to: marker.markerTo, decoration: blockMarkerMark });
  }

  // Ordena todas as entradas por posição (exigência do RangeSetBuilder)
  entries.sort((a, b) => a.from - b.from || a.to - b.to);

  const builder = new RangeSetBuilder<Decoration>();
  for (const entry of entries) {
    builder.add(entry.from, entry.to, entry.decoration);
  }
  return builder.finish();
}

// Verifica se a seleção toca [from, to] — mesma lógica de cursorTouches, mas a
// partir de EditorState (não EditorView): usada só por codeBlockDecorationsField
// abaixo, que roda dentro de um StateField e não tem acesso a um EditorView.
function selectionTouches(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.from <= to && range.to >= from) return true;
  }
  return false;
}

// Blocos de código (```lang ... ```) e diagramas Mermaid (```mermaid ... ```).
// Precisa ser um StateField (não pode entrar no ViewPlugin acima) porque são
// decorações de bloco (block: true, cobrem várias linhas) — o CodeMirror exige
// que decorações de bloco venham de uma fonte "estática" (StateField), nunca de
// um ViewPlugin, e lança "Block decorations may not be specified via plugins"
// se isso não for respeitado.
function buildCodeBlockDecorations(state: EditorState): DecorationSet {
  const entries: { from: number; to: number; decoration: Decoration }[] = [];
  const fencedRanges: { from: number; to: number }[] = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "FencedCode") return;
      fencedRanges.push({ from: node.from, to: node.to });

      // Bloco com o cursor dentro continua cru (crases visíveis) — mesmo padrão
      // de negrito/itálico/heading (cursorTouches), diferente de callouts/
      // highlights, que nunca voltam a mostrar a sintaxe crua.
      if (selectionTouches(state, node.from, node.to)) return;

      const infoNode = node.node.getChild("CodeInfo");
      const lang = infoNode ? state.doc.sliceString(infoNode.from, infoNode.to).trim() : "";

      // Conteúdo = texto bruto do documento entre o fim da linha da crase de
      // abertura e o início da linha da crase de fechamento — mais confiável
      // que juntar os nós CodeText (que são fragmentados por linha e podem
      // não preservar linhas em branco exatamente).
      const marks = node.node.getChildren("CodeMark");
      const openMark = marks[0] ?? null;
      const closeMark = marks.length > 1 ? marks[marks.length - 1] : null;
      const codeFrom = openMark ? Math.min(state.doc.lineAt(openMark.to).to + 1, node.to) : node.from;
      const codeToRaw = closeMark ? state.doc.lineAt(closeMark.from).from - 1 : node.to;
      const codeTo = Math.max(codeFrom, codeToRaw);
      const code = state.doc.sliceString(codeFrom, codeTo);

      const widget = lang.toLowerCase() === "mermaid" ? new MermaidWidget(code) : new CodeBlockWidget(code, lang);
      entries.push({ from: node.from, to: node.to, decoration: Decoration.replace({ widget, block: true }) });
    },
  });

  // Embed de vídeo (YouTube/Vimeo) — ver parseVideoEmbedUrl em videoEmbed.ts.
  // Varre linha por linha (não dá pra usar a árvore de sintaxe: uma URL solta
  // não vira nenhum nó especial no parser de markdown), pulando linhas dentro
  // de um bloco de código (senão uma URL colada ali também viraria embed).
  for (let lineNo = 1; lineNo <= state.doc.lines; lineNo++) {
    const line = state.doc.line(lineNo);
    if (fencedRanges.some((r) => line.from >= r.from && line.from <= r.to)) continue;
    const embed = parseVideoEmbedUrl(line.text);
    if (!embed) continue;
    // Mesmo padrão de FencedCode: linha com o cursor continua crua/editável.
    if (selectionTouches(state, line.from, line.to)) continue;
    entries.push({
      from: line.from,
      to: line.to,
      decoration: Decoration.replace({ widget: new VideoEmbedWidget(embed.embedUrl, embed.provider, line.from), block: true }),
    });
  }

  entries.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const entry of entries) {
    builder.add(entry.from, entry.to, entry.decoration);
  }
  return builder.finish();
}

export const codeBlockDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return buildCodeBlockDecorations(state);
  },
  update(deco, tr) {
    if (tr.docChanged || tr.selection) return buildCodeBlockDecorations(tr.state);
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      const activeCommentChanged =
        update.startState.field(activeCommentField, false) !== update.state.field(activeCommentField, false);
      const linkTargetsChanged =
        update.startState.field(linkTargetsField, false) !== update.state.field(linkTargetsField, false);
      const blockRefsChanged =
        update.startState.field(blockRefsField, false) !== update.state.field(blockRefsField, false);
      const selectedImageChanged =
        update.startState.field(selectedImageField, false) !== update.state.field(selectedImageField, false);

      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        activeCommentChanged ||
        linkTargetsChanged ||
        blockRefsChanged ||
        selectedImageChanged
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);