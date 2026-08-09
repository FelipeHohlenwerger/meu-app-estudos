import { NextResponse } from "next/server";
import { listCalibreBooks } from "@/lib/calibreLibrary";

// GET: lista achatada de TODOS os livros da biblioteca Calibre configurada
// (vazia se não houver biblioteca configurada) — filtragem/agrupamento por
// Assunto/Série/Autor/busca é feito no front-end, mesmo padrão já usado pra
// notas/tags (getLibraryData + buildTagTree client-side).
export async function GET() {
  try {
    return NextResponse.json({ books: listCalibreBooks() });
  } catch (error) {
    return NextResponse.json({ error: "Não foi possível ler a biblioteca Calibre", details: String(error) }, { status: 500 });
  }
}
