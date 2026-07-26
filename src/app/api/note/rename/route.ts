import { NextRequest, NextResponse } from "next/server";
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "fs";
import path from "path";
import { ensureIndexFresh, reindexNote, renameNoteInIndex } from "@/lib/vaultIndex";
import { sanitizeFilename } from "@/lib/slugify";
import { getVaultById } from "@/lib/vaultRegistry";

function stripMdExtension(filename: string): string {
  return filename.replace(/\.(md|pdf|epub)$/i, "");
}

// Sem RegExp.escape aqui de propósito — mesma razão de note/mentions/route.ts: API
// recente demais pro piso mínimo de Node do projeto (>=22.5.0).
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Reescreve, dentro de "[[...]]" ou "![[...]]", só a parte do nome da nota — deixando
// intacto um eventual "#^id" de referência/embed de bloco.
function rewriteNoteNameInLinks(content: string, oldNameNoExt: string, newNameNoExt: string): string {
  const escaped = escapeRegExp(oldNameNoExt);
  const regex = new RegExp(`(\\[\\[)${escaped}(?=(?:#\\^[^\\]]+)?\\]\\])`, "gi");
  return content.replace(regex, `$1${newNameNoExt}`);
}

// Todos os outros arquivos .md da vault — usado pra reescrever referências ao nome
// antigo. Varredura direta do texto (não via índice): o índice de links só guarda
// "[[nome]]" simples, não "[[nome#^id]]"/"![[nome#^id]]" (referência/embed de
// bloco não é um link de verdade), então uma consulta ao índice deixaria essas
// duas sintaxes de fora. Renomear é uma ação rara e deliberada, então o custo de
// ler todo mundo é aceitável.
function listOtherNoteFiles(vaultPath: string, excludeFilenames: string[]): string[] {
  const exclude = new Set(excludeFilenames);
  return readdirSync(vaultPath).filter((f) => f.endsWith(".md") && !exclude.has(f));
}

// POST ?vault=<id>  body: { oldFilename, newTitle } — renomeia o arquivo no
// disco, atualiza o índice (mantendo o mesmo id, então tags/aliases/links/
// blocks continuam associados) e reescreve, nas outras notas, qualquer
// "[[nome-antigo]]"/"![[nome-antigo#^id]]" que apontava pra ela por nome de
// arquivo (links por título/alias não precisam de nada: continuam resolvendo
// do jeito que já resolviam).
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
    const { oldFilename, newTitle } = await request.json();
    if (!oldFilename || typeof oldFilename !== "string") {
      return NextResponse.json({ error: "Campo 'oldFilename' é obrigatório" }, { status: 400 });
    }
    if (!newTitle || typeof newTitle !== "string" || !newTitle.trim()) {
      return NextResponse.json({ error: "Campo 'newTitle' é obrigatório" }, { status: 400 });
    }

    const safeOldFilename = path.basename(oldFilename);
    const oldPath = path.join(vault.path, safeOldFilename);
    if (!existsSync(oldPath)) {
      return NextResponse.json({ error: "Nota não encontrada" }, { status: 404 });
    }

    const ext = path.extname(safeOldFilename); // preserva a extensão original (.md/.pdf/.epub)
    const baseSlug = sanitizeFilename(newTitle) || "nota";
    const newFilename = `${baseSlug}${ext}`;

    // Colisão de nome: avisa e não faz nada, em vez de sufixar "-2"/"-3" sozinho.
    if (newFilename !== safeOldFilename && existsSync(path.join(vault.path, newFilename))) {
      return NextResponse.json({ error: "Já existe uma nota com esse nome" }, { status: 409 });
    }

    ensureIndexFresh(vaultId);

    if (newFilename !== safeOldFilename) {
      const filesToRewrite = listOtherNoteFiles(vault.path, [safeOldFilename, newFilename]);

      const newPath = path.join(vault.path, newFilename);
      renameSync(oldPath, newPath);

      renameNoteInIndex(vaultId, safeOldFilename, newFilename);
      // .pdf/.epub são binários — nunca lidos como texto (ver reindexNote).
      const content = ext === ".md" ? readFileSync(newPath, "utf-8") : "";
      const mtimeMs = statSync(newPath).mtimeMs;
      reindexNote(vaultId, newFilename, content, mtimeMs);

      const oldNameNoExt = stripMdExtension(safeOldFilename);
      const newNameNoExt = stripMdExtension(newFilename);
      for (const sourceFilename of filesToRewrite) {
        const sourcePath = path.join(vault.path, sourceFilename);
        const sourceContent = readFileSync(sourcePath, "utf-8");
        const updated = rewriteNoteNameInLinks(sourceContent, oldNameNoExt, newNameNoExt);
        if (updated !== sourceContent) {
          writeFileSync(sourcePath, updated, "utf-8");
          reindexNote(vaultId, sourceFilename, updated, statSync(sourcePath).mtimeMs);
        }
      }
    }

    return NextResponse.json({ filename: newFilename });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível renomear a nota", details: String(error) },
      { status: 500 }
    );
  }
}
