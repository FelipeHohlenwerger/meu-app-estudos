import { NextRequest, NextResponse } from "next/server";
import { deleteBookComment, updateBookComment } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";

// PUT /api/book-comments/:id?vault=<id>  body: { tipo, comment } — altera um
// comentário GERAL já existente (não ancorado de .md, ver comentário em
// updateBookComment em vaultIndex.ts).
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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
    const { tipo, comment } = await request.json();
    if (!tipo || typeof tipo !== "string") {
      return NextResponse.json({ error: "Campo 'tipo' é obrigatório" }, { status: 400 });
    }
    if (!comment || typeof comment !== "string") {
      return NextResponse.json({ error: "Campo 'comment' é obrigatório" }, { status: 400 });
    }
    const updated = updateBookComment(vaultId, commentId, { tipo, comment });
    if (!updated) {
      return NextResponse.json({ error: "Comentário não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ comment: updated });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível alterar o comentário", details: String(error) },
      { status: 500 }
    );
  }
}

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
