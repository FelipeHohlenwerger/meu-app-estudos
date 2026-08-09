import { NextRequest, NextResponse } from "next/server";
import { createCalibreBookComment, getCalibreBookComments } from "@/lib/calibreAnnotations";

// GET /api/calibre/book-comments?calibreId=42 — mesma forma de
// GET /api/book-comments, chaveado por calibreId em vez de filename.
export async function GET(request: NextRequest) {
  const calibreId = Number(request.nextUrl.searchParams.get("calibreId"));
  if (!Number.isInteger(calibreId)) {
    return NextResponse.json({ error: "Parâmetro 'calibreId' é obrigatório" }, { status: 400 });
  }
  return NextResponse.json({ comments: getCalibreBookComments(calibreId) });
}

// POST body: { calibreId, tipo, comment } (comentário geral, PDF)
//        ou: { calibreId, tipo, comment, anchorCfi, anchorText } (ancorado
//        auto-contido de EPUB, gerado pelas ações de IA — mesmo formato de
//        POST /api/book-comments).
export async function POST(request: NextRequest) {
  try {
    const { calibreId, tipo, comment, anchorCfi, anchorText } = await request.json();

    if (!Number.isInteger(calibreId)) {
      return NextResponse.json({ error: "Campo 'calibreId' é obrigatório" }, { status: 400 });
    }
    if (!tipo || typeof tipo !== "string") {
      return NextResponse.json({ error: "Campo 'tipo' é obrigatório" }, { status: 400 });
    }
    if (!comment || typeof comment !== "string") {
      return NextResponse.json({ error: "Campo 'comment' é obrigatório" }, { status: 400 });
    }

    const created = createCalibreBookComment(calibreId, {
      tipo,
      comment,
      anchorCfi: typeof anchorCfi === "string" ? anchorCfi : undefined,
      anchorText: typeof anchorText === "string" ? anchorText : undefined,
    });
    return NextResponse.json({ comment: created });
  } catch (error) {
    return NextResponse.json({ error: "Não foi possível salvar o comentário", details: String(error) }, { status: 500 });
  }
}
