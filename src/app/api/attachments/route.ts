import { NextRequest, NextResponse } from "next/server";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { sanitizeFilename, findAvailableFilename } from "@/lib/slugify";
import { getVaultById } from "@/lib/vaultRegistry";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"]);

// POST ?vault=<id>, multipart/form-data { file }: salva uma imagem
// colada/arrastada/selecionada dentro de <vault>/attachments/ e devolve o
// caminho relativo pra inserir na nota (ver src/lib/imageSyntax.ts pra
// sintaxe usada no markdown).
export async function POST(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) {
    return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  }
  const vault = getVaultById(vaultId);
  if (!vault) {
    return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });
  }
  const attachmentsDir = path.join(vault.path, "attachments");

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Campo 'file' é obrigatório" }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase() || ".png";
    if (!IMAGE_EXTENSIONS.has(ext) && !file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Só arquivos de imagem são aceitos" }, { status: 400 });
    }

    if (!existsSync(attachmentsDir)) {
      mkdirSync(attachmentsDir, { recursive: true });
    }

    const baseName = path.basename(file.name, path.extname(file.name));
    const baseSlug = sanitizeFilename(baseName) || "imagem";
    const filename = findAvailableFilename(baseSlug, (f) => existsSync(path.join(attachmentsDir, f)), undefined, ext);

    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(path.join(attachmentsDir, filename), buffer);

    return NextResponse.json({ path: `attachments/${filename}` });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar a imagem", details: String(error) },
      { status: 500 }
    );
  }
}
