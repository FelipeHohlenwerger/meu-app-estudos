import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { ensureIndexFresh, getBacklinks, getOutgoingLinks } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";

// GET /api/note/related?filename=teste.md&vault=<id> — notas ligadas a
// `filename` por link de saída OU backlink (um nível só, sem recursão), usado
// pelo escopo "+ Relacionadas" do chat com IA. Só notas .md vêm com conteúdo —
// PDF/EPUB relacionados entram só com o nome (extrair texto deles aqui
// ampliaria bastante o escopo deste endpoint).
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
    ensureIndexFresh(vaultId);
    const safeName = path.basename(filename);
    const names = new Set([...getOutgoingLinks(vaultId, safeName), ...getBacklinks(vaultId, safeName)]);

    const related = await Promise.all(
      Array.from(names).map(async (relatedFilename) => {
        const isMarkdown = /\.md$/i.test(relatedFilename);
        let content: string | null = null;
        if (isMarkdown) {
          try {
            content = await readFile(path.join(vault.path, relatedFilename), "utf-8");
          } catch {
            content = null;
          }
        }
        return { filename: relatedFilename, content };
      })
    );

    return NextResponse.json({ related });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível buscar notas relacionadas", details: String(error) },
      { status: 500 }
    );
  }
}
