import { NextRequest, NextResponse } from "next/server";
import { existsSync, statSync, writeFileSync } from "fs";
import path from "path";
import { ensureIndexFresh, reindexNote } from "@/lib/vaultIndex";
import { sanitizeFilename, findAvailableFilename } from "@/lib/slugify";
import { getVaultById } from "@/lib/vaultRegistry";

// POST ?vault=<id>, multipart/form-data { file }: importa um PDF/EPUB SEM
// convertê-lo — o arquivo original é salvo do jeito que é na vault (mesma
// fonte/layout, nunca reescrito). PDF abre no visualizador nativo do
// navegador (só leitura); EPUB abre no visualizador próprio, com marcação por
// cima (ver EpubViewer) — em vez do editor de texto.
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
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Campo 'file' é obrigatório" }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (ext !== ".pdf" && ext !== ".epub") {
      return NextResponse.json({ error: "Só arquivos .pdf ou .epub são aceitos" }, { status: 400 });
    }

    const baseName = path.basename(file.name, ext);
    const baseSlug = sanitizeFilename(baseName) || "nota-importada";
    const filename = findAvailableFilename(baseSlug, (f) => existsSync(path.join(vault.path, f)), undefined, ext);

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(vault.path, filename);
    writeFileSync(filePath, buffer);

    ensureIndexFresh(vaultId);
    const mtimeMs = statSync(filePath).mtimeMs;
    reindexNote(vaultId, filename, "", mtimeMs);

    return NextResponse.json({ filename });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível importar o arquivo", details: String(error) },
      { status: 500 }
    );
  }
}
