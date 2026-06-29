"use client";

import { useState } from "react";

const TIPOS_FUNDO = ["conceito", "critica", "citacao", "duvida", "conexao", "sintese", "acao"];
const TIPOS_SUBLINHADO = [...TIPOS_FUNDO, "preto", "azul"];

const CORES_FUNDO: Record<string, string> = {
  conceito: "#fff3a0",
  critica: "#ffd0d0",
  citacao: "#d4f7d4",
  duvida: "#e6d9f7",
  conexao: "#cfe8ff",
  sintese: "#ffe4c2",
  acao: "#dde4ea",
};

const CORES_SUBLINHADO: Record<string, string> = {
  conceito: "#d4af00",
  critica: "#d04444",
  citacao: "#2e9e4e",
  duvida: "#8d5fc7",
  conexao: "#2f7fd6",
  sintese: "#d6822f",
  acao: "#5b6b78",
  preto: "#000000",
  azul: "#1e5fd6",
};

type Props = {
  x: number;
  y: number;
  onSelect: (tipo: string, modo: "fundo" | "sublinhado") => void;
  onRemove?: () => void;
  onComment?: (tipo: string) => void;
  initialTipo?: string;
  initialModo?: "fundo" | "sublinhado" | "comentario";
};


export default function HighlightMenu({ x, y, onSelect, onRemove, onComment, initialTipo, initialModo }: Props) {
  const [modo, setModo] = useState<"fundo" | "sublinhado" | "comentario">(initialModo ?? "fundo");
  const tipos = modo === "fundo" ? TIPOS_FUNDO : modo === "sublinhado" ? TIPOS_SUBLINHADO : TIPOS_FUNDO;
  const cores = modo === "fundo" ? CORES_FUNDO : modo === "sublinhado" ? CORES_SUBLINHADO : CORES_FUNDO;


  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        background: "white",
        border: "1px solid #ccc",
        borderRadius: "6px",
        padding: "0.5rem",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        zIndex: 1000,
      }}
    >
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "0.5rem" }}>
        <button
          onClick={() => setModo("fundo")}
          style={{
            padding: "0.25rem 0.5rem",
            fontSize: "12px",
            fontWeight: modo === "fundo" ? "bold" : "normal",
            background: modo === "fundo" ? "#eee" : "transparent",
            border: "1px solid #ccc",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Destaque
        </button>
        <button
          onClick={() => setModo("sublinhado")}
          style={{
            padding: "0.25rem 0.5rem",
            fontSize: "12px",
            fontWeight: modo === "sublinhado" ? "bold" : "normal",
            background: modo === "sublinhado" ? "#eee" : "transparent",
            border: "1px solid #ccc",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Sublinhado
        </button>
        {onComment && (
          <button
            onClick={() => setModo("comentario")}
            style={{
              padding: "0.25rem 0.5rem",
              fontSize: "12px",
              fontWeight: modo === "comentario" ? "bold" : "normal",
              background: modo === "comentario" ? "#eee" : "transparent",
              border: "1px solid #ccc",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            💬 Comentar
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", maxWidth: "220px" }}>
        {tipos.map((tipo) => (
          <button
            key={tipo}
            title={tipo}
            onClick={() => {
              if (modo === "comentario") {
                onComment?.(tipo);
              } else {
                onSelect(tipo, modo);
              }
            }}
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              border: modo !== "comentario" && tipo === initialTipo && modo === initialModo ? "3px solid #333" : "1px solid #999",
              background: cores[tipo],
              cursor: "pointer",
            }}
          />
        ))}
      </div>

      {onRemove && (
        <button
          onClick={onRemove}
          style={{
            marginTop: "0.5rem",
            width: "100%",
            padding: "0.25rem",
            fontSize: "12px",
            color: "#a33",
            background: "transparent",
            border: "1px solid #d99",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Remover marcação
        </button>
      )}
    </div>
  );
}