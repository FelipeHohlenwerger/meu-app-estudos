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
