import { NextRequest, NextResponse } from "next/server";
import { getCalibreReadingPosition, setCalibreReadingPosition } from "@/lib/calibreAnnotations";

// GET /api/calibre/reading-position?calibreId=<id>&format=<FORMAT>
// Sem ?vault= — livro do Calibre não pertence a nenhuma vault (ver calibreAnnotations.ts).
export async function GET(request: NextRequest) {
  const calibreIdRaw = request.nextUrl.searchParams.get("calibreId");
  const format = request.nextUrl.searchParams.get("format");
  const calibreId = calibreIdRaw ? Number(calibreIdRaw) : NaN;
  if (!Number.isInteger(calibreId)) return NextResponse.json({ error: "Parâmetro 'calibreId' é obrigatório e deve ser um número inteiro" }, { status: 400 });
  if (!format) return NextResponse.json({ error: "Parâmetro 'format' é obrigatório" }, { status: 400 });

  const position = getCalibreReadingPosition(calibreId, format);
  return NextResponse.json(position ?? { page: null, cfi: null });
}

// PUT body: { calibreId: number, format: string, page } OU { calibreId, format, cfi }
export async function PUT(request: NextRequest) {
  try {
    const { calibreId, format, page, cfi } = await request.json();

    if (typeof calibreId !== "number" || !Number.isInteger(calibreId)) {
      return NextResponse.json({ error: "Campo 'calibreId' deve ser um número inteiro" }, { status: 400 });
    }
    if (!format || typeof format !== "string") {
      return NextResponse.json({ error: "Campo 'format' é obrigatório" }, { status: 400 });
    }
    const hasPage = page !== undefined;
    const hasCfi = cfi !== undefined;
    if (hasPage === hasCfi) {
      return NextResponse.json({ error: "Informe exatamente um de 'page' (número) ou 'cfi' (string)" }, { status: 400 });
    }
    if (hasPage && (typeof page !== "number" || !Number.isInteger(page))) {
      return NextResponse.json({ error: "Campo 'page' deve ser um número inteiro" }, { status: 400 });
    }
    if (hasCfi && typeof cfi !== "string") {
      return NextResponse.json({ error: "Campo 'cfi' deve ser uma string" }, { status: 400 });
    }

    setCalibreReadingPosition(calibreId, format, hasPage ? { page } : { cfi });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar a posição de leitura", details: String(error) },
      { status: 400 }
    );
  }
}
