"use client";

import { useState } from "react";
import { useVault } from "@/lib/vaultContext";

type Props = {
  filename: string;
  initialPage?: number;
};

// PDF abre no visualizador nativo do navegador (mesmo que abre um link de PDF
// solto) — sem marcação colorida, só leitura. A referência de posição vira o
// número de página, digitado à mão pela pessoa (não dá pra ler de volta a
// página atual de dentro do visualizador nativo de forma confiável entre
// navegadores — limitação real, não escolha de implementação).
//
// Quem monta este componente (page.tsx) deve passar uma `key` que mude a cada
// novo link de página clicado pro MESMO arquivo (ex: key={initialPage}) — isso
// remonta o componente inteiro (reiniciando `pageInput` a partir do novo
// `initialPage`) em vez de precisar sincronizar via efeito.
export default function PdfNativeViewer({ filename, initialPage }: Props) {
  const { vaultId } = useVault();
  const [pageInput, setPageInput] = useState(initialPage ?? 1);
  const [copied, setCopied] = useState(false);

  function handleCopyLink() {
    navigator.clipboard.writeText(`[[${filename}#p${pageInput}]]`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const src = `/api/note/file?filename=${encodeURIComponent(filename)}&vault=${encodeURIComponent(vaultId)}${initialPage ? `#page=${initialPage}` : ""}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0, height: "100%", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0", flexShrink: 0 }}>
        <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Página:</span>
        <input
          type="number"
          min={1}
          value={pageInput}
          onChange={(e) => setPageInput(Math.max(1, parseInt(e.target.value, 10) || 1))}
          style={{
            width: "4.5em",
            padding: "0.3rem 0.5rem",
            borderRadius: "4px",
            border: "1px solid var(--panel-border)",
            background: "transparent",
            color: "var(--foreground)",
          }}
        />
        <button
          className="toolbar-link"
          onClick={handleCopyLink}
          style={{
            padding: "0.3rem 0.6rem",
            borderRadius: "4px",
            border: "1px solid var(--panel-border)",
            background: "transparent",
            cursor: "pointer",
            fontSize: "0.8rem",
          }}
        >
          {copied ? "Copiado!" : "Copiar link desta página"}
        </button>
      </div>
      <iframe
        key={initialPage}
        src={src}
        title={filename}
        style={{ flex: 1, width: "100%", height: "100%", border: "none" }}
      />
    </div>
  );
}
