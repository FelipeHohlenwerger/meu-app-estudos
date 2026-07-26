"use client";

import { useEffect, useRef } from "react";
import { NOTE_FONTS, type NoteFontId } from "@/lib/fonts";

type Props = {
  x: number;
  y: number;
  size: number;
  isOverridden: boolean;
  onSizeChange: (size: number) => void;
  onToggleOverride: (checked: boolean) => void;
  font: NoteFontId;
  isFontOverridden: boolean;
  onFontChange: (font: NoteFontId) => void;
  onToggleFontOverride: (checked: boolean) => void;
  onClose: () => void;
};

const MIN_SIZE = 10;
const MAX_SIZE = 28;

export default function FontSizePopup({
  x,
  y,
  size,
  isOverridden,
  onSizeChange,
  onToggleOverride,
  font,
  isFontOverridden,
  onFontChange,
  onToggleFontOverride,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: x,
        top: y,
        background: "var(--panel-bg)",
        border: "1px solid var(--panel-border)",
        borderRadius: "6px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        padding: "0.7rem",
        zIndex: 1000,
        minWidth: "240px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", marginBottom: "0.6rem" }}>
        <button
          className="toolbar-link"
          disabled={size <= MIN_SIZE}
          onClick={() => onSizeChange(Math.max(MIN_SIZE, size - 1))}
          style={{
            background: "transparent",
            border: "1px solid var(--panel-border)",
            borderRadius: "4px",
            color: "var(--foreground)",
            cursor: size <= MIN_SIZE ? "default" : "pointer",
            opacity: size <= MIN_SIZE ? 0.4 : 1,
            padding: "0.2rem 0.5rem",
            fontSize: "0.75rem",
            fontWeight: "bold",
          }}
        >
          A
        </button>
        <span style={{ fontSize: "13px", color: "var(--text-muted)", minWidth: "3em", textAlign: "center" }}>{size}px</span>
        <button
          className="toolbar-link"
          disabled={size >= MAX_SIZE}
          onClick={() => onSizeChange(Math.min(MAX_SIZE, size + 1))}
          style={{
            background: "transparent",
            border: "1px solid var(--panel-border)",
            borderRadius: "4px",
            color: "var(--foreground)",
            cursor: size >= MAX_SIZE ? "default" : "pointer",
            opacity: size >= MAX_SIZE ? 0.4 : 1,
            padding: "0.2rem 0.5rem",
            fontSize: "1.1rem",
            fontWeight: "bold",
          }}
        >
          A
        </button>
      </div>

      <div
        style={{
          background: "var(--background)",
          border: "1px solid var(--panel-border)",
          borderRadius: "4px",
          padding: "0.5rem",
          marginBottom: "0.6rem",
          color: "var(--foreground)",
          fontSize: `${size}px`,
          fontFamily: NOTE_FONTS.find((f) => f.id === font)?.cssVar,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        Aa — exemplo de texto
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "12px", color: "var(--text-muted)", cursor: "pointer", marginBottom: "0.7rem" }}>
        <input type="checkbox" checked={isOverridden} onChange={(e) => onToggleOverride(e.target.checked)} />
        Usar este tamanho só nesta nota
      </label>

      <div style={{ borderTop: "1px solid var(--panel-border)", margin: "0 0 0.6rem 0" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", marginBottom: "0.6rem" }}>
        {NOTE_FONTS.map((f) => (
          <button
            key={f.id}
            className="toolbar-link"
            onClick={() => onFontChange(f.id)}
            style={{
              textAlign: "left",
              padding: "0.4rem 0.5rem",
              background: f.id === font ? "var(--panel-hover)" : "transparent",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
              fontFamily: f.cssVar,
              color: "var(--foreground)",
              fontWeight: f.id === font ? "bold" : "normal",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "12px", color: "var(--text-muted)", cursor: "pointer" }}>
        <input type="checkbox" checked={isFontOverridden} onChange={(e) => onToggleFontOverride(e.target.checked)} />
        Usar esta fonte só nesta nota
      </label>
    </div>
  );
}
