import { NextResponse } from "next/server";
import { deleteCalibreBookComment, updateCalibreBookComment } from "@/lib/calibreAnnotations";

// PUT /api/calibre/book-comments/:id  body: { tipo, comment }
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const commentId = Number(id);
  if (!Number.isInteger(commentId)) {
    return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  }
  try {
    const { tipo, comment } = await request.json();
    if (!tipo || typeof tipo !== "string") {
      return NextResponse.json({ error: "Campo 'tipo' é obrigatório" }, { status: 400 });
    }
    if (!comment || typeof comment !== "string") {
      return NextResponse.json({ error: "Campo 'comment' é obrigatório" }, { status: 400 });
    }
    const updated = updateCalibreBookComment(commentId, { tipo, comment });
    if (!updated) {
      return NextResponse.json({ error: "Comentário não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ comment: updated });
  } catch (error) {
    return NextResponse.json({ error: "Não foi possível alterar o comentário", details: String(error) }, { status: 500 });
  }
}

// DELETE /api/calibre/book-comments/:id
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const commentId = Number(id);
  if (!Number.isInteger(commentId)) {
    return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  }
  deleteCalibreBookComment(commentId);
  return NextResponse.json({ success: true });
}
