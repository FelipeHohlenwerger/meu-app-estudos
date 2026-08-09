"use client";

import { useEffect, useRef, useState } from "react";
import type { ImageShape, ImageAlign, ImageWrap } from "@/lib/imageSyntax";

type ImageControls = {
  size: number;
  shape: ImageShape;
  align: ImageAlign;
  wrap: ImageWrap;
  onSizeChange: (size: number) => void;
  onShapeChange: (shape: ImageShape) => void;
  onAlignChange: (align: ImageAlign) => void;
  onWrapChange: (wrap: ImageWrap) => void;
};

type Props = {
  image: ImageControls;
  // Só presentes quando usado como popup flutuante (desktop, ancorado na
  // imagem — ver NotePanel.tsx). Ausentes na versão embutida na folha "Mais
  // opções" do mobile, que renderiza inline sem posição fixa nem fechamento
  // por clique fora (o próprio sheet já cuida disso).
  x?: number;
  y?: number;
  onClose?: () => void;
};

const SHAPES: { value: ImageShape; label: string }[] = [
  { value: "rect", label: "Retangular" },
  { value: "square", label: "Quadrado" },
  { value: "circle", label: "Círculo" },
  { value: "oval", label: "Oval" },
];

const ALIGNS: { value: ImageAlign; label: string }[] = [
  { value: "left", label: "Alinhar à esquerda" },
  { value: "center", label: "Centralizar" },
  { value: "right", label: "Alinhar à direita" },
];

// Nomeados pela perspectiva do texto (mesmo espírito de ImageWrap em
// imageSyntax.ts) — "Direita" = texto flui à direita, imagem à esquerda.
const WRAPS: { value: ImageWrap; label: string }[] = [
  { value: "none", label: "Nenhum" },
  { value: "right", label: "Direita" },
  { value: "left", label: "Esquerda" },
];

function ShapeIcon({ shape }: { shape: ImageShape }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 };
  if (shape === "rect") return <svg {...common}><rect x="3" y="6" width="18" height="12" rx="1" /></svg>;
  if (shape === "square") return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="1" /></svg>;
  if (shape === "circle") return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>;
  return <svg {...common}><ellipse cx="12" cy="12" rx="9" ry="6" /></svg>;
}

function AlignIcon({ align }: { align: ImageAlign }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 };
  if (align === "left")
    return (
      <svg {...common}>
        <line x1="4" y1="6" x2="14" y2="6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="18" x2="14" y2="18" />
      </svg>
    );
  if (align === "right")
    return (
      <svg {...common}>
        <line x1="10" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="10" y1="18" x2="20" y2="18" />
      </svg>
    );
  return (
    <svg {...common}>
      <line x1="7" y1="6" x2="17" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="7" y1="18" x2="17" y2="18" />
    </svg>
  );
}

const toolButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: "0.4rem",
  background: active ? "var(--panel-hover)" : "transparent",
  border: "1px solid var(--panel-border)",
  borderRadius: "4px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--foreground)",
});

export default function ImageControlPanel({ image, x, y, onClose }: Props) {
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Só é um popup flutuante quando as 3 props de ancoragem vêm juntas (uso no
  // desktop) — a versão embutida na folha do mobile não passa nenhuma delas.
  const floating = x !== undefined && y !== undefined && onClose !== undefined;

  useEffect(() => {
    if (!floating) return;
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose?.();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [floating, onClose]);

  return (
    <div
      ref={ref}
      style={
        floating
          ? {
              position: "fixed",
              left: x,
              top: y,
              background: "var(--panel-bg)",
              border: "1px solid var(--panel-border)",
              borderRadius: "8px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              padding: "0.6rem",
              zIndex: 1000,
              maxWidth: "calc(100vw - 2rem)",
            }
          : { marginBottom: "1rem" }
      }
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: floating ? "flex-start" : "flex-end", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Tamanho</span>
          <input
            type="range"
            min={10}
            max={150}
            step={5}
            value={image.size}
            onChange={(e) => image.onSizeChange(Number(e.target.value))}
            style={{ width: "120px" }}
          />
          <span style={{ fontSize: "12px", color: "var(--text-muted)", width: "2.5em", textAlign: "right" }}>
            {image.size}%
          </span>
        </div>

        <div style={{ display: "flex", gap: "0.3rem" }}>
          {SHAPES.map((s) => (
            <button key={s.value} title={s.label} onClick={() => image.onShapeChange(s.value)} className="toolbar-link" style={toolButtonStyle(image.shape === s.value)}>
              <ShapeIcon shape={s.value} />
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "0.3rem" }}>
          {ALIGNS.map((a) => (
            <button key={a.value} title={a.label} onClick={() => image.onAlignChange(a.value)} className="toolbar-link" style={toolButtonStyle(image.align === a.value)}>
              <AlignIcon align={a.value} />
            </button>
          ))}
        </div>

        <button
          title="Mais opções"
          onClick={() => setShowMoreOptions((v) => !v)}
          className="toolbar-link"
          style={{ ...toolButtonStyle(showMoreOptions), fontSize: "1rem", lineHeight: 1 }}
        >
          ⋯
        </button>
      </div>

      {/* Texto ao redor (wrap) — usado com pouca frequência, por isso fica
          escondido atrás do "⋯" em vez de sempre visível junto do resto. */}
      {showMoreOptions && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginTop: "0.6rem",
            paddingTop: "0.6rem",
            borderTop: "1px solid var(--panel-border)",
          }}
        >
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Texto ao redor</span>
          {WRAPS.map((w) => (
            <button
              key={w.value}
              onClick={() => image.onWrapChange(w.value)}
              className="toolbar-link"
              style={{
                padding: "0.3rem 0.6rem",
                background: image.wrap === w.value ? "var(--panel-hover)" : "transparent",
                border: "1px solid var(--panel-border)",
                borderRadius: "4px",
                cursor: "pointer",
                color: "var(--foreground)",
                fontSize: "0.8rem",
              }}
            >
              {w.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
