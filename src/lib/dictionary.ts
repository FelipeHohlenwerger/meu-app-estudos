// Chamada client-side compartilhada por NotePanel.tsx (.md), PdfViewer.tsx e
// EpubViewer.tsx pra consulta de dicionário — mesmo espírito de translate.ts
// (arquivo fino, só chama a rota; a decisão Free Dictionary API vs. Gemini
// mora inteira no servidor, ver dictionaryServer.ts).
export type DictionaryEntry = {
  word: string;
  language?: string;
  partOfSpeech?: string;
  phonetic?: string;
  definition: string;
  synonyms: string[];
  example?: string;
  source: "free-dictionary" | "gemini";
};

export async function requestDictionaryLookup(palavra: string): Promise<DictionaryEntry> {
  const res = await fetch("/api/dictionary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ palavra }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || "Não foi possível consultar o dicionário");
  }
  return data;
}
