"use client";

import { useEffect, useRef } from "react";

type Props = {
  x: number;
  y: number;
  onChange: () => void;
  onRemove: () => void;
  onClose: () => void;
};

// Popup pequeno mostrado ao clicar em "+ Capa" quando a nota já tem uma capa
// manual definida — mesmo padrão ref+outside-click+Escape de FontSizePopup.tsx.
// Sem capa manual ainda, o botão abre o seletor de arquivo direto, sem passar
// por aqui (ver handleCoverButtonClick em NotePanel.tsx).
export default function CoverMenu({ x, y, onChange, onRemove, onClose }: Props) {
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

  const buttonStyle: React.CSSProperties = {
    padding: "0.45rem 0.6rem",
    background: "transparent",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    textAlign: "left",
    fontSize: "13px",
    color: "var(--foreground)",
  };

  return (
    <div
      ref={ref}
      // Para junto qualquer clique aqui dentro — este menu é sempre
      // renderizado DENTRO de um elemento que também tem seu próprio
      // onClick (o card inteiro abre a nota, ou no caso de SubtemaCard,
      // navega pro subtema); sem isso, clicar em "Remover capa"/"Trocar
      // capa" também "vazava" esse clique pro card por baixo (mesmo
      // problema que NoteRowMenu.tsx já tratava, só que faltava aqui).
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left: x,
        top: y,
        background: "var(--panel-bg)",
        border: "1px solid var(--panel-border)",
        borderRadius: "6px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        padding: "0.3rem",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: "0.15rem",
        minWidth: "150px",
      }}
    >
      <button
        onClick={onChange}
        className="toolbar-link"
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--panel-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        Trocar capa
      </button>
      <button
        onClick={onRemove}
        style={{ ...buttonStyle, color: "#d04444" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--panel-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        Remover capa
      </button>
    </div>
  );
}
