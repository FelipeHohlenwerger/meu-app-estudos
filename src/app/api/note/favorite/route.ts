import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { ensureIndexFresh, setNoteFavorite } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";

// PUT /api/note/favorite?vault=<id>  body: { filename: "teste.md", isFavorite: true }
// Único caminho de escrita da coluna `is_favorite`.
export async function PUT(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  if (!getVaultById(vaultId)) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });

  try {
    const { filename, isFavorite } = await request.json();

    if (!filename || typeof filename !== "string") {
      return NextResponse.json({ error: "Campo 'filename' é obrigatório" }, { status: 400 });
    }
    if (typeof isFavorite !== "boolean") {
      return NextResponse.json({ error: "Campo 'isFavorite' deve ser um booleano" }, { status: 400 });
    }

    ensureIndexFresh(vaultId);
    setNoteFavorite(vaultId, path.basename(filename), isFavorite);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar o favorito da nota", details: String(error) },
      { status: 400 }
    );
  }
}
