import { NextRequest, NextResponse } from "next/server";
import { ensureIndexFresh, resolveBlockRefs } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";

// POST ?vault=<id>  body: { refs: [{ noteRaw, blockId }] } — resolve cada
// referência de bloco (link "[[nota#^id]]" ou embed "![[nota#^id]]") lendo só
// do índice, nunca reabrindo os .md. POST (não GET) só porque a lista de refs
// é um array, não porque muda algo.
export async function POST(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  if (!getVaultById(vaultId)) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });

  try {
    const { refs } = await request.json();
    if (!Array.isArray(refs)) {
      return NextResponse.json({ error: "Campo 'refs' é obrigatório (array)" }, { status: 400 });
    }

    const cleanRefs = refs
      .filter(
        (r): r is { noteRaw: string; blockId: string } =>
          r && typeof r.noteRaw === "string" && typeof r.blockId === "string"
      )
      .map((r) => ({ noteRaw: r.noteRaw, blockId: r.blockId }));

    ensureIndexFresh(vaultId);
    return NextResponse.json({ resolved: resolveBlockRefs(vaultId, cleanRefs) });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível resolver as referências de bloco", details: String(error) },
      { status: 500 }
    );
  }
}
