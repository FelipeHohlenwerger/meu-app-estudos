import { NextResponse } from "next/server";
import { deleteCalibreBookComment } from "@/lib/calibreAnnotations";

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
