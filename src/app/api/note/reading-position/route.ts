import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getReadingPosition, setReadingPosition } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";

// GET /api/note/reading-position?vault=<id>&filename=<f> -> { page, cfi } (ambos null se nunca salva)
export async function GET(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  const filename = request.nextUrl.searchParams.get("filename");
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  if (!filename) return NextResponse.json({ error: "Parâmetro 'filename' é obrigatório" }, { status: 400 });
  if (!getVaultById(vaultId)) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });

  const position = getReadingPosition(vaultId, path.basename(filename));
  return NextResponse.json(position ?? { page: null, cfi: null });
}

// PUT /api/note/reading-position?vault=<id>  body: { filename, page } OU { filename, cfi }
// Único caminho de escrita — sempre sobrescreve (nunca histórico).
export async function PUT(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  if (!getVaultById(vaultId)) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });

  try {
    const { filename, page, cfi } = await request.json();

    if (!filename || typeof filename !== "string") {
      return NextResponse.json({ error: "Campo 'filename' é obrigatório" }, { status: 400 });
    }
    const hasPage = page !== undefined;
    const hasCfi = cfi !== undefined;
    if (hasPage === hasCfi) {
      return NextResponse.json({ error: "Informe exatamente um de 'page' (número) ou 'cfi' (string)" }, { status: 400 });
    }
    if (hasPage && (typeof page !== "number" || !Number.isInteger(page))) {
      return NextResponse.json({ error: "Campo 'page' deve ser um número inteiro" }, { status: 400 });
    }
    if (hasCfi && typeof cfi !== "string") {
      return NextResponse.json({ error: "Campo 'cfi' deve ser uma string" }, { status: 400 });
    }

    setReadingPosition(vaultId, path.basename(filename), hasPage ? { page } : { cfi });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar a posição de leitura", details: String(error) },
      { status: 400 }
    );
  }
}
