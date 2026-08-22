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

// Intervalo mínimo entre chamadas reais ao endpoint — estado de módulo
// (sobrevive entre requests, dentro do mesmo processo do servidor), então
// serializa rajadas mesmo vindas de sessões/abas diferentes, em vez de cada
// request disparar seu próprio fetch imediatamente. Investigado (ver rodada
// anterior): o debounce por seleção já garante 1 chamada por ação da
// pessoa — isso aqui é uma segunda camada de proteção, independente disso,
// contra qualquer rajada não prevista.
const MIN_INTERVAL_MS = 500;
let lastCallAt = 0;

async function throttledFetch(url: string): Promise<Response> {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
  return fetch(url);
}

export async function callTranslate(
  texto: string
): Promise<{ translatedText: string; detectedSourceLanguage?: string }> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=pt&dt=t&q=${encodeURIComponent(texto)}`;

  async function attempt(): Promise<Response> {
    try {
      return await throttledFetch(url);
    } catch {
      // Mesmo padrão já usado pro erro de "servidor Calibre inalcançável"
      // (page.tsx) — distingue falha de rede (sem resposta nenhuma) de erro
      // HTTP (resposta chegou, mas com erro).
      throw new TranslateError("Não foi possível conectar ao serviço de tradução — verifique sua conexão com a internet.", 503);
    }
  }

  let res = await attempt();

  // O endpoint não-oficial costuma bloquear (429) em rajadas curtas que
  // passam sozinhas em pouco tempo — uma única nova tentativa depois de 1s
  // resolve a maioria dos casos sem a pessoa perceber que algo falhou.
  if (res.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    res = await attempt();
  }

  if (!res.ok) {
    throw new TranslateError(
      res.status === 429
        ? "Serviço de tradução temporariamente indisponível (limite de uso do endpoint gratuito atingido) — tente de novo em alguns minutos."
        : `Erro ao chamar o serviço de tradução (HTTP ${res.status})`,
      res.status
    );
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
