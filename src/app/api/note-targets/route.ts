import { NextRequest, NextResponse } from "next/server";
import { ensureIndexFresh, getAllNoteTargets } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";

// GET ?vault=<id>: nome de arquivo, título e aliases de todas as notas —
// alimenta o autocomplete de "[[" e a classificação de link válido/quebrado no editor.
export async function GET(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  if (!getVaultById(vaultId)) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });

  try {
    ensureIndexFresh(vaultId);
    const targets = getAllNoteTargets(vaultId);
    return NextResponse.json({ targets });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível ler os alvos de link", details: String(error) },
      { status: 500 }
    );
  }
}
