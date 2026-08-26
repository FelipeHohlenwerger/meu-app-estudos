"use client";

import { useState } from "react";
import NoteCard, { type LibraryNote } from "@/components/NoteCard";
import FavoriteCard from "@/components/FavoriteCard";
import type { FavoriteItem } from "@/lib/favoriteItems";
import type { CalibreBook } from "@/lib/calibreLibrary";
import { matchesTypeFilter, CONTENT_TYPE_FILTER_OPTIONS, type ContentTypeFilter } from "@/lib/noteStatus";
import { formatTagLabel } from "@/lib/tagTree";

type Props = {
  tag: string | null; // null = sem categoria
  notes: LibraryNote[];
  heading?: string; // sobrescreve o título derivado da tag (ex: "Editados recentemente")
  // Só a lista de favoritas (ver page.tsx) liga isso — as outras (tagList,
  // recentList) continuam sem filtro, como antes. Mesmo padrão opt-in que
  // GroupedNoteList.tsx já usa pra Progresso.
  showTypeFilter?: boolean;
  // Livros do Calibre favoritados — só a lista de Favoritos passa algo aqui
  // (ver page.tsx); tagList/recentList continuam sem, comportamento
  // inalterado. Sempre bate "Todos"/"Livros" no filtro de tipo, nunca
  // "Artigos"/"Notas" — regra trivial aplicada só a este sublista, sem
  // mexer em matchesTypeFilter (usado em vários outros lugares pra notas).
  calibreItems?: FavoriteItem[];
  onOpenNote: (filename: string) => void;
  onRenameNote: (filename: string, newTitle: string, onSettled: () => void) => void;
  onDeleteNote: (filename: string) => void;
  onDeleteMultiple: (filenames: string[]) => void;
  // Substitui o "N min de leitura" da meta por um texto calculado por nota —
  // usado pela lista "Editados recentemente" (ver page.tsx) pra mostrar tempo
  // relativo em vez de tempo de leitura, já que a lista está ordenada por
  // recência. Nenhum outro caller passa isso, então nada muda pra eles.
  metaForNote?: (note: LibraryNote) => string;
  onToggleFavorite: (filename: string) => void;
  onOpenCalibreBook?: (book: CalibreBook) => void;
  onToggleCalibreFavorite?: (bookId: number) => void;
};

export default function TagNoteList({
  tag,
  notes,
  heading: headingOverride,
  showTypeFilter,
  calibreItems,
  onOpenNote,
  onRenameNote,
  onDeleteNote,
  onDeleteMultiple,
  metaForNote,
  onToggleFavorite,
  onOpenCalibreBook,
  onToggleCalibreFavorite,
}: Props) {
  const heading = headingOverride ?? (tag ? formatTagLabel(tag) : "Sem categoria");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<ContentTypeFilter>("all");
  const filteredNotes = showTypeFilter ? notes.filter((n) => matchesTypeFilter(n, typeFilter)) : notes;
  // Livro do Calibre sempre é "book" — bate com "all"/"book", nunca com
  // "article"/"note". Renderizado à parte de filteredNotes/NoteCard abaixo
  // (não unificado num "combinedItems") porque seleção múltipla/exclusão em
  // lote só existe pra nota — um livro do Calibre é só leitura, nunca
  // aparece selecionável aqui, então não há por que fingir suportar isso em
  // FavoriteCard.
  const filteredCalibreItems = showTypeFilter
    ? typeFilter === "all" || typeFilter === "book"
      ? calibreItems ?? []
      : []
    : calibreItems ?? [];

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

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "2.5rem 3rem" }}>
      <h1 style={{ fontFamily: "var(--font-fraunces)", fontSize: "2em", margin: 0 }}>{heading}</h1>
      <p style={{ color: "var(--text-muted)", marginTop: "0.4rem", marginBottom: "1rem" }}>
        {filteredNotes.length} {filteredNotes.length === 1 ? "nota" : "notas"}
        {filteredCalibreItems.length > 0 &&
          `, ${filteredCalibreItems.length} ${filteredCalibreItems.length === 1 ? "livro" : "livros"} (Calibre)`}
      </p>

      {showTypeFilter && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
          {CONTENT_TYPE_FILTER_OPTIONS.map((f) => (
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

      {showTypeFilter && filteredNotes.length === 0 && filteredCalibreItems.length === 0 && (
        <p style={{ color: "var(--text-muted)", marginTop: "1rem" }}>Nenhuma nota encontrada.</p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 220px)", gap: "1rem" }}>
        {filteredCalibreItems.length > 0 &&
          onOpenCalibreBook &&
          onToggleCalibreFavorite &&
          filteredCalibreItems.map((item) => (
            <FavoriteCard
              key={item.kind === "calibre" ? `calibre:${item.book.id}` : item.note.filename}
              item={item}
              onOpenNote={onOpenNote}
              onRenameNote={onRenameNote}
              onDeleteNote={onDeleteNote}
              onToggleFavorite={onToggleFavorite}
              onOpenCalibreBook={onOpenCalibreBook}
              onToggleCalibreFavorite={onToggleCalibreFavorite}
            />
          ))}
        {filteredNotes.map((note) => (
          <NoteCard
            key={note.filename}
            note={note}
            metaOverride={metaForNote?.(note)}
            onClick={() => onOpenNote(note.filename)}
            onRename={(newTitle, onSettled) => onRenameNote(note.filename, newTitle, onSettled)}
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
