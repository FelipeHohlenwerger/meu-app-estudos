import { NextRequest, NextResponse } from "next/server";
import { getTagCovers, setTagCover } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";

// GET /api/tag/cover?vault=<id>: mapa completo { [tagPath]: coverPath } de
// todos os subtemas com capa manual definida nesta vault — subtema sem capa
// simplesmente não tem chave (SubtemaCard cai no ícone de camadas padrão).
export async function GET(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  if (!getVaultById(vaultId)) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });

  return NextResponse.json({ covers: getTagCovers(vaultId) });
}

// PUT /api/tag/cover?vault=<id>  body: { tagPath: "história.pré-história.livros", coverPath: "attachments/foo.jpg" | null }
// Único caminho de escrita de tag_covers. `coverPath: null` remove a capa
// manual do subtema (volta a mostrar o ícone de camadas padrão).
export async function PUT(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  if (!getVaultById(vaultId)) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });

  try {
    const { tagPath, coverPath } = await request.json();

    if (!tagPath || typeof tagPath !== "string") {
      return NextResponse.json({ error: "Campo 'tagPath' é obrigatório" }, { status: 400 });
    }
    if (coverPath !== null && typeof coverPath !== "string") {
      return NextResponse.json({ error: "Campo 'coverPath' deve ser uma string ou null" }, { status: 400 });
    }

    setTagCover(vaultId, tagPath, coverPath);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar a capa do subtema", details: String(error) },
      { status: 400 }
    );
  }
}
