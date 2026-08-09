"use client";

import { useState } from "react";
import NoteRowMenu from "@/components/NoteRowMenu";
import { STATUS_COLORS } from "@/lib/colors";
import { STATUS_LABELS, defaultStatusFor, libraryItemKind, type LibraryItemKind } from "@/lib/noteStatus";
// Fonte canônica em src/lib/vaultIndex.ts — reexportado aqui só pra não
// quebrar os call sites que já importam LibraryNote a partir deste arquivo
// (ex: page.tsx).
import type { LibraryNote } from "@/lib/vaultIndex";

export { STATUS_COLORS, STATUS_LABELS };
export type { LibraryNote };

const WORDS_PER_MINUTE = 200;

export function readingTimeLabel(wordCount: number): string {
  const minutes = Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
  return `${minutes} min de leitura`;
}

function MoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

// Ícone pequeno de tipo (livro/artigo/nota) — diferenciação visual rápida em
// qualquer lista de cards (Homepage, Progresso, aba "Tags" da sidebar). Usa
// libraryItemKind (src/lib/noteStatus.ts), que desdobra contentType="book" em
// "book" (PDF/EPUB de verdade) e "article" (.md com "fonte:").
function TypeIcon({ kind }: { kind: LibraryItemKind }) {
  const common = { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "book") {
    return (
      <svg {...common}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      </svg>
    );
  }
  if (kind === "article") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <path d="M7 8h10M7 12h10M7 16h6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

export function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill={filled ? "#e0a83a" : "none"}
      stroke={filled ? "#e0a83a" : "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2.5 15.09 8.76 22 9.77 17 14.64 18.18 21.52 12 18.25 5.82 21.52 7 14.64 2 9.77 8.91 8.76 12 2.5Z" />
    </svg>
  );
}

type Props = {
  note: LibraryNote;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  // Substitui o segundo segmento da meta ("· {readingTimeLabel}") por um
  // texto pronto — usado pela seção "Editados recentemente" da Homepage pra
  // mostrar tempo relativo ("há 12 min") no lugar do tempo de leitura, sem
  // afetar nenhuma outra seção (que continua sem passar esse prop).
  metaOverride?: string;
  isFavorite: boolean;
  onToggleFavorite: () => void;
};

export default function NoteCard({
  note,
  onClick,
  onRename,
  onDelete,
  selectable,
  selected,
  onToggleSelect,
  metaOverride,
  isFavorite,
  onToggleFavorite,
}: Props) {
  const fallbackStatus = defaultStatusFor(note.contentType);
  const statusColor = STATUS_COLORS[note.status] ?? STATUS_COLORS[fallbackStatus];
  const statusLabel = STATUS_LABELS[note.status] ?? STATUS_LABELS[fallbackStatus];
  const itemKind = libraryItemKind(note.filename, note.contentType);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const showMenu = onRename && onDelete;

  return (
    <div
      onClick={onClick}
      className="note-card"
      style={{
        border: selected ? "1px solid #2f7fd6" : "1px solid var(--panel-border)",
        borderRadius: "var(--radius)",
        padding: "1rem",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
        position: "relative",
        background: selected ? "var(--panel-hover)" : undefined,
      }}
    >
      {selectable && (
        <input
          type="checkbox"
          checked={!!selected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect?.()}
          title="Selecionar nota"
          style={{
            position: "absolute",
            top: "0.6rem",
            left: "0.6rem",
            width: "16px",
            height: "16px",
            cursor: "pointer",
          }}
        />
      )}

      <div style={{ position: "absolute", top: "0.5rem", right: "0.5rem", display: "flex", alignItems: "center", gap: "0.1rem" }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="toolbar-link"
          title={isFavorite ? "Remover dos favoritos" : "Marcar como favorita"}
          style={{
            padding: "0.3rem",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            background: "transparent",
            display: "flex",
            alignItems: "center",
          }}
        >
          <StarIcon filled={isFavorite} />
        </button>

        {showMenu && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setMenuAnchor({ x: rect.right - 140, y: rect.bottom + 4 });
            }}
            className="toolbar-link"
            title="Opções"
            style={{
              padding: "0.3rem",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              color: "var(--text-muted)",
              background: "transparent",
              display: "flex",
              alignItems: "center",
            }}
          >
            <MoreIcon />
          </button>
        )}
      </div>

      {menuAnchor && (
        <NoteRowMenu
          x={menuAnchor.x}
          y={menuAnchor.y}
          onOpen={() => {
            setMenuAnchor(null);
            onClick();
          }}
          onRename={() => {
            setMenuAnchor(null);
            onRename?.();
          }}
          onDelete={() => {
            setMenuAnchor(null);
            onDelete?.();
          }}
          onClose={() => setMenuAnchor(null)}
        />
      )}

      <div
        className="note-card-title"
        style={{
          fontWeight: "bold",
          paddingRight: showMenu ? "2.7rem" : "1.5rem",
          paddingLeft: selectable ? "1.5rem" : 0,
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
        }}
      >
        <span style={{ color: "var(--text-muted)", display: "inline-flex", flexShrink: 0 }} title={itemKind === "book" ? "Livro" : itemKind === "article" ? "Artigo" : "Nota"}>
          <TypeIcon kind={itemKind} />
        </span>
        {note.title}
      </div>
      {/* Sempre renderizado, altura fixa em 2 linhas (clamp) mesmo sem resumo
          — Favoritos e Editados recentemente são duas grades SEPARADAS lado
          a lado (CardRow), então o "stretch" automático de linha do CSS Grid
          não ajuda sozinho: sem isso, uma nota sem resumo (ex: começa só com
          imagem, ver extractSummary em vaultIndex.ts) ou com resumo curto
          fica visivelmente mais baixa que as vizinhas com resumo mais longo.
          Resumo mais longo que 2 linhas trunca (mesmo texto já cortado em
          ~80 caracteres por extractSummary, então isso raramente aciona). */}
      <p
        style={{
          fontSize: "0.85rem",
          margin: 0,
          color: "var(--foreground)",
          lineHeight: 1.3,
          minHeight: "2.6em",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {note.summary || " "}
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
        }}
      >
        {note.contentType === "note" && (
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: statusColor,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
        )}
        <span>
          {note.contentType === "note" ? `${statusLabel} · ` : ""}
          {metaOverride ?? readingTimeLabel(note.wordCount)}
        </span>
      </div>
    </div>
  );
}
