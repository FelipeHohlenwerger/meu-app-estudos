import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { ensureIndexFresh, setNoteTags } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";

// PUT /api/note/tags?vault=<id>  body: { filename: "teste.md", tags: ["conceito", "prova-final"] }
// Substitui a lista inteira de tags da nota — único caminho de escrita da tabela
// `tags` (desde que ela deixou de ser derivada de "#palavra" no corpo do texto).
export async function PUT(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  if (!getVaultById(vaultId)) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });

  try {
    const { filename, tags } = await request.json();

    if (!filename || typeof filename !== "string") {
      return NextResponse.json({ error: "Campo 'filename' é obrigatório" }, { status: 400 });
    }
    if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) {
      return NextResponse.json({ error: "Campo 'tags' deve ser uma lista de strings" }, { status: 400 });
    }

    ensureIndexFresh(vaultId);
    setNoteTags(vaultId, path.basename(filename), tags);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar as tags da nota", details: String(error) },
      { status: 500 }
    );
  }
}
