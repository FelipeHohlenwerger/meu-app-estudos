"use client";

import { useEffect, useRef } from "react";

type Props = {
  x: number;
  y: number;
  onOpen?: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
};

export default function NoteRowMenu({ x, y, onOpen, onRename, onDelete, onClose }: Props) {
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
      // Para junto qualquer clique aqui dentro — em alguns lugares onde esse
      // menu é usado (ex: NoteCard) ele é renderizado DENTRO de um elemento
      // que também tem seu próprio onClick (o card inteiro abre a nota ao
      // clicar); sem isso, clicar numa opção do menu também "vazaria" esse
      // clique pro card por baixo, disparando os dois ao mesmo tempo.
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
        minWidth: "140px",
      }}
    >
      {onOpen && (
        <button
          onClick={onOpen}
          className="toolbar-link"
          style={{
            padding: "0.45rem 0.6rem",
            background: "transparent",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            textAlign: "left",
            fontSize: "13px",
            color: "var(--foreground)",
          }}
        >
          Abrir
        </button>
      )}
      <button
        onClick={onRename}
        className="toolbar-link"
        style={{
          padding: "0.45rem 0.6rem",
          background: "transparent",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          textAlign: "left",
          fontSize: "13px",
          color: "var(--foreground)",
        }}
      >
        Renomear
      </button>
      <button
        onClick={onDelete}
        style={{
          padding: "0.45rem 0.6rem",
          background: "transparent",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          textAlign: "left",
          fontSize: "13px",
          color: "#d04444",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--panel-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        Excluir
      </button>
    </div>
  );
}
