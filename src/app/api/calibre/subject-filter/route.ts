import { NextRequest, NextResponse } from "next/server";
import { getCalibreSubjectFilter, setCalibreSubjectFilter } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";

// GET /api/calibre/subject-filter?vault=<id>: lista de Assunto paths
// selecionados nesta vault (ver calibre_subject_filter em vaultIndex.ts).
// [] = sem filtro configurado, biblioteca inteira visível.
export async function GET(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  if (!getVaultById(vaultId)) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });

  return NextResponse.json({ subjectPaths: getCalibreSubjectFilter(vaultId) });
}

// PUT /api/calibre/subject-filter?vault=<id>  body: { subjectPaths: string[] }
// Único caminho de escrita — substitui o conjunto inteiro (ver
// setCalibreSubjectFilter). [] limpa a seleção (volta a mostrar tudo).
export async function PUT(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  if (!getVaultById(vaultId)) return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });

  try {
    const { subjectPaths } = await request.json();
    if (!Array.isArray(subjectPaths) || !subjectPaths.every((p) => typeof p === "string")) {
      return NextResponse.json({ error: "Campo 'subjectPaths' deve ser um array de strings" }, { status: 400 });
    }

    setCalibreSubjectFilter(vaultId, subjectPaths);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar o filtro de Assuntos", details: String(error) },
      { status: 400 }
    );
  }
}
