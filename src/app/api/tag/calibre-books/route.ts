import { NextRequest, NextResponse } from "next/server";
import { ensureIndexFresh, getCalibreBooksForTagPath } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";
import { listCalibreBooks } from "@/lib/calibreLibrary";

// GET ?vault=<id>&tag=<tagPath> -> { books: CalibreBook[] }
// Livros do Calibre relacionados INDIRETAMENTE a um tema — via [[Título]] ou
// "Vincular" em qualquer nota cuja tag bate com tagPath (ou um subtema, em
// qualquer profundidade). Ver getCalibreBooksForTagPath em vaultIndex.ts.
export async function GET(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  const tag = request.nextUrl.searchParams.get("tag");
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  if (!tag) return NextResponse.json({ error: "Parâmetro 'tag' é obrigatório" }, { status: 400 });
  if (!getVaultById(vaultId)) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });

  try {
    ensureIndexFresh(vaultId);
    const calibreBooks = await listCalibreBooks();
    return NextResponse.json({ books: getCalibreBooksForTagPath(vaultId, tag, calibreBooks) });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível buscar os livros do tema", details: String(error) },
      { status: 500 }
    );
  }
}
