// Consulta de dicionário server-side — duas fontes, na ordem:
// 1) Free Dictionary API (api.dictionaryapi.dev): gratuita, sem chave, sem
//    limite documentado, mas só cobre inglês (endpoint fixo "/entries/en/").
// 2) Gemini (ver geminiServer.ts, já configurado pro resto do app): usado
//    quando a palavra não é inglesa OU a Free Dictionary API não a reconhece
//    (qualquer status não-OK ou falha de rede caem aqui, não só 404 — a
//    Free Dictionary API sendo de terceiro sem SLA, mais lenient é melhor
//    que expor um erro quando existe uma segunda fonte disponível).
import { callGemini, GeminiError } from "@/lib/geminiServer";

// A Free Dictionary API às vezes fica instável (observado: erro 522 do
// Cloudflare que a hospeda, origem não respondendo — nada a ver com este
// app) e mesmo quando funciona pode demorar bem mais que o normal nesses
// períodos. Sem um limite de tempo aqui, cada consulta ficaria presa por
// ~20s antes de sequer tentar o Gemini — com esse timeout, uma instabilidade
// da Free Dictionary só atrasa a consulta em FREE_DICTIONARY_TIMEOUT_MS, não
// pelo tempo que o Cloudflare demorar pra desistir da origem dele.
const FREE_DICTIONARY_TIMEOUT_MS = 6000;

export class DictionaryError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

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

type FreeDictionaryEntry = {
  word: string;
  phonetic?: string;
  phonetics?: { text?: string }[];
  meanings: {
    partOfSpeech: string;
    synonyms?: string[];
    definitions: { definition: string; example?: string; synonyms?: string[] }[];
  }[];
};

async function tryFreeDictionary(palavra: string): Promise<DictionaryEntry | null> {
  let res: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FREE_DICTIONARY_TIMEOUT_MS);
  try {
    res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(palavra)}`, {
      signal: controller.signal,
    });
  } catch {
    // Cobre tanto falha de rede quanto o abort do timeout acima.
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
  // 404 = palavra não reconhecida como inglesa (caso esperado, ver comentário
  // no topo do arquivo); qualquer outro status também cai pro Gemini em vez
  // de expor o erro cru de um serviço de terceiro.
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const entry: FreeDictionaryEntry | undefined = Array.isArray(data) ? data[0] : undefined;
  const meaning = entry?.meanings?.[0];
  const definition = meaning?.definitions?.[0]?.definition;
  if (!entry || !meaning || !definition) return null;

  const phonetic = entry.phonetic || entry.phonetics?.find((p) => p.text)?.text;
  const example = meaning.definitions.find((d) => d.example)?.example;
  const synonyms = Array.from(
    new Set([...(meaning.synonyms ?? []), ...meaning.definitions.flatMap((d) => d.synonyms ?? [])])
  ).slice(0, 8);

  return {
    word: entry.word,
    language: "inglês",
    partOfSpeech: meaning.partOfSpeech,
    phonetic,
    definition,
    synonyms,
    example,
    source: "free-dictionary",
  };
}

// Schema no formato que a API do Gemini espera (subset do OpenAPI, tipos em
// maiúsculo) — força a resposta em JSON estruturado via
// generationConfig.responseSchema (ver callGemini em geminiServer.ts), sem
// precisar fazer parsing de texto livre nem confiar no modelo "se comportar".
const DICTIONARY_SCHEMA = {
  type: "OBJECT",
  properties: {
    encontrada: { type: "BOOLEAN" },
    idioma: { type: "STRING" },
    classeGramatical: { type: "STRING" },
    definicao: { type: "STRING" },
    sinonimos: { type: "ARRAY", items: { type: "STRING" } },
    exemplo: { type: "STRING" },
  },
  required: ["encontrada"],
};

async function lookupViaGemini(palavra: string): Promise<DictionaryEntry> {
  const prompt =
    `Você é um dicionário. Para a palavra ou expressão abaixo, identifique o idioma dela e responda em JSON com:\n` +
    `- "idioma": o idioma da palavra, em português (ex: "português", "inglês", "espanhol")\n` +
    `- "classeGramatical": a classe gramatical, em português (ex: "substantivo", "verbo", "adjetivo")\n` +
    `- "definicao": uma definição clara e concisa, em português\n` +
    `- "sinonimos": até 6 sinônimos da palavra, no MESMO idioma da palavra original (não traduzidos)\n` +
    `- "exemplo": uma frase de exemplo de uso da palavra, no idioma original dela\n` +
    `- "encontrada": true se for uma palavra ou expressão real que você conseguiu definir, false caso contrário (nesse caso pode deixar os outros campos vazios)\n\n` +
    `Palavra: "${palavra}"`;

  let raw: string;
  try {
    raw = await callGemini({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: DICTIONARY_SCHEMA },
    });
  } catch (error) {
    // 429 = cota do tier gratuito esgotada; 503 = modelo sobrecarregado
    // ("high demand") — nos dois casos o texto cru do Gemini é técnico
    // demais (menciona métricas internas, links de billing) pra mostrar
    // direto na UI; troca por uma mensagem que explica a causa real sem
    // reescrever o status (o chamador ainda decide o que fazer com 429/503).
    if (error instanceof GeminiError && (error.status === 429 || error.status === 503)) {
      throw new DictionaryError(
        "O serviço de IA está temporariamente sobrecarregado ou com a cota esgotada. Tente novamente em alguns instantes.",
        error.status
      );
    }
    throw error;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DictionaryError("Não foi possível interpretar a resposta do Gemini", 502);
  }

  if (!parsed.encontrada || typeof parsed.definicao !== "string" || !parsed.definicao) {
    throw new DictionaryError("Palavra não encontrada", 404);
  }

  return {
    word: palavra,
    language: typeof parsed.idioma === "string" && parsed.idioma ? parsed.idioma : undefined,
    partOfSpeech: typeof parsed.classeGramatical === "string" && parsed.classeGramatical ? parsed.classeGramatical : undefined,
    definition: parsed.definicao,
    synonyms: Array.isArray(parsed.sinonimos) ? parsed.sinonimos.filter((s): s is string => typeof s === "string").slice(0, 8) : [],
    example: typeof parsed.exemplo === "string" && parsed.exemplo ? parsed.exemplo : undefined,
    source: "gemini",
  };
}

export async function lookupDictionary(palavraRaw: string): Promise<DictionaryEntry> {
  const palavra = palavraRaw.trim();
  if (!palavra) {
    throw new DictionaryError("Nada selecionado para consultar", 400);
  }
  const fromFreeDictionary = await tryFreeDictionary(palavra);
  if (fromFreeDictionary) return fromFreeDictionary;
  return lookupViaGemini(palavra);
}
