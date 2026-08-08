"use client";

import { useState } from "react";
import NoteRowMenu from "@/components/NoteRowMenu";
import { STATUS_COLORS } from "@/lib/colors";
import { STATUS_LABELS, defaultStatusFor } from "@/lib/noteStatus";
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
        style={{ fontWeight: "bold", paddingRight: showMenu ? "2.7rem" : "1.5rem", paddingLeft: selectable ? "1.5rem" : 0 }}
      >
        {note.title}
      </div>
      {note.summary && (
        <p style={{ fontSize: "0.85rem", margin: 0, color: "var(--foreground)" }}>{note.summary}</p>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
        }}
      >
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
        <span>
          {statusLabel} · {metaOverride ?? readingTimeLabel(note.wordCount)}
        </span>
      </div>
    </div>
  );
}
