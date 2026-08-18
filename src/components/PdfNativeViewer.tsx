"use client";

import { useVault } from "@/lib/vaultContext";

type Props = {
  filename: string;
  initialPage?: number;
  // Só passado pra livro do Calibre — substitui a URL vault-relativa que
  // este componente construiria sozinho a partir de filename/vaultId.
  sourceUrl?: string;
};

// PDF abre no visualizador nativo do navegador (mesmo que abre um link de PDF
// solto) — sem marcação colorida, só leitura.
//
// Quem monta este componente (NotePanel.tsx) deve passar uma `key` que mude a
// cada novo link de página clicado pro MESMO arquivo (ex: key={initialPage})
// — isso remonta o componente inteiro (reabrindo o iframe já na página nova)
// em vez de precisar sincronizar via efeito.
export default function PdfNativeViewer({ filename, initialPage, sourceUrl }: Props) {
  const { vaultId } = useVault();

  const baseSrc = sourceUrl ?? `/api/note/file?filename=${encodeURIComponent(filename)}&vault=${encodeURIComponent(vaultId)}`;
  const src = `${baseSrc}${initialPage ? `#page=${initialPage}` : ""}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0, height: "100%", width: "100%" }}>
      <iframe key={initialPage} src={src} title={filename} style={{ flex: 1, width: "100%", height: "100%", border: "none" }} />
    </div>
  );
}
