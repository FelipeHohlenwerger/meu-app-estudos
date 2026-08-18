// Chamada client-side compartilhada por NotePanel.tsx (.md) e EpubViewer.tsx
// pra tradução — arquivo separado de aiActions.ts de propósito: fala com o
// endpoint gratuito do Google Tradutor (ver translateServer.ts), não com o
// Gemini.
export async function requestTranslation(
  texto: string
): Promise<{ translatedText: string; detectedSourceLanguage?: string }> {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || "Não foi possível traduzir o trecho");
  }
  return data;
}
