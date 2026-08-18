import type { CalibreBook } from "@/lib/calibreLibrary";

// Funções PURAS (sem fs/node:sqlite) separadas de calibreLibrary.ts de
// propósito — calibreLibrary.ts usa node:sqlite/fs (server-only), e um
// import de VALOR (não `import type`) dessas duas funções a partir de um
// componente cliente (ex: page.tsx) arrasta o módulo inteiro pro bundle do
// navegador, que quebra em build ("Module not found: Can't resolve 'fs'").
// `CalibreBook` acima é só tipo (apagado em tempo de compilação — nunca
// gera esse problema), por isso pode continuar vindo de calibreLibrary.ts.

// Formato padrão pra abrir um livro do Calibre com mais de um disponível —
// EPUB primeiro (mesmo espírito de reflow/tema já usado pros EPUBs de
// vault), senão o primeiro formato que existir.
export function calibreDefaultFormat(book: CalibreBook): string {
  return book.formats.includes("EPUB") ? "EPUB" : (book.formats[0] ?? "EPUB");
}

// Pseudo-filename "calibre:<id>:<FORMAT>" — ver decisão de arquitetura em
// NotePanel.tsx (isCalibreBook). Única função que constrói essa string, pra
// nunca divergir entre os vários lugares que precisam abrir um livro.
export function calibrePseudoFilename(book: CalibreBook): string {
  return `calibre:${book.id}:${calibreDefaultFormat(book)}`;
}
