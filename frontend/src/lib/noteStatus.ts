// Vocabulário de status de estudo — dois conjuntos de estágios diferentes
// dependendo do tipo de conteúdo (ver contentTypeFor). Arquivo puro (sem
// "use client"), importável tanto pelo backend (vaultIndex.ts, rotas de API)
// quanto pelo frontend.

export type ContentType = "book" | "note";

// "abandonei" fica fora da progressão linear de propósito (não vem depois de
// "revisado" no array — é um desvio, não uma 6ª etapa "além do fim").
export const BOOK_STATUS_ORDER = ["nao_iniciado", "lendo", "lido", "revisando", "revisado", "abandonei"];
export const NOTE_STATUS_ORDER = ["rascunho", "em_desenvolvimento", "finalizada"];

export const STATUS_LABELS: Record<string, string> = {
  nao_iniciado: "Não iniciei",
  lendo: "Lendo",
  lido: "Lido",
  revisando: "Revisando",
  revisado: "Revisado",
  abandonei: "Abandonei",
  rascunho: "Rascunho",
  em_desenvolvimento: "Em desenvolvimento",
  finalizada: "Finalizada",
};

// Livro/artigo recém-importado começa "não iniciei" (ainda não foi aberto pra
// leitura) — antes de "abandonei"/"não iniciei" existirem como estágios
// próprios, o padrão era "lendo" (assumia leitura imediata).
export const DEFAULT_BOOK_STATUS = "nao_iniciado";
export const DEFAULT_NOTE_STATUS = "rascunho";

// PDF/EPUB são sempre "livro"; uma nota .md também é tratada como "livro" se
// tiver a linha "fonte: <url>" no topo (artigo importado da web) — o critério
// não é só a extensão do arquivo.
export function contentTypeFor(filename: string, fonte: string | null): ContentType {
  if (/\.(pdf|epub)$/i.test(filename)) return "book";
  return fonte ? "book" : "note";
}

export function statusOrderFor(contentType: ContentType): string[] {
  return contentType === "book" ? BOOK_STATUS_ORDER : NOTE_STATUS_ORDER;
}

export function defaultStatusFor(contentType: ContentType): string {
  return contentType === "book" ? DEFAULT_BOOK_STATUS : DEFAULT_NOTE_STATUS;
}
