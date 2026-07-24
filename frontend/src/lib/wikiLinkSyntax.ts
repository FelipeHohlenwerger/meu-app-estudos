// Sintaxe compartilhada de link "[[nome]]" / referência de bloco "[[nome#^id]]" /
// embed de bloco "![[nome#^id]]" / referência de página de PDF "[[nome#p42]]" /
// referência de capítulo de EPUB "[[nome#cap3]]", usada tanto no servidor
// (vaultIndex.ts, pra indexar) quanto no cliente (livePreview.ts, pra decorar
// o editor) — mesma implementação nos dois lados, pra evitar que a resolução
// do servidor e a classificação válido/quebrado no editor divirjam uma da
// outra.
const WIKI_SYNTAX_REGEX = /(!)?\[\[([^\]]+)\]\]/g;

export type ParsedWikiMatch =
  | { kind: "link"; raw: string; from: number; to: number }
  | { kind: "blockRef"; embed: boolean; noteRaw: string; blockId: string; from: number; to: number }
  | { kind: "pageRef"; noteRaw: string; pageRaw: string; from: number; to: number }
  | { kind: "chapterRef"; noteRaw: string; chapterRaw: string; from: number; to: number };

// Um "[[...]]" é referência de bloco se tiver "#^" com texto dos dois lados;
// referência de página (PDF — número de página, "#p42") ou de capítulo (EPUB —
// número de capítulo pela ordem natural do spine, "#cap3") se tiver o
// respectivo prefixo com texto dos dois lados; caso contrário (ou se vier com
// "!" mas sem nenhum dos três, o que não é uma sintaxe reconhecida) cai como
// link normal — exceto o "!" solto, que é ignorado (não vira link nem embed).
// Nem página nem capítulo suportam "!" (embed) — não faz sentido embutir o
// conteúdo de uma página/capítulo de PDF/EPUB.
export function parseWikiMatches(content: string): ParsedWikiMatch[] {
  const results: ParsedWikiMatch[] = [];
  const regex = new RegExp(WIKI_SYNTAX_REGEX.source, WIKI_SYNTAX_REGEX.flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const bang = match[1];
    const inner = match[2].trim();
    const from = match.index;
    const to = from + match[0].length;
    const hashIdx = inner.indexOf("#^");

    if (hashIdx !== -1) {
      const noteRaw = inner.slice(0, hashIdx).trim();
      const blockId = inner.slice(hashIdx + 2).trim();
      if (noteRaw && blockId) {
        results.push({ kind: "blockRef", embed: bang === "!", noteRaw, blockId, from, to });
      }
      continue;
    }

    const pageIdx = inner.indexOf("#p");
    if (pageIdx !== -1 && !bang) {
      const noteRaw = inner.slice(0, pageIdx).trim();
      const pageRaw = inner.slice(pageIdx + 2).trim();
      if (noteRaw && pageRaw) {
        results.push({ kind: "pageRef", noteRaw, pageRaw, from, to });
        continue;
      }
    }

    const chapterIdx = inner.indexOf("#cap");
    if (chapterIdx !== -1 && !bang) {
      const noteRaw = inner.slice(0, chapterIdx).trim();
      const chapterRaw = inner.slice(chapterIdx + 4).trim();
      if (noteRaw && chapterRaw) {
        results.push({ kind: "chapterRef", noteRaw, chapterRaw, from, to });
        continue;
      }
    }

    if (!bang) {
      results.push({ kind: "link", raw: inner, from, to });
    }
  }
  return results;
}

// Alimenta a tabela `links` (backlinks) — referência de página/capítulo conta
// como link normal pro efeito de backlinks (é um link pra nota inteira, só
// com um dado extra de onde abrir); referência de bloco não entra aqui
// (resolvida ao vivo por resolveBlockRefs, ver app/api/blocks/route.ts).
export function extractLinkTargets(content: string): string[] {
  const found = new Set<string>();
  for (const m of parseWikiMatches(content)) {
    if (m.kind === "link" && m.raw) found.add(m.raw);
    if (m.kind === "pageRef" && m.noteRaw) found.add(m.noteRaw);
    if (m.kind === "chapterRef" && m.noteRaw) found.add(m.noteRaw);
  }
  return Array.from(found);
}

export function extractBlockRefs(
  content: string
): { embed: boolean; noteRaw: string; blockId: string; from: number; to: number }[] {
  return parseWikiMatches(content).filter((m): m is Extract<ParsedWikiMatch, { kind: "blockRef" }> => m.kind === "blockRef");
}

// Todos os spans "[[...]]"/"![[...]]" do texto, de qualquer tipo — usado por quem só
// precisa saber "isso aqui já está dentro de uma sintaxe de link/bloco" (ex: o
// scanner de menções não-linkadas, que precisa ignorar texto solto que já está
// dentro de um desses spans).
export function findAllWikiSpans(content: string): { from: number; to: number }[] {
  const spans: { from: number; to: number }[] = [];
  const regex = new RegExp(WIKI_SYNTAX_REGEX.source, WIKI_SYNTAX_REGEX.flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    spans.push({ from: match.index, to: match.index + match[0].length });
  }
  return spans;
}

// Marcador "^id" ao final de um parágrafo (linhas separadas por linha em branco),
// registrando aquele parágrafo como endereçável. O marcador nunca é removido do
// texto indexado/exibido — só fica visualmente discreto no editor (ver livePreview.ts).
const BLOCK_MARKER_REGEX = /\s\^([a-zA-Z0-9_-]+)\s*$/;

export type BlockMarker = {
  blockId: string;
  markerFrom: number;
  markerTo: number;
  paragraphFrom: number;
  paragraphTo: number;
  text: string; // parágrafo com o marcador removido/aparado
};

export function findBlockMarkers(docText: string): BlockMarker[] {
  const results: BlockMarker[] = [];
  const paragraphRegex = /[^\n](?:[^\n]|\n(?!\n))*/g;
  let match: RegExpExecArray | null;
  while ((match = paragraphRegex.exec(docText)) !== null) {
    const paragraphFrom = match.index;
    const paragraph = match[0];
    const paragraphTo = paragraphFrom + paragraph.length;

    const markerMatch = paragraph.match(BLOCK_MARKER_REGEX);
    if (!markerMatch || markerMatch.index === undefined) continue;

    const blockId = markerMatch[1];
    const markerTo = paragraphFrom + markerMatch.index + markerMatch[0].length;
    const markerFrom = markerTo - (`^${blockId}`.length);
    const text = paragraph.slice(0, markerMatch.index).trim();

    results.push({ blockId, markerFrom, markerTo, paragraphFrom, paragraphTo, text });
  }
  return results;
}
