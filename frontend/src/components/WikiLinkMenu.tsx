"use client";

type Entry = { label: string; filename: string };

type Props = {
  x: number;
  y: number;
  entries: Entry[];
  selectedIndex: number;
  onSelect: (entry: Entry) => void;
};

export default function WikiLinkMenu({ x, y, entries, selectedIndex, onSelect }: Props) {
  if (entries.length === 0) {
    return (
      <div
        style={{
          position: "fixed",
          left: x,
          top: y,
          background: "var(--panel-bg)",
          border: "1px solid var(--panel-border)",
          borderRadius: "6px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          padding: "0.5rem 0.7rem",
          zIndex: 1000,
          fontSize: "13px",
          color: "var(--text-muted)",
        }}
      >
        Nenhuma nota encontrada
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        background: "var(--panel-bg)",
        border: "1px solid var(--panel-border)",
        borderRadius: "6px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        padding: "0.5rem",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: "0.2rem",
        minWidth: "200px",
        maxWidth: "320px",
      }}
    >
      {entries.map((entry, index) => (
        <button
          key={entry.filename}
          onClick={() => onSelect(entry)}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "0.4rem 0.6rem",
            background: index === selectedIndex ? "var(--panel-hover)" : "transparent",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "13px",
            color: "var(--foreground)",
          }}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}
