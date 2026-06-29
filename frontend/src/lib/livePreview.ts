import { syntaxTree } from "@codemirror/language";
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { WidgetType } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";


const boldMark = Decoration.mark({ attributes: { style: "font-weight: bold" } });
const italicMark = Decoration.mark({ attributes: { style: "font-style: italic" } });

const headingMarks = [
  Decoration.mark({ attributes: { style: "font-size: 1.8em; font-weight: bold;" } }),
  Decoration.mark({ attributes: { style: "font-size: 1.6em; font-weight: bold;" } }),
  Decoration.mark({ attributes: { style: "font-size: 1.4em; font-weight: bold;" } }),
  Decoration.mark({ attributes: { style: "font-size: 1.2em; font-weight: bold;" } }),
  Decoration.mark({ attributes: { style: "font-size: 1.1em; font-weight: bold;" } }),
  Decoration.mark({ attributes: { style: "font-size: 1em; font-weight: bold; opacity: 0.8;" } }),
];

const highlightColors: Record<string, string> = {
  conceito: "#fff3a0",
  critica: "#ffd0d0",
  citacao: "#d4f7d4",
  duvida: "#e6d9f7",
  conexao: "#cfe8ff",
  sintese: "#ffe4c2",
  acao: "#dde4ea",
};
const underlineColors: Record<string, string> = {
  conceito: "#d4af00",
  critica: "#d04444",
  citacao: "#2e9e4e",
  duvida: "#8d5fc7",
  conexao: "#2f7fd6",
  sintese: "#d6822f",
  acao: "#5b6b78",
  preto: "#000000",
  azul: "#1e5fd6",
};

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

function highlightMarkFor(tipo: string) {
  const color = highlightColors[tipo] ?? "#eeeeee"; // cor neutra se o tipo não existir
  return Decoration.mark({ attributes: { style: `background-color: ${color}; border-radius: 2px;` } });
}

// Reconhece: ~texto ancorado~¶tipo{comentário}
const COMMENT_REGEX = /~(.+?)~¶(\w+){([^}]*)}/g;


// Reconhece: ==texto destacado==§tipo
const HIGHLIGHT_REGEX = /==(.+?)==§(\w+)(:sub)?/g;

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
    span.style.color = "#666";
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

      const editing = cursorTouches(view, fullStart, fullEnd);
      const mark = isSub ? underlineMarkFor(tipo) : highlightMarkFor(tipo);

      const iconWidget = new HighlightIconWidget(tipo, isSub ? "sublinhado" : "fundo", fullStart, suffixEnd);

      if (editing) {
        entries.push({ from: fullStart, to: fullEnd, decoration: mark });
      } else {
        entries.push({ from: fullStart, to: innerStart, decoration: hideMark });
        entries.push({ from: innerStart, to: innerEnd, decoration: mark });
        entries.push({ from: innerEnd, to: suffixEnd, decoration: hideMark });
        // Ícone aparece logo depois do highlight, sempre (mesmo fora do modo edição)
        entries.push({ from: suffixEnd, to: suffixEnd, decoration: Decoration.widget({ widget: iconWidget, side: 1 }) });
      }
    }
    // --- COMENTÁRIO ANCORADO (~texto~¶tipo{comentário}) — só o sublinhado aqui ---
    COMMENT_REGEX.lastIndex = 0;
    let commentMatch: RegExpExecArray | null;
    while ((commentMatch = COMMENT_REGEX.exec(text)) !== null) {
      const fullStart = from + commentMatch.index;
      const anchorText = commentMatch[1];
      const tipo = commentMatch[2];
      const anchorStart = fullStart + 1;
      const anchorEnd = anchorStart + anchorText.length;
      const fullEnd = fullStart + commentMatch[0].length;
      const commentId = `${fullStart}`;
      const isActive = view.state.field(activeCommentField, false) === commentId;
      const underlineStyle = isActive
        ? activeCommentMarkFor(tipo, commentId)
        : wavyUnderlineMarkFor(tipo, commentId);

      // Comentários nunca expõem a sintaxe bruta — sempre escondida, mesmo com o cursor dentro.
      entries.push({ from: fullStart, to: anchorStart, decoration: hideMark });
      entries.push({ from: anchorStart, to: anchorEnd, decoration: underlineStyle });
      entries.push({ from: anchorEnd, to: fullEnd, decoration: hideMark });
    }
  }

  // Ordena todas as entradas por posição (exigência do RangeSetBuilder)
  entries.sort((a, b) => a.from - b.from || a.to - b.to);

  const builder = new RangeSetBuilder<Decoration>();
  for (const entry of entries) {
    builder.add(entry.from, entry.to, entry.decoration);
  }
  return builder.finish();
}

export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      const activeCommentChanged =
        update.startState.field(activeCommentField, false) !== update.state.field(activeCommentField, false);

      if (update.docChanged || update.viewportChanged || update.selectionSet || activeCommentChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);