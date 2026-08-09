"use client";

import { useState } from "react";
import NoteCard, { type LibraryNote } from "@/components/NoteCard";
import { matchesTypeFilter, type ContentTypeFilter } from "@/lib/noteStatus";
import { formatTagLabel } from "@/lib/tagTree";

// Mesma largura fixa usada em CardRow/SectionGrid (LibraryHome.tsx) e na
// grade de TagNoteList — cards nunca esticam pra preencher a linha (ver
// comentário em LibraryHome.tsx sobre a mesma correção).
const CARD_WIDTH = 220;

type TypeFilter = ContentTypeFilter;

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "book", label: "Livros" },
  { value: "article", label: "Artigos" },
  { value: "note", label: "Notas" },
  { value: "book_article", label: "Livros & Artigos" },
];

type Props = {
  heading: string;
  notes: LibraryNote[];
  showTypeFilter?: boolean;
  onOpenNote: (filename: string) => void;
  onRenameNote: (filename: string) => void;
  onDeleteNote: (filename: string) => void;
  onDeleteMultiple: (filenames: string[]) => void;
  onToggleFavorite: (filename: string) => void;
};

// Lista agrupada por tema (mesmo padrão visual das seções da Homepage,
// LibraryHome.tsx) — usada só pela tela de Progresso (homeView.kind
// "statusList" em page.tsx). TagNoteList continua servindo as outras views
// (tagList/recentList/favoritesList), que já vêm filtradas/ordenadas por
// natureza e não fazem sentido agrupadas por tema; a antiga tela "Todas as
// notas" foi removida — a aba "Notas" da sidebar cobre a lista plana, e a
// aba "Tags" (com filtro de tipo) cobre navegação por tema cruzada com tipo.
export default function GroupedNoteList({
  heading,
  notes,
  showTypeFilter,
  onOpenNote,
  onRenameNote,
  onDeleteNote,
  onDeleteMultiple,
  onToggleFavorite,
}: Props) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filteredNotes = showTypeFilter ? notes.filter((n) => matchesTypeFilter(n, typeFilter)) : notes;

  // Mesmo algoritmo de agrupamento por tag de LibraryHome.tsx: cada nota
  // aparece em todos os grupos das suas tags (sem "tag principal"), grupos
  // ordenados por contagem desc, "Sem categoria" sempre por último. Como já
  // agrupa só sobre `filteredNotes`, um tema que fica sem nenhum item pelo
  // filtro atual simplesmente não gera grupo — sem lógica extra.
  const byTag = new Map<string, LibraryNote[]>();
  const untagged: LibraryNote[] = [];
  for (const note of filteredNotes) {
    if (note.tags.length === 0) {
      untagged.push(note);
      continue;
    }
    for (const tag of note.tags) {
      const list = byTag.get(tag) ?? [];
      list.push(note);
      byTag.set(tag, list);
    }
  }
  const sortedTagGroups = Array.from(byTag.entries()).sort((a, b) => b[1].length - a[1].length);

  function toggleSelect(filename: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  }

  function handleDeleteSelected() {
    onDeleteMultiple(Array.from(selected));
    setSelected(new Set());
  }

  function selectAll() {
    setSelected(new Set(filteredNotes.map((n) => n.filename)));
  }

  function renderGrid(groupNotes: LibraryNote[]) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, ${CARD_WIDTH}px)`, gap: "1rem" }}>
        {groupNotes.map((note) => (
          <NoteCard
            key={note.filename}
            note={note}
            onClick={() => onOpenNote(note.filename)}
            onRename={() => onRenameNote(note.filename)}
            onDelete={() => onDeleteNote(note.filename)}
            selectable
            selected={selected.has(note.filename)}
            onToggleSelect={() => toggleSelect(note.filename)}
            isFavorite={note.isFavorite}
            onToggleFavorite={() => onToggleFavorite(note.filename)}
          />
        ))}
      </div>
    );
  }

  const sectionDividerStyle = { borderTop: "0.5px solid var(--panel-border)", paddingTop: "2rem", marginTop: "2rem" };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "2.5rem 3rem" }}>
      <h1 style={{ fontFamily: "var(--font-fraunces)", fontSize: "2em", margin: 0 }}>{heading}</h1>
      <p style={{ color: "var(--text-muted)", marginTop: "0.4rem", marginBottom: "1rem" }}>
        {filteredNotes.length} {filteredNotes.length === 1 ? "nota" : "notas"}
      </p>

      {showTypeFilter && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className="toolbar-link"
              style={{
                padding: "0.35rem 0.8rem",
                borderRadius: "999px",
                border: "1px solid var(--panel-border)",
                background: typeFilter === f.value ? "var(--panel-hover)" : "transparent",
                color: typeFilter === f.value ? "var(--foreground)" : "var(--text-muted)",
                fontWeight: typeFilter === f.value ? "bold" : "normal",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            padding: "0.6rem 0.9rem",
            marginBottom: "1rem",
            background: "var(--panel-hover)",
            border: "1px solid var(--panel-border)",
            borderRadius: "var(--radius)",
          }}
        >
          <span style={{ fontSize: "0.9rem" }}>
            {selected.size} {selected.size === 1 ? "nota selecionada" : "notas selecionadas"}
          </span>
          <button
            onClick={handleDeleteSelected}
            style={{
              padding: "0.35rem 0.7rem",
              border: "none",
              borderRadius: "4px",
              background: "#d04444",
              color: "white",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            Excluir selecionadas
          </button>
          <button
            onClick={selectAll}
            className="toolbar-link"
            style={{
              padding: "0.35rem 0.7rem",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "0.85rem",
              color: "var(--text-muted)",
            }}
          >
            Selecionar todas
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="toolbar-link"
            style={{
              padding: "0.35rem 0.7rem",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "0.85rem",
              color: "var(--text-muted)",
            }}
          >
            Desfazer seleção
          </button>
        </div>
      )}

      {filteredNotes.length === 0 && <p style={{ color: "var(--text-muted)", marginTop: "2rem" }}>Nenhuma nota encontrada.</p>}

      {sortedTagGroups.map(([tag, groupNotes]) => (
        <section key={tag} style={sectionDividerStyle}>
          <h2 style={{ fontFamily: "var(--font-fraunces)", fontSize: "1.3em", margin: "0 0 1rem 0" }}>
            {formatTagLabel(tag)}{" "}
            <span style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "0.6em", color: "var(--text-muted)" }}>
              ({groupNotes.length} {groupNotes.length === 1 ? "nota" : "notas"})
            </span>
          </h2>
          {renderGrid(groupNotes)}
        </section>
      ))}

      {untagged.length > 0 && (
        <section style={sectionDividerStyle}>
          <h2 style={{ fontFamily: "var(--font-fraunces)", fontSize: "1.3em", margin: "0 0 1rem 0" }}>
            Sem categoria{" "}
            <span style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "0.6em", color: "var(--text-muted)" }}>
              ({untagged.length} {untagged.length === 1 ? "nota" : "notas"})
            </span>
          </h2>
          {renderGrid(untagged)}
        </section>
      )}
    </div>
  );
}
