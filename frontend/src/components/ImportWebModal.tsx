"use client";

import { useEffect, useRef } from "react";

type Props = {
  url: string;
  onUrlChange: (url: string) => void;
  onSubmit: (url: string) => void;
  onCancel: () => void;
};

// `url` é controlado pelo componente pai (page.tsx) — não estado local —
// porque esse modal é desmontado enquanto a extração está em andamento
// (ImportProgressModal ocupa o lugar dele) e remontado se der erro; um estado
// local aqui perderia a URL digitada nesse ciclo, obrigando o usuário a
// redigitar pra tentar de novo.
export default function ImportWebModal({ url, onUrlChange, onSubmit, onCancel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  function handleSubmit() {
    const trimmed = url.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel-bg)",
          border: "1px solid var(--panel-border)",
          borderRadius: "8px",
          padding: "1.5rem",
          width: "420px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}
      >
        <h3 style={{ marginBottom: "0.5rem", fontSize: "1rem", color: "var(--foreground)" }}>Importar da web</h3>
        <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Cole a URL de um artigo — o conteúdo principal (sem menus, propaganda ou barra lateral) vira uma nota.
        </p>

        <input
          ref={inputRef}
          type="url"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder="https://exemplo.com/artigo"
          style={{
            width: "100%",
            padding: "0.5rem 0.6rem",
            border: "1px solid var(--panel-border)",
            borderRadius: "4px",
            background: "var(--background)",
            color: "var(--foreground)",
            fontSize: "0.9rem",
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.25rem" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "0.4rem 0.8rem",
              border: "1px solid var(--panel-border)",
              borderRadius: "4px",
              background: "transparent",
              color: "var(--foreground)",
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!url.trim()}
            style={{
              padding: "0.4rem 0.8rem",
              border: "none",
              borderRadius: "4px",
              background: "#2f7fd6",
              color: "white",
              cursor: url.trim() ? "pointer" : "not-allowed",
              opacity: url.trim() ? 1 : 0.6,
            }}
          >
            Importar
          </button>
        </div>
      </div>
    </div>
  );
}
