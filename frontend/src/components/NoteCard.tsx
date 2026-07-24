"use client";

import { useState } from "react";
import NoteRowMenu from "@/components/NoteRowMenu";
import { STATUS_COLORS } from "@/lib/colors";
import { STATUS_LABELS, defaultStatusFor, type ContentType } from "@/lib/noteStatus";

export { STATUS_COLORS, STATUS_LABELS };

export type LibraryNote = {
  filename: string;
  title: string;
  tags: string[];
  status: string;
  contentType: ContentType;
  summary: string;
  wordCount: number;
};

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

type Props = {
  note: LibraryNote;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
};

export default function NoteCard({ note, onClick, onRename, onDelete, selectable, selected, onToggleSelect }: Props) {
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
            position: "absolute",
            top: "0.5rem",
            right: "0.5rem",
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
        style={{ fontWeight: "bold", paddingRight: showMenu ? "1.5rem" : 0, paddingLeft: selectable ? "1.5rem" : 0 }}
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
          {statusLabel} · {readingTimeLabel(note.wordCount)}
        </span>
      </div>
    </div>
  );
}
