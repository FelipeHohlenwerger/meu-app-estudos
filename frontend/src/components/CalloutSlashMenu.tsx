"use client";

import { useEffect, useRef } from "react";

type Props = {
  x: number;
  y: number;
  entries: [string, string][];
  selectedIndex: number;
  onSelect: (tipo: string) => void;
  onClose?: () => void;
};

export default function CalloutSlashMenu({ x, y, entries, selectedIndex, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onClose) return;
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose?.();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
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
        padding: "0.5rem",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: "0.3rem",
        minWidth: "160px",
      }}
    >
      {entries.map(([tipo, cor], index) => (
        <button
          key={tipo}
          onClick={() => onSelect(tipo)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.4rem 0.6rem",
            background: index === selectedIndex ? "var(--panel-hover)" : "transparent",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            textAlign: "left",
            fontSize: "13px",
            color: "var(--foreground)",
          }}
        >
          <span
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: cor,
              flexShrink: 0,
            }}
          />
          {tipo}
        </button>
      ))}
    </div>
  );
}
