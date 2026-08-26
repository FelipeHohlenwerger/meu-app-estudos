import type { LibraryNote } from "@/components/NoteCard";
import type { CalibreBook } from "@/lib/calibreLibrary";

// Uma nota favoritada e um livro do Calibre favoritado têm formas
// irreconciliáveis (LibraryNote vs CalibreBook — ver comentário em
// CalibreBookCard.tsx sobre por que são componentes deliberadamente
// separados). Esse tipo é só o suficiente pra listar os dois juntos (ex: a
// seção "Favoritos" da Homepage) sem fingir que são a mesma coisa — ver
// FavoriteCard.tsx pra quem renderiza cada variante.
export type FavoriteItem = { kind: "note"; note: LibraryNote } | { kind: "calibre"; book: CalibreBook };
