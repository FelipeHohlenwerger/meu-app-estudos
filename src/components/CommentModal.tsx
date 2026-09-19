"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  tipo: string;
  initialText?: string;
  // Quando passado, o rótulo do tipo (linha 40) vira um botão que abre um
  // mini-menu de cores ANCORADO NELE MESMO (position: relative no botão +
  // absolute no menu) — nunca em coordenadas de tela calculadas a partir de
  // um elemento externo. Esse é o ajuste de posição pedido: antes, editar um
  // comentário abria um menu flutuante ancorado no pequeno botão "Editar" do
  // card (podia nascer perto da borda direita do painel, de só 280px, e
  // estourar a tela); agora o seletor de tipo mora dentro do próprio modal,
  // que já fica centralizado — não há mais coordenada nenhuma pra acertar.
  tipoOptions?: [string, string][];
  onTipoChange?: (tipo: string) => void;
  onConfirm: (texto: string) => void;
  onCancel: () => void;
};

export default function CommentModal({ tipo, initialText, tipoOptions, onTipoChange, onConfirm, onCancel }: Props) {
  const [texto, setTexto] = useState(initialText ?? "");
  const [tipoPickerOpen, setTipoPickerOpen] = useState(false);
  const tipoPickerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!tipoPickerOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (tipoPickerRef.current && !tipoPickerRef.current.contains(e.target as Node)) setTipoPickerOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [tipoPickerOpen]);

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
        <h3 style={{ marginBottom: "0.75rem", fontSize: "1rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          {initialText !== undefined ? "Editar comentário" : "Novo comentário"} —{" "}
          {tipoOptions && tipoOptions.length > 0 ? (
            <span ref={tipoPickerRef} style={{ position: "relative", display: "inline-block" }}>
              <button
                onClick={() => setTipoPickerOpen((v) => !v)}
                style={{
                  fontWeight: "normal",
                  fontSize: "0.85rem",
                  background: "transparent",
                  border: "1px solid var(--panel-border)",
                  borderRadius: "4px",
                  padding: "0.1rem 0.4rem",
                  color: "var(--foreground)",
                  cursor: "pointer",
                }}
              >
                {tipo} ▾
              </button>
              {tipoPickerOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: "0.25rem",
                    background: "var(--panel-bg)",
                    border: "1px solid var(--panel-border)",
                    borderRadius: "6px",
                    padding: "0.4rem",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.2rem",
                    minWidth: "150px",
                    maxHeight: "220px",
                    overflowY: "auto",
                    zIndex: 2001,
                  }}
                >
                  {tipoOptions.map(([t, cor]) => (
                    <button
                      key={t}
                      onClick={() => {
                        onTipoChange?.(t);
                        setTipoPickerOpen(false);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        padding: "0.3rem 0.5rem",
                        background: t === tipo ? "var(--panel-hover)" : "transparent",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        textAlign: "left",
                        fontSize: "0.8rem",
                        color: "var(--foreground)",
                      }}
                    >
                      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: cor, flexShrink: 0 }} />
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </span>
          ) : (
            <span style={{ fontWeight: "normal" }}>{tipo}</span>
          )}
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
