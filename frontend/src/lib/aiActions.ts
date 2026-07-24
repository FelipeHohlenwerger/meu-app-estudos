export type AiAction = "resumir" | "explicar" | "perguntas";

// Chamada client-side compartilhada por NotePanel.tsx (.md) e EpubViewer.tsx —
// a chave da API do Gemini nunca passa por aqui, só existe no servidor
// (ver src/app/api/ai/action/route.ts).
export async function requestAiAction(action: AiAction, texto: string): Promise<string> {
  const res = await fetch("/api/ai/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, texto }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || "Não foi possível completar a ação de IA");
  }
  return data.result as string;
}
