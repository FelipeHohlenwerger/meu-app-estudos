import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { getVaultById } from "@/lib/vaultRegistry";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
};

// GET /api/attachments/<filename>?vault=<id>: serve uma imagem salva em
// <vault>/attachments/. Precisa passar por uma rota (em vez de public/) pelo
// mesmo motivo das notas em /api/note: o arquivo mora fora do que o Next
// serve estaticamente.
export async function GET(request: NextRequest, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) {
    return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  }
  const vault = getVaultById(vaultId);
  if (!vault) {
    return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });
  }

  const safeFilename = path.basename(filename);
  const filePath = path.join(vault.path, "attachments", safeFilename);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Imagem não encontrada" }, { status: 404 });
  }

  const ext = path.extname(safeFilename).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
  const data = readFileSync(filePath);

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
