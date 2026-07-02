"use client";

import { useState, useEffect, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { basicLight } from "@uiw/codemirror-theme-basic";
import { livePreviewPlugin } from "@/lib/livePreview";
import { GFM } from "@lezer/markdown";
import HighlightMenu from "@/components/HighlightMenu";
import { EditorView, lineNumbers } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import CommentModal from "@/components/CommentModal";
import { setActiveCommentEffect, activeCommentField } from "@/lib/livePreview";


const underlineColorsPalette: Record<string, string> = {
  conceito: "#d4af00",
  duvidas: "#d04444",
  referencias: "#2f7fd6",
  exemplo: "#d6822f",
  acao: "#5b6b78",
  opiniao_autor: "#8d5fc7",
  preto: "#000000",
  azul: "#1e5fd6",
};

const calloutColorsPalette: Record<string, string> = {
  sintese: "#2e9e4e",
  importante: "#d4af00",
  duvidas: "#d04444",
  referencias: "#2f7fd6",
  exemplos: "#d6822f",
  citacoes: "#8d5fc7",
};

const customHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, textDecoration: "none", fontWeight: "normal" }, // remove sublinhado/negrito nativos
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.link, color: "#2f7fd6" },
  { tag: tags.monospace, fontFamily: "monospace", color: "#a33" },
]);

function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}


export default function Home() {
  const [notes, setNotes] = useState<string[]>([]);
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("");
  const [editingHighlight, setEditingHighlight] = useState<{
    from: number;
    to: number;
    tipo: string;
    modo: "fundo" | "sublinhado";
  } | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  const [showComments, setShowComments] = useState(false);
  const [commentDraft, setCommentDraft] = useState<{
    tipo: string;
    from: number;
    to: number;
    mode: "create" | "edit";
    anchorText?: string; // só usado no modo edit
    initialText?: string; // só usado no modo edit
  } | null>(null);

  const [showCalloutMenu, setShowCalloutMenu] = useState(false);

  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  type BalloonPosition = { tipo: string; comentario: string; from: number; to: number; anchorTop: number; top: number };


  const [balloonPositions, setBalloonPositions] = useState<BalloonPosition[]>([]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;

    function recalcularBaloes() {
      if (!view) return;
      const regex = /~(.+?)~¶(\w+){([^}]*)}/g;
      const sectionEl = sectionRef.current;
      if (!sectionEl) return;
      const editorRect = sectionEl.getBoundingClientRect();
      const positions: BalloonPosition[] = [];

      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const from = match.index;
        const to = from + match[0].length;

        // Ancora no FIM do texto sublinhado (não no início da linha) —
        // mais próximo visualmente do ponto real onde a anotação deveria nascer.
        const anchorTextEnd = from + 1 + match[1].length;
        const coords = view.coordsAtPos(anchorTextEnd);

        if (coords) {
          const anchorTop = coords.top - editorRect.top;
          positions.push({
            tipo: match[2],
            comentario: match[3],
            from,
            to,
            anchorTop,
            top: anchorTop,
          });
        }
      }
      // Ordena por posição vertical desejada, depois ajusta para evitar sobreposição
      positions.sort((a, b) => a.anchorTop - b.anchorTop);
      const MIN_GAP = 56;
      for (let i = 1; i < positions.length; i++) {
        const prev = positions[i - 1];
        const curr = positions[i];
        if (curr.top < prev.top + MIN_GAP) {
          curr.top = prev.top + MIN_GAP;
        }
      }

      setBalloonPositions(positions);
    }

    const frame = requestAnimationFrame(recalcularBaloes);

    // O CodeMirror dispara scroll no elemento ".cm-scroller" interno,
    // não no wrapper externo — precisamos escutar ali especificamente.
    window.addEventListener("scroll", recalcularBaloes, true); // true = captura em qualquer ancestral que role
    window.addEventListener("resize", recalcularBaloes);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", recalcularBaloes, true);
      window.removeEventListener("resize", recalcularBaloes);
    };
  }, [content, activeNote]);

  // Roda uma vez ao abrir a página: busca a lista de notas
  useEffect(() => {
    fetch("/api/notes")
      .then((res) => res.json())
      .then((data) => {
        if (data.notes) {
          setNotes(data.notes);
          // Abre a primeira nota automaticamente, se existir
          if (data.notes.length > 0) {
            setActiveNote(data.notes[0]);
          }
        }
      });
  }, []);

  useEffect(() => {
    function handleIconClick(e: Event) {
      const detail = (e as CustomEvent).detail as {
        tipo: string;
        modo: "fundo" | "sublinhado";
        from: number;
        to: number;
      };

      const view = editorViewRef.current;
      if (!view) return;

      setEditingHighlight(detail);
      const coords = view.coordsAtPos(detail.to);
      if (coords) {
        setMenuPos({ x: coords.left, y: coords.bottom + 6 });
      }
    }

    const dom = editorViewRef.current?.dom;
    dom?.addEventListener("highlight-icon-click", handleIconClick);
    return () => dom?.removeEventListener("highlight-icon-click", handleIconClick);
  }, [activeNote]); // re-registra quando troca de nota (o editor é recriado)
  
  // Roda toda vez que "activeNote" muda: busca o conteúdo daquela nota
  useEffect(() => {
    if (!activeNote) return;

    setStatus("Carregando...");
    fetch(`/api/note?filename=${encodeURIComponent(activeNote)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.content !== undefined) {
          setContent(data.content);
          setStatus("Carregado.");
        } else {
          setStatus("Erro ao carregar: " + data.error);
        }
      });
  }, [activeNote]);
  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    view.dispatch({ effects: setActiveCommentEffect.of(activeCommentId) });
  }, [activeCommentId]);

  async function handleSave() {
    if (!activeNote) return;

    setStatus("Salvando...");
    const res = await fetch("/api/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: activeNote, content }),
    });
    const data = await res.json();
    setStatus(data.success ? "Salvo!" : "Erro ao salvar: " + data.error);
  }
// Extensão do CodeMirror: observa mudanças de seleção
  const selectionWatcher = EditorView.updateListener.of((update) => {
    if (update.selectionSet) {
      const sel = update.state.selection.main;

      if (sel.empty) {
        setMenuPos(null);
        setEditingHighlight(null);
        return;
      }

      // Proteção: impede criar highlight se a seleção colide com um highlight
      // OU um comentário já existente — evita sintaxe aninhada/corrompida.
      const overlapsHighlight =
        findHighlightAt(update.view, sel.from) || findHighlightAt(update.view, sel.to);
      const overlapsComment =
        findCommentAt(update.view, sel.from) || findCommentAt(update.view, sel.to);

      if (overlapsHighlight || overlapsComment) {
        setMenuPos(null);
        setEditingHighlight(null);
        return;
      }

      setEditingHighlight(null);
      const coords = update.view.coordsAtPos(sel.head);
      if (coords) {
        setMenuPos({ x: coords.left, y: coords.bottom + 6 });
      }
    }
  });

  const commentClickHandler = EditorView.domEventHandlers({
    mousedown(event, view) {
      const target = event.target as HTMLElement;
      const anchorEl = target.closest(".comment-anchor") as HTMLElement | null;
      if (anchorEl) {
        const commentId = anchorEl.getAttribute("data-comment-id");
        if (commentId) {
          event.preventDefault();
          setActiveCommentId(commentId);
          return true; // marca o evento como tratado, evita posicionar cursor ali
        }
      }
      return false;
    },
  });

  function applyHighlight(tipo: string, modo: "fundo" | "sublinhado") {
    const view = editorViewRef.current;
    if (!view) return;

    const suffix = modo === "sublinhado" ? ":sub" : "";

    if (editingHighlight) {
      // Modo editar: substitui o highlight existente por um novo tipo/modo
      const innerText = view.state.doc.sliceString(
        editingHighlight.from + 2,
        view.state.doc.toString().indexOf("==", editingHighlight.from + 2)
      );
      const newText = `==${innerText}==§${tipo}${suffix}`;
      const newCursorPos = editingHighlight.from + newText.length;

      view.dispatch({
        changes: { from: editingHighlight.from, to: editingHighlight.to, insert: newText },
        selection: EditorSelection.cursor(newCursorPos),
      });

      // Atualiza imediatamente o estado de edição com os novos dados,
      // em vez de esperar passivamente o próximo evento de seleção.
      const updated = findHighlightAt(view, newCursorPos);
      setEditingHighlight(updated);

      if (updated) {
        const coords = view.coordsAtPos(newCursorPos);
        if (coords) {
          setMenuPos({ x: coords.left, y: coords.bottom + 6 });
        }
      }

      view.focus();
      return; // sai aqui, não executa o resto da função
    } else {
      // Modo criar: envolve o texto selecionado
      const sel = view.state.selection.main;
      if (sel.empty) return;

      const selectedText = view.state.doc.sliceString(sel.from, sel.to);
      const newText = `==${selectedText}==§${tipo}${suffix}`;

      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: newText },
        selection: EditorSelection.cursor(sel.from + newText.length),
      });

      setMenuPos(null);
      view.focus();
    }
  }

  // Verifica se a posição "pos" está dentro de um highlight ==texto==§tipo existente.
  // Se sim, devolve { from, to, tipo, modo } do trecho completo (== até §tipo[:sub]).
  function findHighlightAt(view: EditorView, pos: number) {
    const text = view.state.doc.toString();
    const regex = /==(.+?)==§(\w+)(:sub)?/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (pos >= start && pos <= end) {
        return {
          from: start,
          to: end,
          tipo: match[2],
          modo: (match[3] ? "sublinhado" : "fundo") as "fundo" | "sublinhado",
        };
      }
    }
    return null;
  }

    // Verifica se a posição "pos" está dentro de um comentário ancorado existente.
  function findCommentAt(view: EditorView, pos: number): boolean {
    const text = view.state.doc.toString();
    const regex = /~(.+?)~¶(\w+){([^}]*)}/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (pos >= start && pos <= end) {
        return true;
      }
    }
    return false;
  }

  // Extrai todos os comentários do texto atual, com posição, tipo e conteúdo.
  function listComments(text: string) {
    const regex = /~(.+?)~¶(\w+){([^}]*)}/g;
    const results: { from: number; to: number; tipo: string; anchorText: string; comentario: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      results.push({
        from: match.index,
        to: match.index + match[0].length,
        tipo: match[2],
        anchorText: match[1],
        comentario: match[3],
      });
    }
    return results;
  }  

    function removeHighlight() {
    const view = editorViewRef.current;
    if (!view || !editingHighlight) return;

    const innerText = view.state.doc.sliceString(
      editingHighlight.from + 2,
      view.state.doc.toString().indexOf("==", editingHighlight.from + 2)
    );

    view.dispatch({
      changes: { from: editingHighlight.from, to: editingHighlight.to, insert: innerText },
      selection: EditorSelection.cursor(editingHighlight.from + innerText.length),
    });

    setEditingHighlight(null);
    setMenuPos(null);
    view.focus();
  }

  function startComment(tipo: string) {
    const view = editorViewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    if (sel.empty) return;
    setCommentDraft({ tipo, from: sel.from, to: sel.to, mode: "create" });
    setMenuPos(null);
  }

  function insertCallout(tipo: string) {
    const view = editorViewRef.current;
    if (!view) return;

    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);

    // Insere o bloco callout depois da linha atual
    const insertPos = line.to;
    const calloutText = `\n> [!${tipo}]\n> `;

    view.dispatch({
      changes: { from: insertPos, to: insertPos, insert: calloutText },
      selection: EditorSelection.cursor(insertPos + calloutText.length),
    });

    setShowCalloutMenu(false);
    view.focus();
  }

  // Abre o modal pré-preenchido para editar um comentário já existente
  function editComment(from: number) {
    const view = editorViewRef.current;
    if (!view) return;
    const text = view.state.doc.toString();
    const regex = /~(.+?)~¶(\w+){([^}]*)}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match.index === from) {
        setCommentDraft({
          tipo: match[2],
          from: match.index,
          to: match.index + match[0].length,
          mode: "edit",
          anchorText: match[1],
          initialText: match[3],
        });
        return;
      }
    }
  }

  // Remove a sintaxe do comentário, devolvendo só o texto ancorado puro
  function deleteComment(from: number) {
    const view = editorViewRef.current;
    if (!view) return;
    const text = view.state.doc.toString();
    const regex = /~(.+?)~¶(\w+){([^}]*)}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match.index === from) {
        const anchorText = match[1];
        view.dispatch({
          changes: { from: match.index, to: match.index + match[0].length, insert: anchorText },
        });
        view.focus();
        return;
      }
    }
  }

  function confirmComment(texto: string) {
    const view = editorViewRef.current;
    if (!view || !commentDraft) return;

    // No modo "edit", o texto ancorado já é conhecido (anchorText);
    // no modo "create", precisamos lê-lo da seleção original (from/to ainda apontam pro texto puro).
    const anchorText =
      commentDraft.mode === "edit"
        ? commentDraft.anchorText!
        : view.state.doc.sliceString(commentDraft.from, commentDraft.to);

    const newText = `~${anchorText}~¶${commentDraft.tipo}{${texto}}`;

    view.dispatch({
      changes: { from: commentDraft.from, to: commentDraft.to, insert: newText },
      selection: EditorSelection.cursor(commentDraft.from + newText.length),
    });

    setCommentDraft(null);
    view.focus();
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Barra de ferramentas fixa */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 1rem",
          borderBottom: "1px solid #ccc",
          position: "relative",
        }}
      >
        <strong style={{ marginRight: "1rem" }}>Meu App de Estudo</strong>

        {/* Botão de inserir callout */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowCalloutMenu((prev) => !prev)}
            style={{
              padding: "0.4rem 0.8rem",
              background: showCalloutMenu ? "#eee" : "transparent",
              border: "1px solid #ccc",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            📦 Callout
          </button>

          {showCalloutMenu && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                background: "white",
                border: "1px solid #ccc",
                borderRadius: "6px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                padding: "0.5rem",
                zIndex: 1000,
                display: "flex",
                flexDirection: "column",
                gap: "0.3rem",
                minWidth: "160px",
              }}
            >
              {Object.entries(calloutColorsPalette).map(([tipo, cor]) => (
                <button
                  key={tipo}
                  onClick={() => insertCallout(tipo)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.4rem 0.6rem",
                    background: "transparent",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "13px",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      background: cor,
                      flexShrink: 0,
                    }}
                  />
                  {tipo}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => setShowComments((prev) => !prev)}
          style={{
            padding: "0.4rem 0.8rem",
            background: showComments ? "#eee" : "transparent",
            border: "1px solid #ccc",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          💬 Comentários
        </button>
      </header>

      {/* Conteúdo principal: notas + editor + (opcional) painel de comentários */}
      <div style={{ display: "flex", flex: 1, overflow: "auto", minHeight: 0 }}>


      <aside
        style={{
          width: "220px",
          borderRight: "1px solid #ccc",
          padding: "1rem",
          overflowY: "auto",
        }}
      >
        <h2 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>Notas</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {notes.map((note) => (
            <li key={note} style={{ marginBottom: "0.5rem" }}>
              <button
                onClick={() => setActiveNote(note)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "0.5rem",
                  background: note === activeNote ? "#eee" : "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {note}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Área principal: editor */}
      
      <section ref={sectionRef} style={{ flex: 1, display: "flex", position: "relative" }}>
        <div style={{ flex: 1, padding: "2rem", display: "flex", flexDirection: "column", position: "relative", minWidth: 0 }}>


        <h1 style={{ marginBottom: "1rem" }}>{activeNote || "Nenhuma nota selecionada"}</h1>

        <CodeMirror
          value={content}
          onChange={(value) => setContent(value)}
          extensions={[
            markdown({ extensions: GFM }),
            syntaxHighlighting(customHighlightStyle),
            livePreviewPlugin,
            selectionWatcher,
            activeCommentField,
            commentClickHandler,
          ]}
          theme={basicLight}
          height="100%"
          style={{ fontSize: "14px" }}
          basicSetup={{ lineNumbers: false, foldGutter: false }}
          onCreateEditor={(view) => {
            editorViewRef.current = view;
          }}
        />

        <div style={{ marginTop: "1rem", display: "flex", gap: "1rem", alignItems: "center" }}>
          <button onClick={handleSave} style={{ padding: "0.5rem 1rem" }}>
            Salvar
          </button>
          <span>{status}</span>
        </div>
        </div>

        <div style={{ width: "260px", flexShrink: 0, position: "relative", borderLeft: "1px dashed #eee" }}>
          {balloonPositions.map((b, i) => (
            <div
              key={i}
              onMouseEnter={() => setActiveCommentId(`${b.from}`)}
              onMouseLeave={() => setActiveCommentId(null)}
              onDoubleClick={() => editComment(b.from)}
              style={{
                position: "absolute",
                top: `${b.top}px`,
                left: "12px",
                right: "12px",
                padding: "0.5rem 0.7rem",
                borderRadius: "10px",
                background: underlineColorsPalette[b.tipo] ?? "#888",
                color: "white",
                fontSize: "12px",
                boxShadow: activeCommentId === `${b.from}` ? "0 0 0 3px rgba(0,0,0,0.3)" : "0 1px 4px rgba(0,0,0,0.2)",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.4rem" }}>
                <span style={{ flex: 1 }}>{b.comentario}</span>
                <div style={{ display: "flex", gap: "0.2rem", flexShrink: 0 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      editComment(b.from);
                    }}
                    title="Editar comentário"
                    style={{
                      background: "rgba(255,255,255,0.35)",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <EditIcon />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteComment(b.from);
                    }}
                    title="Excluir comentário"
                    style={{
                      background: "rgba(255,255,255,0.35)",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

        {menuPos && (
          <HighlightMenu
            x={menuPos.x}
            y={menuPos.y}
            onSelect={applyHighlight}
            onRemove={editingHighlight ? removeHighlight : undefined}
            onComment={editingHighlight ? undefined : startComment}
            initialTipo={editingHighlight?.tipo}
            initialModo={editingHighlight?.modo}
          />
        )}

        {commentDraft && (
          <CommentModal
            tipo={commentDraft.tipo}
            initialText={commentDraft.initialText}
            onConfirm={confirmComment}
            onCancel={() => setCommentDraft(null)}
          />
        )}
       

      {/* Painel lateral de comentários */}
      {showComments && (
        <aside
          style={{
            width: "280px",
            borderLeft: "1px solid #ccc",
            padding: "1rem",
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>Comentários</h2>
            <button
              onClick={() => setShowComments(false)}
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "1.2rem" }}
            >
              ×
            </button>
          </div>

          {listComments(content).length === 0 ? (
            <p style={{ color: "#888", fontSize: "0.9rem" }}>Nenhum comentário ainda.</p>
          ) : (
            listComments(content).map((c, i) => (
              <div
                key={i}
                onClick={() => {
                  const view = editorViewRef.current;
                  if (!view) return;
                  view.dispatch({
                    selection: EditorSelection.cursor(c.from),
                    effects: EditorView.scrollIntoView(c.from, { y: "center" }),
                  });
                  view.focus();
                }}
                onDoubleClick={() => editComment(c.from)}
                style={{
                  marginBottom: "0.6rem",
                  padding: "0.5rem 0.7rem",
                  borderRadius: "10px",
                  background: underlineColorsPalette[c.tipo] ?? "#888",
                  color: "white",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.2rem" }}>
                  <span style={{ fontWeight: "bold" }}>{c.tipo}</span>
                  <div style={{ display: "flex", gap: "0.2rem" }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        editComment(c.from);
                      }}
                      title="Editar comentário"
                      style={{
                        background: "rgba(255,255,255,0.35)",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        padding: "4px",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <EditIcon />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteComment(c.from);
                      }}
                      title="Excluir comentário"
                      style={{
                        background: "rgba(255,255,255,0.35)",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        padding: "4px",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
                <div style={{ opacity: 0.9, marginBottom: "0.3rem" }}>&ldquo;{c.anchorText}&rdquo;</div>
                <div>{c.comentario}</div>
              </div>
            ))
          )}
        </aside>
      )}
      </div>
    </main>
  );
}