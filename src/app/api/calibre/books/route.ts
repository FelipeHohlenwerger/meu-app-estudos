import { NextRequest, NextResponse } from "next/server";
import { isCalibreBusyError, listCalibreBooks } from "@/lib/calibreLibrary";

// GET: lista achatada de TODOS os livros da biblioteca Calibre configurada
// (vazia se não houver biblioteca configurada) — filtragem/agrupamento por
// Assunto/Série/Autor/busca é feito no front-end, mesmo padrão já usado pra
// notas/tags (getLibraryData + buildTagTree client-side).
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ books: await listCalibreBooks() });
  } catch (error) {
    // User-Agent no log ajuda a confirmar/descartar diferença mobile x
    // desktop em relatos de falha — a causa mais provável (lock do Calibre
    // catalogando) já é tratada com retry em calibreLibrary.ts, então chegar
    // aqui significa que esgotou as tentativas.
    console.error("[api/calibre/books] falha ao listar livros — User-Agent:", request.headers.get("user-agent"), error);
    const busy = isCalibreBusyError(error);
    return NextResponse.json(
      {
        error: busy
          ? "A biblioteca Calibre está ocupada no momento (provavelmente sendo catalogada). Tente novamente em alguns segundos."
          : "Não foi possível ler a biblioteca Calibre",
        code: busy ? "busy" : "error",
        details: String(error),
      },
      { status: 500 }
    );
  }
}
