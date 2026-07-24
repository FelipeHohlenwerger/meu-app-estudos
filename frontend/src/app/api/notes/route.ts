import { NextRequest, NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { getVaultById } from "@/lib/vaultRegistry";

// GET ?vault=<id>: lista todos os arquivos de nota do vault — .md (texto) e
// .pdf/.epub (originais importados, exibidos no visualizador em vez de convertidos).
export async function GET(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  const vault = getVaultById(vaultId);
  if (!vault) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });

  try {
    const files = await readdir(vault.path);
    const notes = files.filter((f) => /\.(md|pdf|epub)$/i.test(f));
    return NextResponse.json({ notes });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível listar as notas", details: String(error) },
      { status: 500 }
    );
  }
}