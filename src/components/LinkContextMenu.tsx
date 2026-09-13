"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  x: number;
  y: number;
  onOpenBackground: () => void;
  onCopyLink: () => void;
  onCopyText: () => void;
  onEdit: () => void;
  onClose: () => void;
};

// Menu de contexto customizado pro botão direito num link (Markdown ou URL
// solta) do editor — substitui o menu nativo do navegador, que não faz
// sentido aqui (o "link" é um <span> decorado, não uma <a> de verdade).
// Fecha em qualquer clique fora ou Esc, mesmo padrão de CalibreFilterField/
// CalibreSubjectFilterModal (listener global em window, não um simples
// onBlur — precisa pegar clique em QUALQUER lugar da página, não só dentro
// do editor).
export default function LinkContextMenu({ x, y, onOpenBackground, onCopyLink, onCopyText, onEdit, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // Um "contextmenu" NOVO em outro lugar já dispara "mousedown" antes de si
    // mesmo (mousedown sempre precede contextmenu), então esse "mousedown"
    // sozinho já cobre "abrir outro menu fecha o atual". Não dá pra também
    // escutar "contextmenu" aqui pra fechar: é o MESMO evento que abriu ESTE
    // menu (ainda bolhando até `window` depois que o handler do CodeMirror já
    // rodou setLinkContextMenu) — ouvir os dois faria o menu se fechar
    // sozinho na hora de abrir (bug real, encontrado testando).
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const items: { label: string; onClick: () => void }[] = [
    { label: "Abrir em nova aba", onClick: onOpenBackground },
    { label: "Copiar link", onClick: onCopyLink },
    { label: "Copiar texto do link", onClick: onCopyText },
    { label: "Editar link", onClick: onEdit },
  ];

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
        boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
        padding: "0.3rem",
        zIndex: 2000,
        minWidth: "190px",
      }}
    >
      {items.map((item, i) => (
        <button
          key={item.label}
          onClick={() => {
            // try/finally: se item.onClick() lançar (ex: uma ação de cópia
            // que falhe), o menu ainda assim fecha — nunca deve travar aberto
            // por causa de um erro numa ação individual (bug real relatado:
            // clipboard indisponível fazia nem copiar nem fechar).
            try {
              item.onClick();
            } finally {
              onClose();
            }
          }}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "0.4rem 0.6rem",
            border: "none",
            borderRadius: "4px",
            background: hovered === i ? "var(--panel-hover)" : "transparent",
            color: "var(--foreground)",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
