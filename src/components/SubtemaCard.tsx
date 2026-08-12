"use client";

import { useRef, useState } from "react";
import CoverMenu from "@/components/CoverMenu";
import { overlayButtonStyle } from "@/components/NoteCard";
import { uploadAndSetTagCover, removeTagCover } from "@/lib/coverActions";
import { useVault } from "@/lib/vaultContext";

// Ícone de camadas — placeholder padrão da faixa de imagem quando o subtema
// não tem capa manual definida. Deliberadamente diferente dos TypeIcon de
// NoteCard.tsx (livro/artigo/nota): um subtema não é um item de conteúdo, é
// um agrupamento, e o ícone precisa comunicar isso à primeira vista. Exportado
// — GraphView.tsx reaproveita o mesmo ícone pro nó "tag" do Modo Mapa (mesma
// linguagem visual "isto é um agrupamento", não um item de conteúdo).
export function LayersIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="m3 13 9 5 9-5" />
      <path d="m3 17.5 9 5 9-5" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

type Props = {
  // Caminho de tag completo do subtema (ex: "história.pré-história.livros")
  // — usado só pra navegação/capa, nunca exibido cru (ver `label`).
  tagPath: string;
  label: string; // já formatado, só o segmento relativo (ver formatTagLabel em TagFocusPage.tsx)
  count: number; // notas de toda a subárvore deste subtema (agregado, não só direto)
  coverPath: string | null; // path de attachment vault-relativo, ou null (sem capa manual)
  onClick: () => void;
  onCoverChanged: () => void;
};

// Card de subtema na seção "Subtemas" da página de foco — mesmo esqueleto
// visual de NoteCard (faixa de imagem 16:10 + corpo de altura fixa), mas
// sempre reconhecível à distância como algo DIFERENTE de um card de nota: a
// ação do clique é "entrar" numa nova TagFocusPage (navegação), não "abrir"
// conteúdo — daí a borda âmbar (mesmo tom de --tag-link-color usado em
// qualquer link de tema/tag no app) + seta no corpo, os dois sinais visuais
// combinados de propósito (borda pro reconhecimento de longe, seta pra quem
// olhar com mais atenção). Mesmo componente em toda profundidade da árvore,
// então a sinalização nunca varia entre níveis.
export default function SubtemaCard({ tagPath, label, count, coverPath, onClick, onCoverChanged }: Props) {
  const { vaultId, vaultFetch } = useVault();
  const [coverMenuAnchor, setCoverMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  async function handleCoverFileSelected(file: File) {
    const path = await uploadAndSetTagCover(vaultFetch, tagPath, file);
    if (path) onCoverChanged();
  }

  function handleRemoveCover() {
    setCoverMenuAnchor(null);
    removeTagCover(vaultFetch, tagPath).then(onCoverChanged);
  }

  const coverUrl = coverPath
    ? `/api/attachments/${encodeURIComponent(coverPath.split("/").pop() ?? coverPath)}?vault=${encodeURIComponent(vaultId)}`
    : null;

  return (
    <div
      onClick={onClick}
      className="note-card"
      style={{
        border: "2px solid var(--tag-link-color)",
        borderRadius: "var(--radius)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Faixa de imagem — mesmo tratamento 16:10/absolute de NoteCard.tsx
          (ver o comentário lá sobre a dependência circular aspect-ratio/img
          que motivou esse padrão). */}
      <div
        style={{
          width: "100%",
          aspectRatio: "16 / 10",
          flexShrink: 0,
          position: "relative",
          overflow: "hidden",
          background: "var(--panel-hover)",
          color: "var(--text-muted)",
        }}
      >
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LayersIcon />
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            if (coverPath) {
              const rect = e.currentTarget.getBoundingClientRect();
              setCoverMenuAnchor({ x: rect.left, y: rect.bottom + 4 });
            } else {
              coverFileInputRef.current?.click();
            }
          }}
          className="toolbar-link"
          title={coverPath ? "Trocar capa do subtema" : "Adicionar capa ao subtema"}
          style={{ ...overlayButtonStyle, color: "white", position: "absolute", top: "0.4rem", right: "0.4rem" }}
        >
          <ImageIcon />
        </button>
      </div>

      {coverMenuAnchor && (
        <CoverMenu
          x={coverMenuAnchor.x}
          y={coverMenuAnchor.y}
          onChange={() => {
            setCoverMenuAnchor(null);
            coverFileInputRef.current?.click();
          }}
          onRemove={handleRemoveCover}
          onClose={() => setCoverMenuAnchor(null)}
        />
      )}

      <input
        ref={coverFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleCoverFileSelected(file);
        }}
      />

      {/* Corpo — só nome do subtema + contador (sem preview de texto: um
          subtema não tem conteúdo textual próprio) + seta fixada embaixo,
          reforçando "entrar", não "abrir". */}
      <div style={{ padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.3rem", flex: 1 }}>
        <div
          style={{
            fontWeight: "bold",
            lineHeight: 1.3,
            minHeight: "2.6em",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {label}
        </div>

        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          <span>
            {count} {count === 1 ? "nota" : "notas"}
          </span>
          <span style={{ color: "var(--tag-link-color)", display: "flex" }}>
            <ChevronRightIcon />
          </span>
        </div>
      </div>
    </div>
  );
}
