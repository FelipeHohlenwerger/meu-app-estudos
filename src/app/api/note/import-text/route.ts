import { NextRequest, NextResponse } from "next/server";
import { existsSync, statSync, writeFileSync } from "fs";
import path from "path";
import { ensureIndexFresh, reindexNote } from "@/lib/vaultIndex";
import { sanitizeFilename, findAvailableFilename, TEXT_NOTE_IMPORT_EXTENSIONS } from "@/lib/slugify";
import { getVaultById } from "@/lib/vaultRegistry";

const MAX_IMPORT_TEXT_FILE_BYTES = 5 * 1024 * 1024; // 5MB — generoso pra transcrição/nota de texto puro

// Acima desse número de "�" (caractere de substituição, produzido pelo
// decode UTF-8 de bytes que não formam UTF-8 válido), trata o arquivo como
// ilegível em vez de importar um texto corrompido silenciosamente — sinal
// simples, sem precisar de biblioteca de detecção de encoding.
const MOJIBAKE_THRESHOLD = 3;

// Referência a imagem LOCAL (não http(s)/data:) no corpo do markdown — só
// pra avisar o usuário que ela pode aparecer quebrada (imagens não são
// copiadas nesta importação, só o texto).
const LOCAL_IMAGE_REF_RE = /!\[[^\]]*\]\((?!https?:\/\/|data:)([^)]+)\)/i;

type ImportedFile = { filename: string; originalName: string; renamed: boolean; hasLocalImageRefs: boolean };
type FailedFile = { originalName: string; reason: string };

// POST ?vault=<id>, multipart/form-data com um ou mais campos "files": importa
// notas de texto (.md/.markdown/.txt) já prontas do computador do usuário —
// conteúdo copiado exatamente como está (front-matter incluso, se houver),
// sempre salvo com extensão .md (o índice da vault só reconhece
// .md/.pdf/.epub, ver runFullReconciliation em vaultIndex.ts). Falha em UM
// arquivo nunca derruba o lote inteiro — cada um é reportado individualmente
// em "imported" ou "failed".
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
    const files = formData.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    // Mesma ordem de import/route.ts: ensureIndexFresh ANTES de escrever —
    // garante o índice/schema inicializado antes dos reindexNote() abaixo.
    ensureIndexFresh(vaultId);

    const imported: ImportedFile[] = [];
    const failed: FailedFile[] = [];
    // Nomes já usados NESTE lote — além do existsSync (disco), pra dois
    // arquivos do mesmo request não colidirem entre si antes de qualquer um
    // ter sido escrito ainda.
    const claimedInBatch = new Set<string>();
    const existsOnDiskOrBatch = (filename: string) =>
      claimedInBatch.has(filename) || existsSync(path.join(vault.path, filename));

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      if (!TEXT_NOTE_IMPORT_EXTENSIONS.includes(ext as (typeof TEXT_NOTE_IMPORT_EXTENSIONS)[number])) {
        failed.push({ originalName: file.name, reason: "Tipo de arquivo não suportado" });
        continue;
      }
      if (file.size > MAX_IMPORT_TEXT_FILE_BYTES) {
        failed.push({ originalName: file.name, reason: "Arquivo grande demais" });
        continue;
      }

      let content: string;
      try {
        content = await file.text();
      } catch {
        failed.push({ originalName: file.name, reason: "Não foi possível ler o arquivo" });
        continue;
      }
      const mojibakeCount = (content.match(/�/g) ?? []).length;
      if (mojibakeCount > MOJIBAKE_THRESHOLD) {
        failed.push({ originalName: file.name, reason: "Não foi possível interpretar a codificação do arquivo" });
        continue;
      }

      const baseName = path.basename(file.name, ext);
      const baseSlug = sanitizeFilename(baseName) || "nota-importada";
      const filename = findAvailableFilename(baseSlug, existsOnDiskOrBatch, undefined, ".md");
      claimedInBatch.add(filename);

      const filePath = path.join(vault.path, filename);
      writeFileSync(filePath, content);
      const mtimeMs = statSync(filePath).mtimeMs;
      reindexNote(vaultId, filename, content, mtimeMs);

      imported.push({
        filename,
        originalName: file.name,
        renamed: filename !== `${baseSlug}.md`,
        hasLocalImageRefs: LOCAL_IMAGE_REF_RE.test(content),
      });
    }

    return NextResponse.json({ imported, failed });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível importar os arquivos", details: String(error) },
      { status: 500 }
    );
  }
}
