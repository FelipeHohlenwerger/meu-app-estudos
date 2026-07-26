import { NextRequest, NextResponse } from "next/server";
import { ensureIndexFresh, getGlobalGraph, getLocalGraph } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";

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

    if (scope === "local" && filename) {
      return NextResponse.json(getLocalGraph(vaultId, filename));
    }

    return NextResponse.json(getGlobalGraph(vaultId));
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível montar o grafo", details: String(error) },
      { status: 500 }
    );
  }
}
