"use client";

import type { TocEntry } from "@/components/EpubViewer";

type Props = {
  open: boolean;
  toc: TocEntry[];
  // Índice de spine (0-based) do capítulo atualmente aberto — null enquanto
  // ainda não houve nenhum "relocated" (livro recém-montado).
  currentSpineIndex: number | null;
  // Wrapper fino sobre EpubViewerHandle.getSpineIndexForHref — resolve o
  // href de uma entrada do sumário pro índice de spine correspondente, pra
  // comparar contra currentSpineIndex e destacar a entrada certa.
  resolveSpineIndex: (href: string) => number | null;
  onNavigate: (href: string) => void;
  onClose: () => void;
};

function ArrowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function TocRow({
  entry,
  depth,
  currentSpineIndex,
  resolveSpineIndex,
  onNavigate,
}: {
  entry: TocEntry;
  depth: number;
  currentSpineIndex: number | null;
  resolveSpineIndex: (href: string) => number | null;
  onNavigate: (href: string) => void;
}) {
  const isCurrent = currentSpineIndex !== null && resolveSpineIndex(entry.href) === currentSpineIndex;
  return (
    <div>
      <button
        onClick={() => onNavigate(entry.href)}
        className="toolbar-link"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          width: "100%",
          textAlign: "left",
          padding: `0.4rem 0.5rem 0.4rem ${0.5 + depth * 1}rem`,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: "0.85rem",
          color: isCurrent ? "var(--tag-link-color)" : "var(--foreground)",
          fontWeight: isCurrent ? "bold" : "normal",
          borderRadius: "4px",
        }}
      >
        <span style={{ width: "12px", flexShrink: 0, display: "flex", alignItems: "center", color: "var(--tag-link-color)" }}>
          {isCurrent && <ArrowIcon />}
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.label.trim()}</span>
      </button>
      {entry.subitems?.map((child) => (
        <TocRow
          key={child.id}
          entry={child}
          depth={depth + 1}
          currentSpineIndex={currentSpineIndex}
          resolveSpineIndex={resolveSpineIndex}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

// Painel de Sumário do EPUB — overlay com fundo escurecido, mesmo padrão já
// usado pelo drawer da sidebar mobile (page.tsx), não o padrão em-fluxo (sem
// backdrop) de TranslatePanel.tsx/ChatPanel.tsx.
export default function EpubTocDrawer({ open, toc, currentSpineIndex, resolveSpineIndex, onNavigate, onClose }: Props) {
  if (!open) return null;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1499 }} />
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: "300px",
          maxWidth: "85vw",
          height: "100%",
          zIndex: 1500,
          background: "var(--background)",
          borderLeft: "1px solid var(--panel-border)",
          boxShadow: "-2px 0 12px rgba(0,0,0,0.3)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1rem",
            borderBottom: "1px solid var(--panel-border)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: "bold", color: "var(--foreground)", fontSize: "0.95rem" }}>Sumário</span>
          <button
            onClick={onClose}
            className="toolbar-link"
            title="Fechar"
            style={{
              padding: "0.3rem 0.5rem",
              border: "none",
              borderRadius: "4px",
              background: "transparent",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: "1.1rem",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ overflowY: "auto", flex: 1, padding: "0.5rem" }}>
          {toc.length === 0 ? (
            <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Este livro não tem sumário.
            </div>
          ) : (
            toc.map((entry) => (
              <TocRow
                key={entry.id}
                entry={entry}
                depth={0}
                currentSpineIndex={currentSpineIndex}
                resolveSpineIndex={resolveSpineIndex}
                onNavigate={onNavigate}
              />
            ))
          )}
        </div>
      </aside>
    </>
  );
}
