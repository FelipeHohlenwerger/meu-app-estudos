"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onSubmit: (name: string) => void;
  onCancel: () => void;
  submitting?: boolean;
  // Só no modo desktop (Tauri) — abre um seletor nativo de pastas, alternativa
  // ao fluxo de digitar um nome (que continua igual em qualquer modo).
  onPickFolder?: () => void;
  allowFolderPicker?: boolean;
};

export default function CreateVaultModal({ onSubmit, onCancel, submitting, onPickFolder, allowFolderPicker }: Props) {
  const [name, setName] = useState("");
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
    const trimmed = name.trim();
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
          width: "380px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}
      >
        <h3 style={{ marginBottom: "0.5rem", fontSize: "1rem", color: "var(--foreground)" }}>Novo vault</h3>
        <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Dê um nome — a pasta é criada automaticamente, isolada de todos os outros vaults.
        </p>

        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder="Filosofia"
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
            disabled={!name.trim() || submitting}
            style={{
              padding: "0.4rem 0.8rem",
              border: "none",
              borderRadius: "4px",
              background: "#2f7fd6",
              color: "white",
              cursor: name.trim() && !submitting ? "pointer" : "not-allowed",
              opacity: name.trim() && !submitting ? 1 : 0.6,
            }}
          >
            Criar
          </button>
        </div>

        {allowFolderPicker && (
          <button
            onClick={onPickFolder}
            className="toolbar-link"
            style={{
              marginTop: "0.75rem",
              width: "100%",
              padding: "0.4rem 0.6rem",
              border: "1px dashed var(--panel-border)",
              borderRadius: "4px",
              background: "transparent",
              color: "var(--foreground)",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            Escolher pasta existente…
          </button>
        )}
      </div>
    </div>
  );
}
