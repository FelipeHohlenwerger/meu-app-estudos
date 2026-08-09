import { DatabaseSync } from "node:sqlite";
import { existsSync } from "fs";
import path from "path";
import { getCalibreLibraryPath } from "@/lib/calibreConfig";

export type CalibreBook = {
  id: number;
  title: string;
  authors: string[];
  series: string | null;
  seriesIndex: number | null;
  // Hierárquico com ponto, mesmo formato das tags do app — vem da coluna
  // CUSTOMIZADA "Assunto" (ver findSubjectColumnId), não das etiquetas
  // nativas do Calibre (tabela `tags`) — são conceitos diferentes na
  // biblioteca do usuário. Vazio se a biblioteca não tiver essa coluna.
  subjects: string[];
  formats: string[]; // "EPUB", "PDF", etc. — sempre maiúsculo, como o Calibre guarda.
  hasCover: boolean;
};

// Abre o metadata.db em modo SOMENTE LEITURA — o Calibre pode estar aberto e
// editando ao mesmo tempo, então nunca escrevemos aqui. PRAGMA busy_timeout
// faz o SQLite tentar de novo sozinho por até 3s se o banco estiver ocupado
// nesse instante, em vez de lançar "database is locked" na primeira tentativa.
function openReadOnly(dbPath: string): DatabaseSync {
  const conn = new DatabaseSync(dbPath, { readOnly: true, open: true });
  conn.exec("PRAGMA busy_timeout = 3000");
  return conn;
}

// Nenhuma conexão fica em cache — a config pode mudar, e o banco é escrito
// por fora (pelo próprio Calibre) a qualquer momento; abrir/fechar por
// chamada é simples e correto, dado o tamanho típico de uma biblioteca
// pessoal.
function withDb<T>(fn: (conn: DatabaseSync, libraryPath: string) => T): T | null {
  const libraryPath = getCalibreLibraryPath();
  if (!libraryPath) return null;
  const dbPath = path.join(libraryPath, "metadata.db");
  if (!existsSync(dbPath)) return null;

  const conn = openReadOnly(dbPath);
  try {
    return fn(conn, libraryPath);
  } finally {
    conn.close();
  }
}

// Campos customizados do Calibre (criados pela pessoa na própria interface,
// ex: "Assunto") não são colunas normais — cada um vive numa tabela própria
// custom_column_<id>/books_custom_column_<id>_link_, e o <id> é interno
// (não previsível). O nome de EXIBIÇÃO ("Assunto") fica em
// custom_columns.name (label interno minúsculo, ex: "assunto", em
// custom_columns.label) — por isso a busca aqui é pelo nome, nunca por um id
// fixo, pra funcionar em qualquer biblioteca onde a pessoa tenha criado essa
// coluna (confirmado direto no metadata.db real do usuário: id=3,
// label="assunto", name="Assunto", datatype="text", is_multiple=1).
function findSubjectColumnId(conn: DatabaseSync): number | null {
  const row = conn
    .prepare(
      `SELECT id FROM custom_columns
       WHERE (name = ? COLLATE NOCASE OR label = ? COLLATE NOCASE)
         AND datatype = 'text'`
    )
    .get("Assunto", "Assunto") as { id: number } | undefined;
  return row ? row.id : null;
}

// Assunto de cada livro, lido da coluna customizada (não das etiquetas
// nativas do Calibre — tabela `tags`, conceito diferente). `columnId` vem de
// findSubjectColumnId (um id inteiro já validado pelo próprio SQLite, nunca
// de entrada externa), por isso é seguro interpolar no nome da tabela —
// SQLite não aceita nome de tabela como parâmetro vinculado (`?`).
function loadSubjectsByBook(conn: DatabaseSync, columnId: number): Map<number, string[]> {
  const rows = conn
    .prepare(
      `SELECT btl.book AS book_id, cc.value AS subject
       FROM books_custom_column_${columnId}_link btl
       JOIN custom_column_${columnId} cc ON cc.id = btl.value
       ORDER BY cc.value COLLATE NOCASE`
    )
    .all() as { book_id: number; subject: string }[];

  const map = new Map<number, string[]>();
  for (const row of rows) {
    const list = map.get(row.book_id) ?? [];
    list.push(row.subject);
    map.set(row.book_id, list);
  }
  return map;
}

type BookRow = {
  id: number;
  title: string;
  path: string;
  has_cover: number;
  // series_index vive na própria tabela `books` (não em books_series_link) —
  // Calibre guarda 1.0 por padrão mesmo pra livro sem série; só importa
  // quando `series_name` não é null.
  series_index: number | null;
  series_name: string | null;
};

function loadBooksFlat(conn: DatabaseSync): CalibreBook[] {
  const bookRows = conn
    .prepare(
      `SELECT b.id, b.title, b.path, b.has_cover, b.series_index, s.name AS series_name
       FROM books b
       LEFT JOIN books_series_link bsl ON bsl.book = b.id
       LEFT JOIN series s ON s.id = bsl.series
       ORDER BY b.title COLLATE NOCASE`
    )
    .all() as BookRow[];

  const authorRows = conn
    .prepare(
      `SELECT bal.book AS book_id, a.name AS author_name
       FROM books_authors_link bal
       JOIN authors a ON a.id = bal.author
       ORDER BY bal.id ASC`
    )
    .all() as { book_id: number; author_name: string }[];

  const subjectColumnId = findSubjectColumnId(conn);
  const subjectsByBook = subjectColumnId !== null ? loadSubjectsByBook(conn, subjectColumnId) : new Map<number, string[]>();

  const formatRows = conn
    .prepare(`SELECT book AS book_id, format FROM data ORDER BY id ASC`)
    .all() as { book_id: number; format: string }[];

  const authorsByBook = new Map<number, string[]>();
  for (const row of authorRows) {
    const list = authorsByBook.get(row.book_id) ?? [];
    list.push(row.author_name.replace(/\s*&\s*/g, ", "));
    authorsByBook.set(row.book_id, list);
  }
  const formatsByBook = new Map<number, string[]>();
  for (const row of formatRows) {
    const list = formatsByBook.get(row.book_id) ?? [];
    list.push(row.format.toUpperCase());
    formatsByBook.set(row.book_id, list);
  }

  return bookRows.map((b) => ({
    id: b.id,
    title: b.title,
    authors: authorsByBook.get(b.id) ?? [],
    series: b.series_name,
    seriesIndex: b.series_index,
    subjects: subjectsByBook.get(b.id) ?? [],
    formats: formatsByBook.get(b.id) ?? [],
    hasCover: b.has_cover === 1,
  }));
}

export function listCalibreBooks(): CalibreBook[] {
  return withDb((conn) => loadBooksFlat(conn)) ?? [];
}

export function getCalibreBookById(id: number): CalibreBook | null {
  return withDb((conn) => loadBooksFlat(conn).find((b) => b.id === id) ?? null) ?? null;
}

// Caminho absoluto da capa (cover.jpg) de um livro — null se a config não
// estiver definida, o livro não existir, ou não houver capa.
export function getCalibreCoverPath(id: number): string | null {
  return withDb((conn, libraryPath) => {
    const row = conn.prepare("SELECT path, has_cover FROM books WHERE id = ?").get(id) as
      | { path: string; has_cover: number }
      | undefined;
    if (!row || row.has_cover !== 1) return null;
    const coverPath = path.join(libraryPath, row.path, "cover.jpg");
    return existsSync(coverPath) ? coverPath : null;
  });
}

// Caminho absoluto do arquivo de um formato específico do livro (ex: EPUB,
// PDF) — null se não existir esse formato pra esse livro.
export function getCalibreFilePath(id: number, format: string): string | null {
  return withDb((conn, libraryPath) => {
    const bookRow = conn.prepare("SELECT path FROM books WHERE id = ?").get(id) as { path: string } | undefined;
    if (!bookRow) return null;
    const dataRow = conn
      .prepare("SELECT name FROM data WHERE book = ? AND format = ? COLLATE NOCASE")
      .get(id, format) as { name: string } | undefined;
    if (!dataRow) return null;
    const filePath = path.join(libraryPath, bookRow.path, `${dataRow.name}.${format.toLowerCase()}`);
    return existsSync(filePath) ? filePath : null;
  });
}
