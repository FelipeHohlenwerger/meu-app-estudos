import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { createBookComment, ensureIndexFresh, getBookComments } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";

// GET /api/book-comments?filename=livro.pdf&vault=<id> — comentários gerais do
// PDF/EPUB, em ordem de criação (mais antigo primeiro).
export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get("filename");
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!filename) {
    return NextResponse.json({ error: "Parâmetro 'filename' é obrigatório" }, { status: 400 });
  }
  if (!vaultId) {
    return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  }
  if (!getVaultById(vaultId)) {
    return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });
  }

  ensureIndexFresh(vaultId);
  const comments = getBookComments(vaultId, path.basename(filename));
  return NextResponse.json({ comments });
}

// POST ?vault=<id>  body: { filename, tipo, comment } (comentário geral)
//                     ou body: { filename, anchored: true } (placeholder de
//                     comentário ancorado de .md — conteúdo vive no texto da
//                     nota, essa linha só existe pra dar um id/ordem de
//                     criação)
//                     ou body: { filename, anchored: true, tipo, comment,
//                     anchorCfi, anchorText } (comentário ancorado
//                     "auto-contido" de EPUB, gerado pelas ações de IA — não
//                     tem texto editável pra guardar tipo/comentário/âncora
//                     em outro lugar).
export async function POST(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) {
    return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  }
  if (!getVaultById(vaultId)) {
    return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });
  }

  try {
    const { filename, tipo, comment, anchored, anchorCfi, anchorText } = await request.json();

    if (!filename || typeof filename !== "string") {
      return NextResponse.json({ error: "Campo 'filename' é obrigatório" }, { status: 400 });
    }

    if (anchored && typeof anchorCfi === "string" && anchorCfi) {
      if (!tipo || typeof tipo !== "string") {
        return NextResponse.json({ error: "Campo 'tipo' é obrigatório" }, { status: 400 });
      }
      if (!comment || typeof comment !== "string") {
        return NextResponse.json({ error: "Campo 'comment' é obrigatório" }, { status: 400 });
      }
      ensureIndexFresh(vaultId);
      const bookComment = createBookComment(vaultId, path.basename(filename), {
        anchored: true,
        tipo,
        comment,
        anchorCfi,
        anchorText: typeof anchorText === "string" ? anchorText : undefined,
      });
      return NextResponse.json({ comment: bookComment });
    }

    if (anchored) {
      ensureIndexFresh(vaultId);
      const bookComment = createBookComment(vaultId, path.basename(filename), { anchored: true });
      return NextResponse.json({ comment: bookComment });
    }

    if (!tipo || typeof tipo !== "string") {
      return NextResponse.json({ error: "Campo 'tipo' é obrigatório" }, { status: 400 });
    }
    if (!comment || typeof comment !== "string") {
      return NextResponse.json({ error: "Campo 'comment' é obrigatório" }, { status: 400 });
    }

    ensureIndexFresh(vaultId);
    const bookComment = createBookComment(vaultId, path.basename(filename), { tipo, comment });

    return NextResponse.json({ comment: bookComment });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar o comentário", details: String(error) },
      { status: 500 }
    );
  }
}
