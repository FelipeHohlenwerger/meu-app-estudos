import jsPDF from "jspdf";
import { calloutColors } from "@/lib/colors";
import { hexToRgb, addPageIfNeeded, MARGIN } from "@/lib/exportHighlights";

export type BookCommentForExport = {
  tipo: string;
  texto: string;
  page?: number | null;
  chapterLabel?: string | null;
};

const LINE_HEIGHT = 6.5;
const ENTRY_GAP = 8;

// Gera e dispara o download de um PDF com os comentários de um livro
// (PDF/EPUB), na ordem em que foram criados — diferente do PDF de destaques
// de nota, aqui não há legenda de tipos no topo (cada item já carrega sua
// própria cor) nem sintaxe de destaque/sublinhado, só o comentário em si e,
// quando existir, a referência de origem (página ou capítulo) no rodapé.
export function generateBookCommentsPdf(bookTitle: string, comments: BookCommentForExport[]): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(bookTitle, MARGIN, y);
  y += 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text("Comentários", MARGIN, y);
  y += 12;

  for (const c of comments) {
    const color = calloutColors[c.tipo] ?? "#999999";
    const [r, g, b] = hexToRgb(color);
    const lines = doc.splitTextToSize(c.texto, contentWidth - 2);
    const origem = c.page != null ? `p. ${c.page}` : c.chapterLabel ?? null;
    const neededHeight = 6 + lines.length * LINE_HEIGHT + (origem ? 5 : 0) + ENTRY_GAP;
    y = addPageIfNeeded(doc, y, neededHeight, pageHeight);

    // Rótulo do tipo, colorido — mesma convenção de rótulo cru já usada em
    // BookCommentsPanel.tsx (não existe mapa tipo→português no app).
    doc.setFillColor(r, g, b);
    doc.rect(MARGIN, y - 3, 4, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(r, g, b);
    doc.text(c.tipo, MARGIN + 6.5, y);
    y += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(13);
    doc.setTextColor(20);
    doc.text(lines, MARGIN, y);
    y += lines.length * LINE_HEIGHT;

    if (origem) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(130);
      doc.text(origem, MARGIN, y + 3);
      y += 5;
    }

    y += ENTRY_GAP;
  }

  const safeName = bookTitle.replace(/[\\/:*?"<>|]/g, "-").trim() || "comentarios";
  doc.save(`${safeName} - comentarios.pdf`);
}
