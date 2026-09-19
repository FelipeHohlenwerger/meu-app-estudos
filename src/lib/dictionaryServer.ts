// Consulta de dicionário server-side — três fontes, na ordem:
// 1) Wiktionary em português (pt.wiktionary.org): via API antiga do
//    MediaWiki (action=query&prop=extracts), NÃO via endpoint REST
//    "page/definition" — confirmado por teste manual que esse endpoint
//    retorna 501 "Internal error" pra QUALQUER palavra em pt/es/fr.wiktionary
//    (não é instabilidade pontual: esse serviço da Wikimedia só faz o
//    parsing estruturado do Wiktionary em inglês). A API antiga devolve HTML
//    bruto do artigo inteiro (todos os idiomas do verbete, na ordem em que
//    aparecem na página); localizamos a seção "Português" pelo `<h1>` e
//    extraímos a primeira definição da primeira lista `<ol>` depois do
//    primeiro `<h2>` (classe gramatical) — texto até a primeira sublista
//    `<ul>`/`<dl>` (que carrega os exemplos, não a definição em si).
// 2) Wiktionary em inglês (en.wiktionary.org): endpoint REST
//    "page/definition", que É estruturado e funciona bem pra esse wiki —
//    tentado se a palavra não for encontrada (404, ou sem seção em
//    português) na fonte anterior.
// 3) Gemini (ver geminiServer.ts): usado só quando NENHUMA das duas consultas
//    ao Wiktionary encontrou a palavra — nunca por timeout ou erro de rede,
//    pra não queimar a cota gratuita do Gemini toda vez que o Wiktionary
//    estiver instável (esse era o bug antigo com a Free Dictionary API:
//    qualquer erro não-OK caía pro Gemini).
import { callGemini, GeminiError } from "@/lib/geminiServer";

// Timeout curto por tentativa — se o Wiktionary não responder nesse prazo,
// a consulta segue pro próximo passo (pt → en) sem ficar presa esperando um
// serviço de terceiro instável.
const WIKTIONARY_TIMEOUT_MS = 5000;

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
  source: "wiktionary" | "gemini";
};

type WiktionaryDefinition = {
  definition: string;
  examples?: string[];
  parsedExamples?: { example?: string }[];
};

type WiktionaryBlock = {
  partOfSpeech?: string;
  definitions?: WiktionaryDefinition[];
};

type WiktionaryRestResponse = Record<string, WiktionaryBlock[]>;

type MediaWikiExtractResponse = {
  query?: {
    pages?: Record<string, { missing?: string; extract?: string }>;
  };
};

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

type WiktionaryLookup =
  | { status: "found"; entry: DictionaryEntry }
  | { status: "not-found" }
  | { status: "error" };

async function tryEnglishWiktionary(palavra: string): Promise<WiktionaryLookup> {
  let res: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WIKTIONARY_TIMEOUT_MS);
  try {
    res = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(palavra)}`, {
      signal: controller.signal,
    });
  } catch {
    // Cobre tanto falha de rede quanto o abort do timeout acima.
    return { status: "error" };
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.status === 404) return { status: "not-found" };
  if (!res.ok) return { status: "error" };

  const data: WiktionaryRestResponse | null = await res.json().catch(() => null);
  const block = data?.en?.[0];
  const def = block?.definitions?.[0];
  if (!block || !def || !def.definition) return { status: "not-found" };

  const rawExample = def.examples?.[0] ?? def.parsedExamples?.find((p) => p.example)?.example;

  return {
    status: "found",
    entry: {
      word: palavra,
      language: "inglês",
      partOfSpeech: block.partOfSpeech ? stripHtml(block.partOfSpeech).toLowerCase() : undefined,
      definition: stripHtml(def.definition),
      synonyms: [],
      example: rawExample ? stripHtml(rawExample) : undefined,
      source: "wiktionary",
    },
  };
}

// Encontra a seção de um idioma específico (ex: "Português") no HTML de
// artigo inteiro devolvido por action=query&prop=extracts — os verbetes do
// Wiktionary têm um <h1> por idioma que compartilha a mesma grafia.
function extractLanguageBlock(html: string, languageName: string): string | null {
  const headingRegex = /<h1[^>]*>([\s\S]*?)<\/h1>/g;
  const headings: { end: number; nextStart: number; lang: string }[] = [];
  let match: RegExpExecArray | null;
  let previousEnd = -1;
  let previousLang = "";
  while ((match = headingRegex.exec(html))) {
    if (previousEnd !== -1) headings.push({ end: previousEnd, nextStart: match.index, lang: previousLang });
    previousEnd = headingRegex.lastIndex;
    previousLang = stripHtml(match[1]);
  }
  if (previousEnd !== -1) headings.push({ end: previousEnd, nextStart: html.length, lang: previousLang });

  const found = headings.find((h) => h.lang === languageName);
  return found ? html.slice(found.end, found.nextStart) : null;
}

// Dentro do bloco de um idioma, pega a classe gramatical (primeiro <h2>) e a
// primeira definição da primeira lista <ol> — o texto até a primeira
// sublista <ul>/<dl> (que carrega os exemplos de uso, não a definição).
function extractFirstDefinition(block: string): { partOfSpeech?: string; definition: string; example?: string } | null {
  const posMatch = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(block);
  const partOfSpeech = posMatch ? stripHtml(posMatch[1]) : undefined;

  const olIndex = block.indexOf("<ol");
  if (olIndex === -1) return null;
  const liIndex = block.indexOf("<li", olIndex);
  if (liIndex === -1) return null;
  const liContentStart = block.indexOf(">", liIndex) + 1;
  if (liContentStart === 0) return null;

  const nextUl = block.indexOf("<ul", liContentStart);
  const nextDl = block.indexOf("<dl", liContentStart);
  const nextCloseLi = block.indexOf("</li>", liContentStart);
  const boundaries = [nextUl, nextDl, nextCloseLi].filter((i) => i !== -1);
  const definitionEnd = boundaries.length > 0 ? Math.min(...boundaries) : block.length;

  const definition = stripHtml(block.slice(liContentStart, definitionEnd));
  if (!definition) return null;

  let example: string | undefined;
  const examplesStart = nextUl !== -1 && nextUl === Math.min(...boundaries) ? nextUl : -1;
  if (examplesStart !== -1) {
    const examplesEnd = block.indexOf("</ul>", examplesStart);
    const examplesBlock = block.slice(examplesStart, examplesEnd === -1 ? undefined : examplesEnd);
    const exampleMatch = /<i>([\s\S]*?)<\/i>/.exec(examplesBlock);
    if (exampleMatch) example = stripHtml(exampleMatch[1]);
  }

  return { partOfSpeech, definition, example };
}

async function tryPortugueseWiktionary(palavra: string): Promise<WiktionaryLookup> {
  let res: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WIKTIONARY_TIMEOUT_MS);
  try {
    res = await fetch(
      `https://pt.wiktionary.org/w/api.php?action=query&titles=${encodeURIComponent(palavra)}&prop=extracts&format=json`,
      { signal: controller.signal }
    );
  } catch {
    return { status: "error" };
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) return { status: "error" };

  const data: MediaWikiExtractResponse | null = await res.json().catch(() => null);
  const pages = data?.query?.pages;
  const page = pages ? Object.values(pages)[0] : undefined;
  if (!page || page.missing !== undefined || !page.extract) return { status: "not-found" };

  const block = extractLanguageBlock(page.extract, "Português");
  if (!block) return { status: "not-found" };

  const parsed = extractFirstDefinition(block);
  if (!parsed) return { status: "not-found" };

  return {
    status: "found",
    entry: {
      word: palavra,
      language: "português",
      partOfSpeech: parsed.partOfSpeech?.toLowerCase(),
      definition: parsed.definition,
      synonyms: [],
      example: parsed.example,
      source: "wiktionary",
    },
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

  const pt = await tryPortugueseWiktionary(palavra);
  if (pt.status === "found") return pt.entry;
  if (pt.status === "error") {
    throw new DictionaryError("Não foi possível consultar o dicionário no momento. Tente novamente.", 503);
  }

  const en = await tryEnglishWiktionary(palavra);
  if (en.status === "found") return en.entry;
  if (en.status === "error") {
    throw new DictionaryError("Não foi possível consultar o dicionário no momento. Tente novamente.", 503);
  }

  // Não encontrada em nenhuma das duas consultas ao Wiktionary (404 nas
  // duas) — só aqui aciona o Gemini.
  return lookupViaGemini(palavra);
}
