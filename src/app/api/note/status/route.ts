import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { ensureIndexFresh, setNoteStatus } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";

// PUT /api/note/status?vault=<id>  body: { filename: "teste.md", status: "lendo" }
// Único caminho de escrita da coluna `status` (não é mais derivada da linha
// "status:" do corpo do arquivo — ver src/lib/noteStatus.ts).
export async function PUT(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  if (!getVaultById(vaultId)) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });

  try {
    const { filename, status } = await request.json();

    if (!filename || typeof filename !== "string") {
      return NextResponse.json({ error: "Campo 'filename' é obrigatório" }, { status: 400 });
    }
    if (!status || typeof status !== "string") {
      return NextResponse.json({ error: "Campo 'status' é obrigatório" }, { status: 400 });
    }

    ensureIndexFresh(vaultId);
    setNoteStatus(vaultId, path.basename(filename), status);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar o status da nota", details: String(error) },
      { status: 400 }
    );
  }
}
