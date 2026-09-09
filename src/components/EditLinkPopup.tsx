"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  x: number;
  y: number;
  initialText: string;
  initialUrl: string;
  onSave: (text: string, url: string) => void;
  onCancel: () => void;
};

// Popup inline pra editar um link (Markdown ou URL solta) sem precisar expor
// a sintaxe bruta manualmente no editor — "texto" e "url" já vêm preenchidos
// (ver data-link-from/data-link-to em externalLinkMarkFor, livePreview.ts,
// que dizem o que substituir ao salvar). Confirma com Enter (via
// onSubmit do <form>) ou o botão "Salvar"; cancela com Esc ou clique fora
// (mesmo padrão global de window listener do LinkContextMenu/
// CalibreFilterField, não onBlur — precisa fechar mesmo clicando fora dos
// dois <input>s, ex. no botão Cancelar ou fora do popup inteiro).
export default function EditLinkPopup({ x, y, initialText, initialUrl, onSave, onCancel }: Props) {
  const [text, setText] = useState(initialText);
  const [url, setUrl] = useState(initialUrl);
  const ref = useRef<HTMLFormElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    textInputRef.current?.focus();
    textInputRef.current?.select();
  }, []);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedText = text.trim();
    const trimmedUrl = url.trim();
    if (!trimmedText || !trimmedUrl) return;
    onSave(trimmedText, trimmedUrl);
  }

  const inputStyle: React.CSSProperties = {
    padding: "0.35rem 0.5rem",
    border: "1px solid var(--panel-border)",
    borderRadius: "4px",
    background: "var(--background)",
    color: "var(--foreground)",
    fontSize: "0.85rem",
    width: "260px",
  };

  return (
    <form
      ref={ref}
      onSubmit={handleSubmit}
      style={{
        position: "fixed",
        left: x,
        top: y,
        background: "var(--panel-bg)",
        border: "1px solid var(--panel-border)",
        borderRadius: "6px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
        padding: "0.65rem",
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
      }}
    >
      <input ref={textInputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="Texto do link" style={inputStyle} />
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL" style={inputStyle} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem", marginTop: "0.1rem" }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "0.3rem 0.7rem",
            border: "1px solid var(--panel-border)",
            borderRadius: "4px",
            background: "transparent",
            color: "var(--foreground)",
            cursor: "pointer",
            fontSize: "0.8rem",
          }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          style={{
            padding: "0.3rem 0.7rem",
            border: "none",
            borderRadius: "4px",
            background: "#2f7fd6",
            color: "white",
            cursor: "pointer",
            fontSize: "0.8rem",
          }}
        >
          Salvar
        </button>
      </div>
    </form>
  );
}
