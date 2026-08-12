import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { getCalibreCoverPath, isCalibreBusyError } from "@/lib/calibreLibrary";

// GET /api/calibre/cover/:id — bytes da capa real armazenada pelo Calibre
// (cover.jpg na pasta do livro). 404 quando não há capa — o front cai pro
// ícone de tipo, mesmo padrão de NoteCard.tsx sem coverPath.
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const bookId = Number(id);
  if (!Number.isInteger(bookId)) {
    return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  }

  try {
    const coverPath = await getCalibreCoverPath(bookId);
    if (!coverPath) {
      return NextResponse.json({ error: "Capa não encontrada" }, { status: 404 });
    }

    const data = readFileSync(coverPath);
    return new NextResponse(new Uint8Array(data), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-cache" },
    });
  } catch (error) {
    console.error(`[api/calibre/cover/${bookId}] falha ao ler capa — User-Agent:`, request.headers.get("user-agent"), error);
    return NextResponse.json(
      { error: isCalibreBusyError(error) ? "Biblioteca Calibre ocupada" : "Não foi possível ler a capa", code: isCalibreBusyError(error) ? "busy" : "error" },
      { status: 500 }
    );
  }
}
