"use client";

type Props = {
  x: number;
  y: number;
  content: string;
  onClose: () => void;
};

export default function FootnotePopup({ x, y, content, onClose }: Props) {
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
        padding: "0.6rem 0.8rem",
        zIndex: 1500,
        maxWidth: "320px",
        fontSize: "13px",
        color: "var(--foreground)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.2rem" }}>
        <button
          onClick={onClose}
          style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "1rem", color: "var(--text-muted)", lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      <div>{content}</div>
    </div>
  );
}
