import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { getCalibreFilePath } from "@/lib/calibreLibrary";

const MIME_TYPES: Record<string, string> = {
  PDF: "application/pdf",
  EPUB: "application/epub+zip",
};

// GET /api/calibre/file/:id?format=EPUB — bytes do arquivo do formato pedido
// pro visualizador (mesmo papel de /api/note/file, mas resolvendo o caminho
// via metadata.db em vez de um join com vault.path).
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const bookId = Number(id);
  const format = (request.nextUrl.searchParams.get("format") ?? "").toUpperCase();
  if (!Number.isInteger(bookId)) {
    return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  }
  const contentType = MIME_TYPES[format];
  if (!contentType) {
    return NextResponse.json({ error: "Formato não suportado" }, { status: 400 });
  }

  const filePath = getCalibreFilePath(bookId, format);
  if (!filePath) {
    return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  }

  const data = readFileSync(filePath);
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": contentType, "Cache-Control": "no-cache" },
  });
}
