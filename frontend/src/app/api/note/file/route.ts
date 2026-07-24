import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { getVaultById } from "@/lib/vaultRegistry";

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
};

// GET /api/note/file?filename=livro.pdf&vault=<id> — serve o binário original
// de uma nota .pdf/.epub pro visualizador (o arquivo nunca é
// convertido/alterado; isso só faz streaming dos bytes que já estão na vault).
export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get("filename");
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!filename) {
    return NextResponse.json({ error: "Parâmetro 'filename' é obrigatório" }, { status: 400 });
  }
  if (!vaultId) {
    return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  }
  const vault = getVaultById(vaultId);
  if (!vault) {
    return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });
  }

  const safeFilename = path.basename(filename);
  const ext = path.extname(safeFilename).toLowerCase();
  const contentType = MIME_TYPES[ext];
  if (!contentType) {
    return NextResponse.json({ error: "Extensão não suportada" }, { status: 400 });
  }

  const filePath = path.join(vault.path, safeFilename);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  }

  const data = readFileSync(filePath);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
    },
  });
}
