import { NextRequest, NextResponse } from "next/server";
import { ensureIndexFresh, getTagCounts, getTagsByNote, getUntaggedCount } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";

// GET ?vault=<id>: contagens de tags lidas do índice SQLite (não reprocessa
// arquivos aqui). Re-varre a vault a cada 30s no máximo, pra pegar edições
// feitas fora do app sem precisar reiniciar o servidor.
export async function GET(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  if (!getVaultById(vaultId)) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });

  try {
    ensureIndexFresh(vaultId, { forceMaxAgeMs: 30_000 });

    const tagCounts = getTagCounts(vaultId);
    const untaggedCount = getUntaggedCount(vaultId);
    const tagsByNote = getTagsByNote(vaultId);

    return NextResponse.json({ tagsByNote, tagCounts, untaggedCount });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível ler as tags das notas", details: String(error) },
      { status: 500 }
    );
  }
}
