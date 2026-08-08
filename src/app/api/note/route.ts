import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, stat, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import {
  ensureIndexFresh,
  getBacklinks,
  getNoteStatusInfo,
  getNoteTags,
  reindexNote,
  removeNoteFromIndex,
  touchActivity,
} from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";

// Função de segurança: garante que o nome do arquivo não "escapa" da vault
// (ex: impede algo como "../../etc/passwd")
function resolveNotePath(vaultPath: string, filename: string): string {
  const safeName = path.basename(filename); // remove qualquer caminho, só o nome do arquivo
  return path.join(vaultPath, safeName);
}

// GET /api/note?filename=teste.md&vault=<id>
export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get("filename");
  const vaultId = request.nextUrl.searchParams.get("vault");

  if (!filename) {
    return NextResponse.json({ error: "Parâmetro 'filename' é obrigatório" }, { status: 400 });
  }
  if (!vaultId) {
    return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  }
  const vault = getVaultById(vaultId);
  if (!vault) {
    return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });
  }

  try {
    const filePath = resolveNotePath(vault.path, filename);
    // .pdf/.epub são binários — nunca decodificados como UTF-8; o visualizador
    // busca os bytes originais direto de /api/note/file quando precisa deles.
    const isMarkdown = /\.md$/i.test(filePath);
    const content = isMarkdown ? await readFile(filePath, "utf-8") : "";

    ensureIndexFresh(vaultId);
    const backlinks = getBacklinks(vaultId, path.basename(filePath));
    const tags = getNoteTags(vaultId, path.basename(filePath));
    const statusInfo = getNoteStatusInfo(vaultId, path.basename(filePath));

    return NextResponse.json({
      content,
      backlinks,
      tags,
      status: statusInfo?.status,
      contentType: statusInfo?.contentType,
      isFavorite: statusInfo?.isFavorite ?? false,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível ler o arquivo", details: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/note?vault=<id>  body: { filename: "teste.md", content: "..." }
export async function POST(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) {
    return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  }
  const vault = getVaultById(vaultId);
  if (!vault) {
    return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });
  }

  try {
    const { filename, content } = await request.json();

    if (!filename) {
      return NextResponse.json({ error: "Campo 'filename' é obrigatório" }, { status: 400 });
    }

    const filePath = resolveNotePath(vault.path, filename);
    await writeFile(filePath, content, "utf-8");

    // Garante que o resto da vault já foi indexado ao menos uma vez (caso este
    // POST seja a primeira requisição do processo), e reprocessa só este arquivo.
    ensureIndexFresh(vaultId);
    const stats = await stat(filePath);
    reindexNote(vaultId, path.basename(filePath), content, stats.mtimeMs);
    touchActivity(vaultId, path.basename(filePath));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar o arquivo", details: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/note?filename=teste.md&vault=<id> — apaga o arquivo do disco e
// some com ele do índice (tags/aliases/links/blocks vão junto via ON DELETE CASCADE).
export async function DELETE(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get("filename");
  const vaultId = request.nextUrl.searchParams.get("vault");

  if (!filename) {
    return NextResponse.json({ error: "Parâmetro 'filename' é obrigatório" }, { status: 400 });
  }
  if (!vaultId) {
    return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  }
  const vault = getVaultById(vaultId);
  if (!vault) {
    return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });
  }

  try {
    const filePath = resolveNotePath(vault.path, filename);
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "Nota não encontrada" }, { status: 404 });
    }

    await unlink(filePath);

    ensureIndexFresh(vaultId);
    removeNoteFromIndex(vaultId, path.basename(filePath));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível apagar o arquivo", details: String(error) },
      { status: 500 }
    );
  }
}
