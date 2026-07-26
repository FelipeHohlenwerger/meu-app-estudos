import { NextRequest, NextResponse } from "next/server";
import { ensureIndexFresh, getLibraryData } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";

// GET ?vault=<id> — dados pra tela inicial "biblioteca": uma linha por nota
// (título, tags, status, resumo, contagem de palavras). Lido só do índice.
export async function GET(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  if (!getVaultById(vaultId)) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });

  try {
    ensureIndexFresh(vaultId, { forceMaxAgeMs: 30_000 });
    return NextResponse.json({ notes: getLibraryData(vaultId) });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível carregar a biblioteca", details: String(error) },
      { status: 500 }
    );
  }
}
