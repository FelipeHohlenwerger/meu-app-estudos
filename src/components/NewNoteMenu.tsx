"use client";

import { useEffect, useRef } from "react";

type Props = {
  x: number;
  y: number;
  // "down-right" (padrão): abre a partir do canto do gatilho, crescendo pra
  // baixo/direita — certo pros gatilhos do header/sidebar. "up-left": abre
  // crescendo pra cima/esquerda — necessário pro FAB no canto inferior direito
  // da tela, senão o menu nasceria fora da viewport.
  direction?: "down-right" | "up-left";
  onCreateBlank: () => void;
  onImportClick: () => void;
  onImportWebClick: () => void;
  onClose: () => void;
};

export default function NewNoteMenu({
  x,
  y,
  direction = "down-right",
  onCreateBlank,
  onImportClick,
  onImportWebClick,
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

  // "down-right": x/y = canto superior-esquerdo do menu (mesmo comportamento
  // de sempre). "up-left": x/y = ponto de referência (canto superior-esquerdo
  // do gatilho) a partir do qual o menu cresce pra cima/esquerda — por isso
  // usa "right"/"bottom" em vez de "left"/"top", crescendo pro lado oposto
  // independente do tamanho real do menu.
  const positionStyle =
    direction === "up-left"
      ? { right: window.innerWidth - x, bottom: window.innerHeight - y }
      : { left: x, top: y };

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        ...positionStyle,
        background: "var(--panel-bg)",
        border: "1px solid var(--panel-border)",
        borderRadius: "6px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        padding: "0.5rem",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: "0.3rem",
        minWidth: "200px",
      }}
    >
      <button
        onClick={onCreateBlank}
        className="toolbar-link"
        style={{
          padding: "0.5rem 0.7rem",
          background: "transparent",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          textAlign: "left",
          fontSize: "13px",
          color: "var(--foreground)",
        }}
      >
        Nota em branco
      </button>
      <button
        onClick={onImportClick}
        className="toolbar-link"
        style={{
          padding: "0.5rem 0.7rem",
          background: "transparent",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          textAlign: "left",
          fontSize: "13px",
          color: "var(--foreground)",
        }}
      >
        Importar PDF/EPUB
      </button>
      <button
        onClick={onImportWebClick}
        className="toolbar-link"
        style={{
          padding: "0.5rem 0.7rem",
          background: "transparent",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          textAlign: "left",
          fontSize: "13px",
          color: "var(--foreground)",
        }}
      >
        Importar da web
      </button>
    </div>
  );
}
