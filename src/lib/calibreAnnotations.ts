import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "fs";
import path from "path";

// Comentários feitos em livros do Calibre ficam num banco próprio, GLOBAL
// (não dentro de nenhum vault) — um livro do Calibre pode ser linkado a
// partir de qualquer vault, então não faz sentido escopar isso a um vault
// específico. Mesma raiz ~/.study-app/ usada por vaults/índice, só que numa
// pasta irmã (calibre-index/, não index/<vaultId>/).
const DB_DIR = path.join(process.env.HOME || "", ".study-app", "calibre-index");
const DB_PATH = path.join(DB_DIR, "calibre-annotations.sqlite");

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;
  if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
  const conn = new DatabaseSync(DB_PATH, { enableForeignKeyConstraints: true });
  conn.exec(`
    CREATE TABLE IF NOT EXISTS calibre_book_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      calibre_book_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      comment TEXT NOT NULL,
      anchor_cfi TEXT,
      anchor_text TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_calibre_book_comments_book ON calibre_book_comments(calibre_book_id);

    -- Vínculo nota↔livro (metadado puro, não insere texto na nota — ver
    -- botão "Vincular" no visualizador, NotePanel.tsx). GLOBAL pelo mesmo
    -- motivo dos comentários acima: uma nota de QUALQUER vault pode vincular
    -- a este livro, então não faz sentido escopar por vault.
    CREATE TABLE IF NOT EXISTS calibre_book_note_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      calibre_book_id INTEGER NOT NULL,
      vault_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      UNIQUE(calibre_book_id, vault_id, filename)
    );
    CREATE INDEX IF NOT EXISTS idx_calibre_note_links_book ON calibre_book_note_links(calibre_book_id);
    CREATE INDEX IF NOT EXISTS idx_calibre_note_links_note ON calibre_book_note_links(vault_id, filename);

    -- Favorito de livro do Calibre — GLOBAL pelo mesmo motivo das tabelas
    -- acima: o livro em si não pertence a nenhum vault, então "favoritado"
    -- não pode ser um conceito por vault (diferente de notes.is_favorite,
    -- que é uma coluna por vault porque a nota em si é de um vault).
    CREATE TABLE IF NOT EXISTS calibre_book_favorites (
      calibre_book_id INTEGER PRIMARY KEY,
      favorited_at INTEGER NOT NULL
    );

    -- Posição de leitura salva automaticamente por livro do Calibre — mesma
    -- coisa que reading_positions (vaultIndex.ts), GLOBAL pelo mesmo motivo
    -- das tabelas acima. Chaveada por (calibre_book_id, format), NÃO só
    -- calibre_book_id: um livro com mais de um formato disponível pode ser
    -- reaberto em qualquer um deles (ver seletor de formato em "Mais
    -- opções", NotePanel.tsx) — página de PDF e CFI de EPUB do "mesmo"
    -- livro não têm relação nenhuma entre si.
    CREATE TABLE IF NOT EXISTS calibre_reading_positions (
      calibre_book_id INTEGER NOT NULL,
      format TEXT NOT NULL,
      page INTEGER,
      cfi TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (calibre_book_id, format)
    );
  `);
  db = conn;
  return conn;
}

// Mesma forma de BookComment (vaultIndex.ts) — "anchored" sempre implícito
// true aqui já que não existe comentário ancorado de texto pra livro do
// Calibre (nunca há .md editável); comentário sem anchorCfi é "geral"
// (PDF), com anchorCfi é ancorado auto-contido de EPUB (gerado pelas ações
// de IA), mesmo espírito de book_comments.
export type CalibreBookComment = {
  id: number;
  tipo: string;
  comment: string;
  anchorCfi?: string | null;
  anchorText?: string | null;
};

export function getCalibreBookComments(calibreBookId: number): CalibreBookComment[] {
  const conn = getDb();
  const rows = conn
    .prepare(
      "SELECT id, tipo, comment, anchor_cfi, anchor_text FROM calibre_book_comments WHERE calibre_book_id = ? ORDER BY id ASC"
    )
    .all(calibreBookId) as { id: number; tipo: string; comment: string; anchor_cfi: string | null; anchor_text: string | null }[];
  return rows.map((r) => ({ id: r.id, tipo: r.tipo, comment: r.comment, anchorCfi: r.anchor_cfi, anchorText: r.anchor_text }));
}

export function createCalibreBookComment(
  calibreBookId: number,
  data: { tipo: string; comment: string; anchorCfi?: string; anchorText?: string }
): CalibreBookComment {
  const conn = getDb();
  const anchorCfi = data.anchorCfi ?? null;
  const anchorText = data.anchorText ?? null;
  const result = conn
    .prepare("INSERT INTO calibre_book_comments (calibre_book_id, tipo, comment, anchor_cfi, anchor_text) VALUES (?, ?, ?, ?, ?)")
    .run(calibreBookId, data.tipo, data.comment, anchorCfi, anchorText);
  return { id: Number(result.lastInsertRowid), tipo: data.tipo, comment: data.comment, anchorCfi, anchorText };
}

export function deleteCalibreBookComment(id: number): void {
  getDb().prepare("DELETE FROM calibre_book_comments WHERE id = ?").run(id);
}

// Notas (de qualquer vault) vinculadas a este livro — a UI resolve o título
// de cada uma chamando getAllNoteTargets(vaultId) por vault distinto (ver
// GET /api/calibre/note-links), já que o título vive no índice do vault, não
// aqui.
export function getLinkedNotes(calibreBookId: number): { vaultId: string; filename: string }[] {
  const rows = getDb()
    .prepare("SELECT vault_id, filename FROM calibre_book_note_links WHERE calibre_book_id = ? ORDER BY id ASC")
    .all(calibreBookId) as { vault_id: string; filename: string }[];
  return rows.map((r) => ({ vaultId: r.vault_id, filename: r.filename }));
}

// Livros vinculados a esta nota — usado pela seção "Livros vinculados" do
// lado da nota (NotePanel.tsx).
export function getLinkedBooks(vaultId: string, filename: string): number[] {
  const rows = getDb()
    .prepare("SELECT calibre_book_id FROM calibre_book_note_links WHERE vault_id = ? AND filename = ? ORDER BY id ASC")
    .all(vaultId, filename) as { calibre_book_id: number }[];
  return rows.map((r) => r.calibre_book_id);
}

// Mesma coisa que getLinkedBooks, mas pra várias notas de uma vez, agrupado
// por filename — usado pelo Graph View (getLocalGraph/getGlobalGraph,
// vaultIndex.ts) pra enriquecer o grafo com os vínculos da Parte "Vincular"
// sem uma query por nota visitada.
export function getLinkedBooksForNotes(vaultId: string, filenames: string[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  if (filenames.length === 0) return map;
  const placeholders = filenames.map(() => "?").join(",");
  const rows = getDb()
    .prepare(`SELECT filename, calibre_book_id FROM calibre_book_note_links WHERE vault_id = ? AND filename IN (${placeholders})`)
    .all(vaultId, ...filenames) as { filename: string; calibre_book_id: number }[];
  for (const row of rows) {
    const list = map.get(row.filename) ?? [];
    list.push(row.calibre_book_id);
    map.set(row.filename, list);
  }
  return map;
}

export function linkNoteToBook(calibreBookId: number, vaultId: string, filename: string): void {
  getDb()
    .prepare("INSERT OR IGNORE INTO calibre_book_note_links (calibre_book_id, vault_id, filename) VALUES (?, ?, ?)")
    .run(calibreBookId, vaultId, filename);
}

export function unlinkNoteFromBook(calibreBookId: number, vaultId: string, filename: string): void {
  getDb()
    .prepare("DELETE FROM calibre_book_note_links WHERE calibre_book_id = ? AND vault_id = ? AND filename = ?")
    .run(calibreBookId, vaultId, filename);
}

// Ids dos livros favoritados, mais recente primeiro — o client já tem
// calibreBooks completo carregado à parte (GET /api/calibre/books), então
// aqui basta devolver os ids pra montar o Set local.
export function getFavoriteCalibreBookIds(): number[] {
  const rows = getDb()
    .prepare("SELECT calibre_book_id FROM calibre_book_favorites ORDER BY favorited_at DESC")
    .all() as { calibre_book_id: number }[];
  return rows.map((r) => r.calibre_book_id);
}

export function setCalibreBookFavorite(calibreBookId: number, isFavorite: boolean): void {
  const conn = getDb();
  if (isFavorite) {
    conn.prepare("INSERT OR IGNORE INTO calibre_book_favorites (calibre_book_id, favorited_at) VALUES (?, ?)").run(calibreBookId, Date.now());
  } else {
    conn.prepare("DELETE FROM calibre_book_favorites WHERE calibre_book_id = ?").run(calibreBookId);
  }
}

// Mesma forma de ReadingPosition (vaultIndex.ts) — duplicada aqui, não
// importada de lá, pra não criar um import circular (vaultIndex.ts é quem
// já importa DESTE arquivo, nunca o contrário).
export type CalibreReadingPosition = { page: number | null; cfi: string | null };

export function getCalibreReadingPosition(calibreBookId: number, format: string): CalibreReadingPosition | null {
  const row = getDb()
    .prepare("SELECT page, cfi FROM calibre_reading_positions WHERE calibre_book_id = ? AND format = ?")
    .get(calibreBookId, format) as { page: number | null; cfi: string | null } | undefined;
  return row ?? null;
}

export function setCalibreReadingPosition(calibreBookId: number, format: string, data: { page?: number; cfi?: string }): void {
  getDb()
    .prepare(
      `INSERT INTO calibre_reading_positions (calibre_book_id, format, page, cfi, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(calibre_book_id, format) DO UPDATE SET page = excluded.page, cfi = excluded.cfi, updated_at = excluded.updated_at`
    )
    .run(calibreBookId, format, data.page ?? null, data.cfi ?? null, Date.now());
}
