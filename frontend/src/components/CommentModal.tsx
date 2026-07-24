"use client";

import { useState } from "react";

type Props = {
  tipo: string;
  initialText?: string;
  onConfirm: (texto: string) => void;
  onCancel: () => void;
};

export default function CommentModal({ tipo, initialText, onConfirm, onCancel }: Props) {
  const [texto, setTexto] = useState(initialText ?? "");

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
      onClick={onCancel} // clicar no fundo escuro cancela
    >
      <div
        onClick={(e) => e.stopPropagation()} // evita que clique dentro do modal feche ele
        style={{
          background: "var(--panel-bg)",
          border: "1px solid var(--panel-border)",
          borderRadius: "8px",
          padding: "1.5rem",
          width: "360px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}
      >
        <h3 style={{ marginBottom: "0.75rem", fontSize: "1rem" }}>
          {initialText !== undefined ? "Editar comentário" : "Novo comentário"} — <span style={{ fontWeight: "normal" }}>{tipo}</span>
        </h3>

        <textarea
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escreva seu comentário..."
          style={{
            width: "100%",
            height: "100px",
            padding: "0.5rem",
            fontSize: "14px",
            fontFamily: "inherit",
            resize: "vertical",
            border: "1px solid var(--panel-border)",
            borderRadius: "4px",
            background: "var(--background)",
            color: "var(--foreground)",
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
          <button
            onClick={onCancel}
            style={{ padding: "0.4rem 0.8rem", border: "1px solid var(--panel-border)", borderRadius: "4px", background: "transparent", color: "var(--foreground)", cursor: "pointer" }}
          >
            Cancelar
          </button>
          <button
            onClick={() => texto.trim() && onConfirm(texto.trim())}
            style={{ padding: "0.4rem 0.8rem", border: "none", borderRadius: "4px", background: "#2f7fd6", color: "white", cursor: "pointer" }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}