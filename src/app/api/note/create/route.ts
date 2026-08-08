import { NextRequest, NextResponse } from "next/server";
import { existsSync, statSync, writeFileSync } from "fs";
import path from "path";
import { ensureIndexFresh, reindexNote } from "@/lib/vaultIndex";
import { sanitizeFilename, findAvailableFilename } from "@/lib/slugify";
import { getVaultById } from "@/lib/vaultRegistry";

// POST ?vault=<id>  body: { title }: cria uma nota nova a partir de um link
// quebrado ("[[nome]]" sem nota correspondente). Endpoint próprio (não
// reaproveita o POST /api/note, que é um "sobrescreve sem checar" — aqui
// precisamos checar existência de verdade e desambiguar colisão de nome, não
// arriscar apagar uma nota sem querer).
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
    const { title } = await request.json();
    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Campo 'title' é obrigatório" }, { status: 400 });
    }

    const trimmedTitle = title.trim();
    const baseSlug = sanitizeFilename(trimmedTitle) || "nota";
    const filename = findAvailableFilename(baseSlug, (f) => existsSync(path.join(vault.path, f)));

    const filePath = path.join(vault.path, filename);
    // Corpo sempre nasce vazio — o título exibido em qualquer lugar do app vem
    // sempre do nome do arquivo, não do corpo, então um H1 aqui seria redundante.
    const content = "";
    writeFileSync(filePath, content, "utf-8");

    ensureIndexFresh(vaultId);
    const mtimeMs = statSync(filePath).mtimeMs;
    reindexNote(vaultId, filename, content, mtimeMs);

    return NextResponse.json({ filename });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível criar a nota", details: String(error) },
      { status: 500 }
    );
  }
}
