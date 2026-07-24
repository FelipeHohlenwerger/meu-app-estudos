import { NextRequest, NextResponse } from "next/server";
import { deleteBookComment } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";

// DELETE /api/book-comments/:id?vault=<id> — remove um comentário geral do PDF/EPUB.
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const vaultId = request.nextUrl.searchParams.get("vault");
  const commentId = Number(id);
  if (!Number.isInteger(commentId)) {
    return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  }
  if (!vaultId) {
    return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  }
  if (!getVaultById(vaultId)) {
    return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });
  }

  try {
    deleteBookComment(vaultId, commentId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível apagar o comentário", details: String(error) },
      { status: 500 }
    );
  }
}
