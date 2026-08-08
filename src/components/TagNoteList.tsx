"use client";

import { useState } from "react";
import NoteCard, { type LibraryNote } from "@/components/NoteCard";

type Props = {
  tag: string | null; // null = sem categoria
  notes: LibraryNote[];
  heading?: string; // sobrescreve o título derivado da tag (ex: "Todas as notas")
  onOpenNote: (filename: string) => void;
  onRenameNote: (filename: string) => void;
  onDeleteNote: (filename: string) => void;
  onDeleteMultiple: (filenames: string[]) => void;
  // Substitui o "N min de leitura" da meta por um texto calculado por nota —
  // usado pela lista "Editados recentemente" (ver page.tsx) pra mostrar tempo
  // relativo em vez de tempo de leitura, já que a lista está ordenada por
  // recência. Nenhum outro caller passa isso, então nada muda pra eles.
  metaForNote?: (note: LibraryNote) => string;
  onToggleFavorite: (filename: string) => void;
};

export default function TagNoteList({
  tag,
  notes,
  heading: headingOverride,
  onOpenNote,
  onRenameNote,
  onDeleteNote,
  onDeleteMultiple,
  metaForNote,
  onToggleFavorite,
}: Props) {
  const heading = headingOverride ?? tag ?? "Sem categoria";
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
    setSelected(new Set(notes.map((n) => n.filename)));
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "2.5rem 3rem" }}>
      <h1 style={{ fontFamily: "var(--font-fraunces)", fontSize: "2em", margin: 0 }}>{heading}</h1>
      <p style={{ color: "var(--text-muted)", marginTop: "0.4rem", marginBottom: "1rem" }}>
        {notes.length} {notes.length === 1 ? "nota" : "notas"}
      </p>

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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        {notes.map((note) => (
          <NoteCard
            key={note.filename}
            note={note}
            metaOverride={metaForNote?.(note)}
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
    </div>
  );
}
