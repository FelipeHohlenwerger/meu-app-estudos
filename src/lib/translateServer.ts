// Chamada server-side pro endpoint gratuito e sem chave do Google Tradutor
// (o mesmo que bibliotecas como `googletrans` usam) — não é oficialmente
// documentado/suportado pelo Google, mas amplamente usado e estável na
// prática. Escolhido depois de duas alternativas descartadas: Cloud
// Translation API oficial (exige cartão/depósito mesmo no tier gratuito) e
// LibreTranslate self-hosted (dependeria de um serviço extra sempre ligado).

export class TranslateError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function callTranslate(
  texto: string
): Promise<{ translatedText: string; detectedSourceLanguage?: string }> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=pt&dt=t&q=${encodeURIComponent(texto)}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    // Mesmo padrão já usado pro erro de "servidor Calibre inalcançável"
    // (page.tsx) — distingue falha de rede (sem resposta nenhuma) de erro
    // HTTP (resposta chegou, mas com erro).
    throw new TranslateError("Não foi possível conectar ao serviço de tradução — verifique sua conexão com a internet.", 503);
  }

  if (!res.ok) {
    throw new TranslateError(`Erro ao chamar o serviço de tradução (HTTP ${res.status})`, res.status);
  }

  const data = await res.json().catch(() => null);
  const segments = data?.[0];
  if (!Array.isArray(segments)) {
    throw new TranslateError("O serviço de tradução não retornou nenhum resultado", 502);
  }

  // Textos longos vêm quebrados em várias sentenças — concatena todas.
  const translatedText = segments.map((seg: unknown) => (Array.isArray(seg) ? String(seg[0] ?? "") : "")).join("");
  const detectedSourceLanguage = typeof data?.[2] === "string" ? data[2] : undefined;

  if (!translatedText) {
    throw new TranslateError("O serviço de tradução não retornou nenhum resultado", 502);
  }

  return { translatedText, detectedSourceLanguage };
}
