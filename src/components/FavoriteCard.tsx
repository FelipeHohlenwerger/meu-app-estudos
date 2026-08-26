"use client";

import NoteCard from "@/components/NoteCard";
import CalibreBookCard from "@/components/CalibreBookCard";
import type { CalibreBook } from "@/lib/calibreLibrary";
import type { FavoriteItem } from "@/lib/favoriteItems";

type Props = {
  item: FavoriteItem;
  onOpenNote: (filename: string) => void;
  onRenameNote: (filename: string, newTitle: string, onSettled: () => void) => void;
  onDeleteNote: (filename: string) => void;
  onToggleFavorite: (filename: string) => void;
  onOpenCalibreBook: (book: CalibreBook) => void;
  onToggleCalibreFavorite: (bookId: number) => void;
  onCoverChanged?: () => void;
};

// Renderiza um FavoriteItem como NoteCard OU CalibreBookCard conforme
// item.kind — sem tentar unificar os dois por dentro (ver comentário em
// CalibreBookCard.tsx sobre por que são componentes deliberadamente
// separados). Todo item aqui já está favoritado por definição (é isso que
// item.kind === "calibre" significa nesta lista — não existe um livro do
// Calibre "não favoritado" aparecendo aqui), então a estrela do lado do
// livro sempre começa preenchida.
export default function FavoriteCard({
  item,
  onOpenNote,
  onRenameNote,
  onDeleteNote,
  onToggleFavorite,
  onOpenCalibreBook,
  onToggleCalibreFavorite,
  onCoverChanged,
}: Props) {
  if (item.kind === "note") {
    const { note } = item;
    return (
      <NoteCard
        note={note}
        onClick={() => onOpenNote(note.filename)}
        onRename={(newTitle, onSettled) => onRenameNote(note.filename, newTitle, onSettled)}
        onDelete={() => onDeleteNote(note.filename)}
        isFavorite={note.isFavorite}
        onToggleFavorite={() => onToggleFavorite(note.filename)}
        onCoverChanged={onCoverChanged}
      />
    );
  }

  const { book } = item;
  return (
    <CalibreBookCard
      book={book}
      onClick={() => onOpenCalibreBook(book)}
      isFavorite
      onToggleFavorite={() => onToggleCalibreFavorite(book.id)}
    />
  );
}
