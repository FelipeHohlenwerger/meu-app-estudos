// Chamada server-side pra API do Gemini (tier gratuito) — a chave nunca é
// exposta ao cliente, só existe aqui via process.env. Ver .env.example pro
// nome exato da variável. Compartilhado por /api/ai/action (prompt único) e
// /api/ai/chat (multi-turno + contexto via systemInstruction).

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type GeminiContent = { role: "user" | "model"; parts: { text: string }[] };

export async function callGemini(params: { systemInstruction?: string; contents: GeminiContent[] }): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError(
      "GEMINI_API_KEY não configurada — crie frontend/.env.local com essa variável (ver .env.example).",
      500
    );
  }

  // "gemini-flash-latest" é um alias que a própria Google mantém apontado
  // pro modelo flash atual recomendado — evita fixar uma versão específica
  // (ex: "gemini-2.5-flash") que a Google pode descontinuar pra contas
  // novas com o tempo (confirmado: aconteceu durante o desenvolvimento
  // desta função).
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";

  const body: { contents: GeminiContent[]; systemInstruction?: { parts: { text: string }[] } } = {
    contents: params.contents,
  };
  if (params.systemInstruction) {
    body.systemInstruction = { parts: [{ text: params.systemInstruction }] };
  }

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const data = await geminiRes.json();

  if (!geminiRes.ok) {
    throw new GeminiError(data?.error?.message || "Erro ao chamar a API do Gemini", geminiRes.status);
  }

  const result = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!result || typeof result !== "string") {
    throw new GeminiError("A API do Gemini não retornou nenhum resultado", 502);
  }

  return result.trim();
}
