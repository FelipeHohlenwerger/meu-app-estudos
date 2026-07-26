"use client";

import type { ImageShape, ImageAlign } from "@/lib/imageSyntax";

type ImageControls = {
  size: number;
  shape: ImageShape;
  align: ImageAlign;
  onSizeChange: (size: number) => void;
  onShapeChange: (shape: ImageShape) => void;
  onAlignChange: (align: ImageAlign) => void;
};

type Props = {
  image: ImageControls;
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

export default function ImageControlPanel({ image }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        flexWrap: "wrap",
        gap: "0.75rem",
        marginBottom: "1rem",
      }}
    >
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
          <button
            key={s.value}
            title={s.label}
            onClick={() => image.onShapeChange(s.value)}
            className="toolbar-link"
            style={{
              padding: "0.4rem",
              background: image.shape === s.value ? "var(--panel-hover)" : "transparent",
              border: "1px solid var(--panel-border)",
              borderRadius: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--foreground)",
            }}
          >
            <ShapeIcon shape={s.value} />
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "0.3rem" }}>
        {ALIGNS.map((a) => (
          <button
            key={a.value}
            title={a.label}
            onClick={() => image.onAlignChange(a.value)}
            className="toolbar-link"
            style={{
              padding: "0.4rem",
              background: image.align === a.value ? "var(--panel-hover)" : "transparent",
              border: "1px solid var(--panel-border)",
              borderRadius: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--foreground)",
            }}
          >
            <AlignIcon align={a.value} />
          </button>
        ))}
      </div>
    </div>
  );
}
