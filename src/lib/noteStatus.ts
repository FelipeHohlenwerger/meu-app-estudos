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

// Granularidade extra pra exibição (ícone de tipo, filtro por tipo nas telas
// de listagem) — contentType só distingue "book"/"note"; aqui "book" se
// desdobra em "book" (PDF/EPUB de verdade) e "article" (.md com "fonte:",
// artigo importado da web).
export type LibraryItemKind = "book" | "article" | "note";

export function libraryItemKind(filename: string, contentType: ContentType): LibraryItemKind {
  if (contentType === "note") return "note";
  return /\.(pdf|epub)$/i.test(filename) ? "book" : "article";
}

// Compartilhado pelos dois lugares que filtram lista de notas por tipo: a
// tela de Progresso (GroupedNoteList.tsx, as 5 opções) e o filtro da aba
// "Tags" da sidebar (page.tsx, só as 4 primeiras — sem "book_article", que só
// faz sentido cruzado com status).
export type ContentTypeFilter = "all" | "book" | "article" | "note" | "book_article";

export function matchesTypeFilter(
  note: { filename: string; contentType: ContentType },
  filter: ContentTypeFilter
): boolean {
  if (filter === "all") return true;
  // "book_article" = contentType "book" inteiro (PDF/EPUB + artigo web
  // importado juntos) — os outros filtros usam a granularidade fina de
  // libraryItemKind.
  if (filter === "book_article") return note.contentType === "book";
  return libraryItemKind(note.filename, note.contentType) === filter;
}

// As 4 opções "simples" (sem "book_article") — usadas por qualquer tela que
// filtra por tipo mas NÃO cruza com status (página de foco de tema,
// TagFocusPage.tsx; filtro da aba "Tags" da sidebar, page.tsx; lista de
// favoritas, TagNoteList.tsx). A tela de Progresso (GroupedNoteList.tsx)
// continua com sua própria lista de 5 opções, local àquele arquivo — cruzar
// com status é uma necessidade só dela.
export const CONTENT_TYPE_FILTER_OPTIONS: { value: ContentTypeFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "book", label: "Livros" },
  { value: "article", label: "Artigos" },
  { value: "note", label: "Notas" },
];
