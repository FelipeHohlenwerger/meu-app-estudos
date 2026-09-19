import { NextRequest, NextResponse } from "next/server";
import { lookupDictionary, DictionaryError } from "@/lib/dictionaryServer";
import { GeminiError } from "@/lib/geminiServer";

export async function POST(request: NextRequest) {
  try {
    const { palavra } = await request.json();

    if (!palavra || typeof palavra !== "string") {
      return NextResponse.json({ error: "Campo 'palavra' é obrigatório" }, { status: 400 });
    }

    const result = await lookupDictionary(palavra);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DictionaryError || error instanceof GeminiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Não foi possível consultar o dicionário", details: String(error) },
      { status: 500 }
    );
  }
}
