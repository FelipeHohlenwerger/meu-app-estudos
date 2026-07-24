import { NextRequest, NextResponse } from "next/server";
import { callGemini, GeminiError } from "@/lib/geminiServer";

type AiAction = "resumir" | "explicar" | "perguntas";

const PROMPTS: Record<AiAction, (texto: string) => string> = {
  resumir: (texto) =>
    `Resuma o trecho a seguir em poucas frases, mantendo as informações essenciais. Responda apenas com o resumo, em português, sem introduções nem comentários extras.\n\nTrecho:\n"""\n${texto}\n"""`,
  explicar: (texto) =>
    `Explique o conceito ou trecho a seguir de forma acessível, como se estivesse explicando para alguém que não conhece o assunto. Responda apenas com a explicação, em português, sem introduções nem comentários extras.\n\nTrecho:\n"""\n${texto}\n"""`,
  perguntas: (texto) =>
    `Crie de 2 a 4 perguntas objetivas de revisão sobre o conteúdo do trecho a seguir, úteis para revisão de estudo posterior. Responda apenas com as perguntas numeradas, em português, sem introduções nem comentários extras.\n\nTrecho:\n"""\n${texto}\n"""`,
};

export async function POST(request: NextRequest) {
  try {
    const { action, texto } = await request.json();

    if (!action || !(action in PROMPTS)) {
      return NextResponse.json({ error: "Campo 'action' inválido" }, { status: 400 });
    }
    if (!texto || typeof texto !== "string") {
      return NextResponse.json({ error: "Campo 'texto' é obrigatório" }, { status: 400 });
    }

    const prompt = PROMPTS[action as AiAction](texto);
    const result = await callGemini({ contents: [{ role: "user", parts: [{ text: prompt }] }] });

    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof GeminiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Não foi possível completar a ação de IA", details: String(error) },
      { status: 500 }
    );
  }
}
