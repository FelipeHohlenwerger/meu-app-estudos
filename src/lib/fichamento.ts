import type { HighlightEntry } from "@/lib/exportHighlights";

// Vocabulário de tipo de destaque/sublinhado (highlightColors/underlineColors,
// ver colors.ts) é diferente do vocabulário de tipo de callout (calloutColors)
// — só "duvidas"/"referencias" existem nos dois. Ao converter um comentário
// ancorado de nota (tipo escolhido nesse primeiro vocabulário) num callout,
// usa este mapeamento, definido junto com o usuário: os dois tipos em comum
// mantêm o nome, "exemplo"→"exemplos" e "opiniao_autor"→"citacoes" (par
// semântico mais próximo), e o resto ("conceito", "acao", "preto", "azul")
// cai em "importante".
const HIGHLIGHT_TO_CALLOUT_TIPO: Record<string, string> = {
  duvidas: "duvidas",
  referencias: "referencias",
  exemplo: "exemplos",
  opiniao_autor: "citacoes",
};

function mapToCalloutTipo(tipo: string): string {
  return HIGHLIGHT_TO_CALLOUT_TIPO[tipo] ?? "importante";
}

// `> [!tipo]` seguido do texto, quebrado em várias linhas `> ` quando o texto
// tem múltiplas linhas — mesmo formato já usado manualmente em
// NotePanel.tsx pra callouts inseridos à mão (insertCallout/callout de IA).
function toCalloutBlock(tipo: string, text: string): string {
  const lines = text.split("\n").map((line) => `> ${line}`);
  return [`> [!${tipo}]`, ...lines].join("\n");
}

// Markdown da nota "Fichamento — <origem>" a partir dos destaques/comentários
// de uma nota .md: `[[origem]]` no topo, depois cada entry de
// extractHighlightEntries (exportHighlights.ts) convertido de volta pra
// sintaxe, na mesma ordem em que aparece no texto original; comentários
// gerais (sem trecho ancorado) vêm por último, um callout cada.
export function buildNoteFichamento(
  sourceTitle: string,
  entries: HighlightEntry[],
  generalComments: { tipo: string; comment: string }[]
): string {
  const parts: string[] = [`[[${sourceTitle}]]`, ""];

  for (const entry of entries) {
    if (entry.mode === "fundo") {
      parts.push(`==${entry.texto}==§${entry.tipo}`, "");
    } else if (entry.mode === "sub") {
      parts.push(`==${entry.texto}==§${entry.tipo}:sub`, "");
    } else {
      // Comentário ancorado: o trecho aparece como highlight logo acima, o
      // comentário vira um callout do tipo mapeado logo abaixo.
      parts.push(`==${entry.texto}==§${entry.tipo}`, "");
      parts.push(toCalloutBlock(mapToCalloutTipo(entry.tipo), entry.comentario ?? ""), "");
    }
  }

  for (const c of generalComments) {
    parts.push(toCalloutBlock(c.tipo, c.comment), "");
  }

  return parts.join("\n").trimEnd() + "\n";
}

// Markdown da nota "Fichamento — <origem>" a partir dos comentários de um
// livro (PDF/EPUB): `[[origem]]` no topo, depois cada comentário na ordem de
// criação, cada um um callout com a referência de página/capítulo (quando
// existir) numa linha extra no rodapé do bloco.
export function buildBookFichamento(
  bookTitle: string,
  comments: { tipo: string; texto: string; page?: number | null; chapterLabel?: string | null }[]
): string {
  const parts: string[] = [`[[${bookTitle}]]`, ""];

  for (const c of comments) {
    const origem = c.page != null ? `p. ${c.page}` : c.chapterLabel ?? null;
    const block = origem ? `${toCalloutBlock(c.tipo, c.texto)}\n> — ${origem}` : toCalloutBlock(c.tipo, c.texto);
    parts.push(block, "");
  }

  return parts.join("\n").trimEnd() + "\n";
}
