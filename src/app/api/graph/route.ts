import { NextRequest, NextResponse } from "next/server";
import { ensureIndexFresh, getGlobalGraph, getLocalGraph } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";
import { listCalibreBooks } from "@/lib/calibreLibrary";

// GET ?vault=<id>&scope=global | ?vault=<id>&scope=local&filename=X
// Lê só do índice SQLite — nunca reabre/reprocessa os arquivos .md.
export async function GET(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  if (!getVaultById(vaultId)) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });

  try {
    ensureIndexFresh(vaultId);

    const scope = request.nextUrl.searchParams.get("scope");
    const filename = request.nextUrl.searchParams.get("filename");
    // Buscar a biblioteca Calibre é assíncrono (leitura de metadata.db com
    // retry — ver calibreLibrary.ts), por isso não pode acontecer dentro das
    // funções de grafo síncronas em vaultIndex.ts; resolvido aqui e repassado.
    const calibreBooks = await listCalibreBooks();

    if (scope === "local" && filename) {
      return NextResponse.json(getLocalGraph(vaultId, filename, 2, calibreBooks));
    }

    return NextResponse.json(getGlobalGraph(vaultId, calibreBooks));
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível montar o grafo", details: String(error) },
      { status: 500 }
    );
  }
}
