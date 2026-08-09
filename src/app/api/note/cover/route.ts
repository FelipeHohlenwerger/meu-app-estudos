import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { ensureIndexFresh, setNoteCover } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";

// PUT /api/note/cover?vault=<id>  body: { filename: "teste.md", coverPath: "attachments/foo.jpg" | null }
// Único caminho de escrita da coluna `cover_manual_path`. `coverPath: null`
// remove a capa manual (a nota volta a mostrar a automática, se houver).
export async function PUT(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  if (!getVaultById(vaultId)) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });

  try {
    const { filename, coverPath } = await request.json();

    if (!filename || typeof filename !== "string") {
      return NextResponse.json({ error: "Campo 'filename' é obrigatório" }, { status: 400 });
    }
    if (coverPath !== null && typeof coverPath !== "string") {
      return NextResponse.json({ error: "Campo 'coverPath' deve ser uma string ou null" }, { status: 400 });
    }

    ensureIndexFresh(vaultId);
    setNoteCover(vaultId, path.basename(filename), coverPath);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar a capa da nota", details: String(error) },
      { status: 400 }
    );
  }
}
