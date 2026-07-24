import { NextRequest, NextResponse } from "next/server";
import { callGemini, GeminiError, type GeminiContent } from "@/lib/geminiServer";

type ChatTurn = { role: "user" | "model"; text: string };

// POST /api/ai/chat  body: { contextText, history, message }
// contextText vira o systemInstruction (conteúdo da nota/EPUB + relacionadas,
// já montado no cliente — ver ChatPanel.tsx); history é a conversa até aqui
// (sem a nova mensagem, que entra separada em "message").
export async function POST(request: NextRequest) {
  try {
    const { contextText, history, message } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Campo 'message' é obrigatório" }, { status: 400 });
    }
    if (!Array.isArray(history)) {
      return NextResponse.json({ error: "Campo 'history' deve ser uma lista" }, { status: 400 });
    }

    const systemInstruction = [
      "Você é um assistente que ajuda a estudar o conteúdo abaixo. Responda sempre em português, de forma clara e objetiva, baseando-se no material fornecido.",
      typeof contextText === "string" && contextText ? `\n\nConteúdo de referência:\n"""\n${contextText}\n"""` : "",
    ].join("");

    const contents: GeminiContent[] = [
      ...(history as ChatTurn[]).map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
      { role: "user" as const, parts: [{ text: message }] },
    ];

    const result = await callGemini({ systemInstruction, contents });

    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof GeminiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Não foi possível completar a conversa com a IA", details: String(error) },
      { status: 500 }
    );
  }
}
