"use client";

import { useEffect, useRef, useState } from "react";
import type { AiAction } from "@/lib/aiActions";
import { highlightColors as CORES_FUNDO, underlineColors as CORES_SUBLINHADO } from "@/lib/colors";

const TIPOS_FUNDO = ["conceito", "duvidas", "referencias", "exemplo", "acao", "opiniao_autor"];
const TIPOS_SUBLINHADO = [...TIPOS_FUNDO, "preto", "azul"];
const TIPOS_COMENTARIO = [...TIPOS_FUNDO];

type Props = {
  x: number;
  y: number;
  // Opcional — quando ausente (caso do EPUB, que não tem destaque/sublinhado
  // por trecho), o menu esconde as abas Destaque/Sublinhado e a grade de
  // cores, mostrando só as ações de IA (se onAiAction for passado).
  onSelect?: (tipo: string, modo: "fundo" | "sublinhado") => void;
  onRemove?: () => void;
  onComment?: (tipo: string) => void;
  onAiAction?: (action: AiAction) => void;
  onTranslate?: () => void;
  onClose?: () => void;
  // Clique dentro deste elemento não fecha o menu, mesmo fora do próprio
  // menu — usado pelo NotePanel.tsx pra excluir o editor CodeMirror, que já
  // tem seu próprio mecanismo de abrir/reposicionar/fechar o menu via
  // seleção (selectionWatcher). Sem essa exclusão, um duplo-clique pra
  // selecionar uma palavra nova abre o menu E fecha ele de volta no MESMO
  // mousedown (o segundo clique do duplo-clique borbulha até aqui depois do
  // CodeMirror já ter reaberto o menu na nova posição).
  getExcludedElement?: () => HTMLElement | null;
  initialTipo?: string;
  initialModo?: "fundo" | "sublinhado" | "comentario";
};

export default function HighlightMenu({ x, y, onSelect, onRemove, onComment, onAiAction, onTranslate, onClose, getExcludedElement, initialTipo, initialModo }: Props) {
  const [modo, setModo] = useState<"fundo" | "sublinhado" | "comentario">(initialModo ?? "fundo");
  const menuRef = useRef<HTMLDivElement>(null);

  // Fecha o menu ao clicar fora dele ou apertar ESC — sem isso (caso do
  // EpubViewer, que não tem um editor de texto por trás pra zerar a seleção
  // sozinho), o menu fica preso na tela indefinidamente depois da ação.
  useEffect(() => {
    if (!onClose) return;
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current && menuRef.current.contains(target)) return;
      if (getExcludedElement?.()?.contains(target)) return;
      onClose?.();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, getExcludedElement]);

  // Estas linhas DENTRO do componente, onde "modo" existe
  const tipos = modo === "fundo" ? TIPOS_FUNDO : modo === "sublinhado" ? TIPOS_SUBLINHADO : TIPOS_COMENTARIO;
  const cores = modo === "fundo" ? CORES_FUNDO : modo === "sublinhado" ? CORES_SUBLINHADO : CORES_FUNDO;

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: x,
        top: y,
        background: "var(--panel-bg)",
        border: "1px solid var(--panel-border)",
        borderRadius: "6px",
        padding: "0.5rem",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        zIndex: 1000,
      }}
    >
      {onSelect && (
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "0.5rem" }}>
        <button
          onClick={() => setModo("fundo")}
          style={{
            padding: "0.25rem 0.5rem",
            fontSize: "12px",
            fontWeight: modo === "fundo" ? "bold" : "normal",
            background: modo === "fundo" ? "var(--panel-hover)" : "transparent",
            border: "1px solid var(--panel-border)",
            borderRadius: "4px",
            color: "var(--foreground)",
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
            background: modo === "sublinhado" ? "var(--panel-hover)" : "transparent",
            border: "1px solid var(--panel-border)",
            borderRadius: "4px",
            color: "var(--foreground)",
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
              background: modo === "comentario" ? "var(--panel-hover)" : "transparent",
              border: "1px solid var(--panel-border)",
              borderRadius: "4px",
              color: "var(--foreground)",
              cursor: "pointer",
            }}
          >
            Comentar
          </button>
        )}
      </div>
      )}

      {onSelect && (
      <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", maxWidth: "220px" }}>
        {tipos.map((tipo) => (
          <button
            key={tipo}
            title={tipo}
            onClick={() => {
              if (modo === "comentario") {
                onComment?.(tipo);
              } else {
                onSelect?.(tipo, modo);
              }
            }}
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              border: modo !== "comentario" && tipo === initialTipo && modo === initialModo ? "3px solid #fff" : "1px solid var(--panel-border)",
              background: cores[tipo],
              cursor: "pointer",
            }}
          />
        ))}
      </div>
      )}

      {(onAiAction || onTranslate) && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
            ...(onSelect ? { marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid var(--panel-border)" } : {}),
          }}
        >
          {onAiAction && (
            <>
              <button
                onClick={() => onAiAction("resumir")}
                style={{
                  padding: "0.3rem 0.6rem",
                  fontSize: "12px",
                  textAlign: "left",
                  background: "transparent",
                  border: "1px solid var(--panel-border)",
                  borderRadius: "4px",
                  color: "var(--foreground)",
                  cursor: "pointer",
                }}
              >
                ✨ Resumir
              </button>
              <button
                onClick={() => onAiAction("explicar")}
                style={{
                  padding: "0.3rem 0.6rem",
                  fontSize: "12px",
                  textAlign: "left",
                  background: "transparent",
                  border: "1px solid var(--panel-border)",
                  borderRadius: "4px",
                  color: "var(--foreground)",
                  cursor: "pointer",
                }}
              >
                ✨ Explicar
              </button>
              <button
                onClick={() => onAiAction("perguntas")}
                style={{
                  padding: "0.3rem 0.6rem",
                  fontSize: "12px",
                  textAlign: "left",
                  background: "transparent",
                  border: "1px solid var(--panel-border)",
                  borderRadius: "4px",
                  color: "var(--foreground)",
                  cursor: "pointer",
                }}
              >
                ✨ Gerar perguntas de revisão
              </button>
            </>
          )}
          {onTranslate && (
            <button
              onClick={onTranslate}
              style={{
                padding: "0.3rem 0.6rem",
                fontSize: "12px",
                textAlign: "left",
                background: "transparent",
                border: "1px solid var(--panel-border)",
                borderRadius: "4px",
                color: "var(--foreground)",
                cursor: "pointer",
              }}
            >
              🌐 Traduzir
            </button>
          )}
        </div>
      )}

      {onRemove && (
        <button
          onClick={onRemove}
          style={{
            marginTop: "0.5rem",
            width: "100%",
            padding: "0.25rem",
            fontSize: "12px",
            color: "#ff6b6b",
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