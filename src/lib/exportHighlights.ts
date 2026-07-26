import jsPDF from "jspdf";
import { HIGHLIGHT_REGEX, COMMENT_REGEX } from "@/lib/livePreview";
import { highlightColors, underlineColors } from "@/lib/colors";

// Rótulo de exibição pra cada "tipo" — os tipos já carregam um significado
// (conceito, dúvidas, referências...), então servem como a legenda de cores
// da nota; não existe (ainda) uma tela separada onde a pessoa renomeia uma
// cor, então usamos esses nomes já embutidos no app.
const TIPO_LABELS: Record<string, string> = {
  conceito: "Conceito",
  duvidas: "Dúvidas",
  referencias: "Referências",
  exemplo: "Exemplo",
  acao: "Ação",
  opiniao_autor: "Opinião do autor",
  preto: "Preto",
  azul: "Azul",
};

export type HighlightEntry = {
  mode: "fundo" | "sub" | "comentario";
  tipo: string;
  texto: string;
  comentario?: string;
};

// Varre o conteúdo bruto da nota (mesma sintaxe usada pelo editor) e devolve
// destaques/sublinhados/comentários na ORDEM em que aparecem no texto — as
// duas sintaxes (==texto==§tipo e ~texto~¶tipo{comentário}) são buscadas
// separadamente e depois intercaladas por posição, já que usam delimitadores
// diferentes e nunca se sobrepõem.
export function extractHighlightEntries(content: string): HighlightEntry[] {
  const matches: { index: number; entry: HighlightEntry }[] = [];

  HIGHLIGHT_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HIGHLIGHT_REGEX.exec(content)) !== null) {
    const isSub = Boolean(m[3]);
    matches.push({ index: m.index, entry: { mode: isSub ? "sub" : "fundo", tipo: m[2], texto: m[1] } });
  }

  COMMENT_REGEX.lastIndex = 0;
  while ((m = COMMENT_REGEX.exec(content)) !== null) {
    matches.push({ index: m.index, entry: { mode: "comentario", tipo: m[2], texto: m[1], comentario: m[3] } });
  }

  matches.sort((a, b) => a.index - b.index);
  return matches.map((match) => match.entry);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

// Ícone de comentário: um pequeno balão de fala desenhado com formas
// básicas (retângulo arredondado + "rabicho" triangular) — evita depender de
// um emoji, que a fonte padrão do PDF não tem garantia de desenhar.
function drawCommentIcon(doc: jsPDF, x: number, y: number) {
  doc.setFillColor(140, 140, 140);
  doc.roundedRect(x, y - 3, 4.2, 3, 0.6, 0.6, "F");
  doc.triangle(x + 0.8, y, x + 2, y, x + 0.8, y + 1.4, "F");
}

const MARGIN = 18;
const LINE_HEIGHT = 6;
const ENTRY_GAP = 6;

function addPageIfNeeded(doc: jsPDF, y: number, needed: number, pageHeight: number): number {
  if (y + needed > pageHeight - MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

// Gera e dispara o download de um PDF com os destaques/comentários da nota,
// na mesma ordem em que aparecem no texto original, cada um com sua cor
// original — sem número de página nem seção de origem (só o trecho e, se
// houver, o comentário associado).
export function generateHighlightsPdf(noteTitle: string, entries: HighlightEntry[]): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(noteTitle, MARGIN, y);
  y += 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text("Destaques e comentários", MARGIN, y);
  y += 10;

  // Legenda: uma linha por tipo realmente usado na nota, na ordem de
  // primeira aparição — cor + nome do tipo (ver TIPO_LABELS acima).
  const usedTipos = Array.from(new Set(entries.map((e) => e.tipo)));
  if (usedTipos.length > 0) {
    doc.setFontSize(9);
    for (const tipo of usedTipos) {
      const color = highlightColors[tipo] ?? underlineColors[tipo] ?? "#999999";
      const [r, g, b] = hexToRgb(color);
      doc.setFillColor(r, g, b);
      doc.rect(MARGIN, y - 3, 4, 4, "F");
      doc.setTextColor(90);
      doc.text(TIPO_LABELS[tipo] ?? tipo, MARGIN + 6.5, y);
      y += 5.5;
    }
    y += 5;
  }

  doc.setTextColor(20);

  for (const entry of entries) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    const lines = doc.splitTextToSize(entry.texto, contentWidth - 2);
    const commentLines = entry.comentario
      ? doc.splitTextToSize(entry.comentario, contentWidth - 8)
      : [];

    const neededHeight =
      lines.length * LINE_HEIGHT + (commentLines.length > 0 ? commentLines.length * 4.8 + 3 : 0) + ENTRY_GAP;
    y = addPageIfNeeded(doc, y, neededHeight, pageHeight);

    // Fundo colorido (destaque tipo "marca-texto") desenhado ANTES do texto,
    // cobrindo todas as linhas do trecho já quebradas.
    if (entry.mode === "fundo") {
      const [r, g, b] = hexToRgb(highlightColors[entry.tipo] ?? "#eeeeee");
      doc.setFillColor(r, g, b);
      doc.rect(MARGIN - 1, y - 4.5, contentWidth + 2, lines.length * LINE_HEIGHT, "F");
    }

    doc.setTextColor(20);
    doc.text(lines, MARGIN, y);

    // Sublinhado colorido (sublinhado de verdade ou comentário, que também é
    // representado como um sublinhado na nota) — uma linha por linha de texto.
    if (entry.mode === "sub" || entry.mode === "comentario") {
      const [r, g, b] = hexToRgb(underlineColors[entry.tipo] ?? "#666666");
      doc.setDrawColor(r, g, b);
      doc.setLineWidth(0.4);
      lines.forEach((line: string, i: number) => {
        const lineY = y + i * LINE_HEIGHT + 1.4;
        const lineWidth = doc.getTextWidth(line);
        doc.line(MARGIN, lineY, MARGIN + lineWidth, lineY);
      });
    }

    y += lines.length * LINE_HEIGHT + 2;

    if (entry.comentario) {
      drawCommentIcon(doc, MARGIN, y - 1.5);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(110);
      doc.text(commentLines, MARGIN + 6, y);
      y += commentLines.length * 4.8 + 3;
      doc.setTextColor(20);
    }

    y += ENTRY_GAP;
  }

  const safeName = noteTitle.replace(/[\\/:*?"<>|]/g, "-").trim() || "destaques";
  doc.save(`${safeName} - destaques.pdf`);
}
