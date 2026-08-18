import { NextRequest, NextResponse } from "next/server";
import { getLinkedBooks, unlinkNoteFromBook } from "@/lib/calibreAnnotations";
import { getCalibreBookById } from "@/lib/calibreLibrary";
import { getVaultById } from "@/lib/vaultRegistry";

// GET /api/note/calibre-links?vault=<id>&filename=X — livros do Calibre
// vinculados a esta nota (ver seção "Livros vinculados", NotePanel.tsx).
export async function GET(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  const filename = request.nextUrl.searchParams.get("filename");
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  if (!getVaultById(vaultId)) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });
  if (!filename) return NextResponse.json({ error: "Parâmetro 'filename' é obrigatório" }, { status: 400 });

  const bookIds = getLinkedBooks(vaultId, filename);
  const books = (await Promise.all(bookIds.map((id) => getCalibreBookById(id)))).filter((b) => b !== null);
  return NextResponse.json({ books });
}

// DELETE /api/note/calibre-links?vault=<id>&filename=X&calibreId=42
export async function DELETE(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  const filename = request.nextUrl.searchParams.get("filename");
  const calibreId = Number(request.nextUrl.searchParams.get("calibreId"));
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  if (!getVaultById(vaultId)) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });
  if (!filename || !Number.isInteger(calibreId)) {
    return NextResponse.json({ error: "Parâmetros 'filename' e 'calibreId' são obrigatórios" }, { status: 400 });
  }

  unlinkNoteFromBook(calibreId, vaultId, filename);
  return NextResponse.json({ success: true });
}
