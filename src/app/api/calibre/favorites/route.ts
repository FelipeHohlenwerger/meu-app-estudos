import { NextRequest, NextResponse } from "next/server";
import { getFavoriteCalibreBookIds, setCalibreBookFavorite } from "@/lib/calibreAnnotations";

// GET /api/calibre/favorites -> { bookIds: number[] }
// Sem ?vault= — favorito de livro do Calibre é global (ver calibreAnnotations.ts).
export async function GET() {
  try {
    return NextResponse.json({ bookIds: getFavoriteCalibreBookIds() });
  } catch (error) {
    return NextResponse.json({ error: "Não foi possível carregar os favoritos", details: String(error) }, { status: 500 });
  }
}

// PUT body: { calibreId: number, isFavorite: boolean }
export async function PUT(request: NextRequest) {
  try {
    const { calibreId, isFavorite } = await request.json();

    if (typeof calibreId !== "number" || !Number.isInteger(calibreId)) {
      return NextResponse.json({ error: "Campo 'calibreId' deve ser um número inteiro" }, { status: 400 });
    }
    if (typeof isFavorite !== "boolean") {
      return NextResponse.json({ error: "Campo 'isFavorite' deve ser um booleano" }, { status: 400 });
    }

    setCalibreBookFavorite(calibreId, isFavorite);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar o favorito do livro", details: String(error) },
      { status: 400 }
    );
  }
}
