import { NextRequest, NextResponse } from "next/server";
import { callTranslate, TranslateError } from "@/lib/translateServer";

export async function POST(request: NextRequest) {
  try {
    const { texto } = await request.json();

    if (!texto || typeof texto !== "string") {
      return NextResponse.json({ error: "Campo 'texto' é obrigatório" }, { status: 400 });
    }

    const result = await callTranslate(texto);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TranslateError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Não foi possível traduzir o trecho", details: String(error) },
      { status: 500 }
    );
  }
}
