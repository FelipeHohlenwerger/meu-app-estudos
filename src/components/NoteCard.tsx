"use client";

import { useRef, useState } from "react";
import NoteRowMenu from "@/components/NoteRowMenu";
import CoverMenu from "@/components/CoverMenu";
import { uploadAndSetCover, removeCover } from "@/lib/coverActions";
import { libraryItemKind, type LibraryItemKind } from "@/lib/noteStatus";
import { useVault } from "@/lib/vaultContext";
// Fonte canônica em src/lib/vaultIndex.ts — reexportado aqui só pra não
// quebrar os call sites que já importam LibraryNote a partir deste arquivo
// (ex: page.tsx).
import type { LibraryNote } from "@/lib/vaultIndex";

export type { LibraryNote };

const WORDS_PER_MINUTE = 200;

export function readingTimeLabel(wordCount: number): string {
  const minutes = Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
  return `${minutes} min de leitura`;
}

function MoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

// Ícone de tipo (livro/artigo/nota) — usado grande, centralizado na faixa de
// imagem, quando a nota não tem capa (automática nem manual). Usa
// libraryItemKind (src/lib/noteStatus.ts), que desdobra contentType="book" em
// "book" (PDF/EPUB de verdade) e "article" (.md com "fonte:").
function TypeIcon({ kind, size = 13 }: { kind: LibraryItemKind; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "book") {
    return (
      <svg {...common}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      </svg>
    );
  }
  if (kind === "article") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <path d="M7 8h10M7 12h10M7 16h6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

// Ícone de link — usado no lugar do preview de texto quando a nota é
// classificada como "nota-índice" (ver isIndexNote em vaultIndex.ts).
function LinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill={filled ? "#e0a83a" : "none"}
      stroke={filled ? "#e0a83a" : "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2.5 15.09 8.76 22 9.77 17 14.64 18.18 21.52 12 18.25 5.82 21.52 7 14.64 2 9.77 8.91 8.76 12 2.5Z" />
    </svg>
  );
}

type Props = {
  note: LibraryNote;
  onClick: () => void;
  // Renomear é EDIÇÃO INLINE no próprio card (nunca navega pra nota) — ver
  // isRenaming abaixo. Chamado só no COMMIT (Enter/blur com texto novo), com
  // o texto final e um callback pra fechar o modo de edição quando a
  // chamada à API terminar (sucesso ou erro) — mesmo padrão do rename
  // inline da sidebar em page.tsx (renamingKey), só que o estado de "estou
  // editando" mora aqui, local a cada card, não numa chave global — assim
  // a MESMA nota podendo aparecer em duas seções da Homepage ao mesmo tempo
  // (ex: Favoritos + um tema) nunca vira dois inputs simultâneos sem querer.
  onRename?: (newTitle: string, onSettled: () => void) => void;
  onDelete?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  // Substitui a meta do rodapé (tempo de leitura) por um texto pronto — usado
  // pela seção "Editados recentemente" da Homepage pra mostrar tempo relativo
  // ("há 12 min") no lugar do tempo de leitura, sem afetar nenhuma outra seção
  // (que continua sem passar esse prop).
  metaOverride?: string;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  // Chamado depois de adicionar/trocar/remover a capa pelo menu "..." —
  // quem usa o card decide como refletir isso (ex: refetch da biblioteca).
  onCoverChanged?: () => void;
};

// Botões flutuantes (favorito/opções) sobre a faixa de imagem — precisam de
// contraste tanto sobre uma foto quanto sobre o fundo liso do placeholder de
// tipo, daí o fundo semi-transparente (não existia quando ficavam sobre o
// corpo liso do card, antes do redesenho). Exportado — SubtemaCard.tsx
// reaproveita o mesmo tratamento visual pro botão de capa do subtema.
export const overlayButtonStyle: React.CSSProperties = {
  padding: "0.3rem",
  border: "none",
  borderRadius: "50%",
  cursor: "pointer",
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
};

export default function NoteCard({
  note,
  onClick,
  onRename,
  onDelete,
  selectable,
  selected,
  onToggleSelect,
  metaOverride,
  isFavorite,
  onToggleFavorite,
  onCoverChanged,
}: Props) {
  const { vaultId, vaultFetch } = useVault();
  const itemKind = libraryItemKind(note.filename, note.contentType);
  const [menuAnchor, setMenuAnchor] = useState<{ left: number; top: number; bottom: number } | null>(null);
  const [coverMenuAnchor, setCoverMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(note.title);
  const showMenu = onRename && onDelete;

  function commitRename() {
    const trimmed = renameDraft.trim();
    if (!trimmed || trimmed === note.title) {
      setIsRenaming(false);
      return;
    }
    onRename?.(trimmed, () => setIsRenaming(false));
  }

  function handleAddCoverClick() {
    if (note.coverManualPath) {
      setCoverMenuAnchor({ x: menuAnchor?.left ?? 0, y: menuAnchor?.bottom ?? 0 });
    } else {
      coverFileInputRef.current?.click();
    }
  }

  async function handleCoverFileSelected(file: File) {
    const path = await uploadAndSetCover(vaultFetch, note.filename, file);
    if (path) onCoverChanged?.();
  }

  function handleRemoveCover() {
    setCoverMenuAnchor(null);
    removeCover(vaultFetch, note.filename).then(() => onCoverChanged?.());
  }

  const coverUrl = note.coverPath
    ? /^https?:\/\//i.test(note.coverPath)
      ? note.coverPath
      : `/api/attachments/${encodeURIComponent(note.coverPath.split("/").pop() ?? note.coverPath)}?vault=${encodeURIComponent(vaultId)}`
    : null;

  return (
    <div
      onClick={() => {
        if (!isRenaming) onClick();
      }}
      className="note-card"
      style={{
        border: selected ? "1px solid #2f7fd6" : "1px solid var(--panel-border)",
        borderRadius: "var(--radius)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        background: selected ? "var(--panel-hover)" : undefined,
      }}
    >
      {/* Faixa de imagem — 16:10, largura inteira do card. Capa (manual tem
          prioridade sobre automática, já resolvido em note.coverPath) cortada
          pra preencher sem distorcer; sem capa, ícone de tipo centralizado
          mantendo a mesma altura reservada — card nunca varia de altura por
          causa disso.

          img/ícone são posicionados ABSOLUTE (inset:0) dentro dessa faixa,
          nunca no fluxo flex normal — um <img> com height:100% DENTRO de um
          item flex cujo próprio tamanho vem de aspect-ratio cria uma
          dependência circular (altura do pai depende do aspect-ratio, que
          por sua vez "espera" o filho) que faz alguns browsers IGNORAREM o
          aspect-ratio e usarem a altura intrínseca da imagem em vez da
          calculada — foi o bug real encontrado (faixa de 218px em vez de
          137.5px só quando havia capa). Elemento absolute é tirado do fluxo,
          então o tamanho da faixa nunca depende dele. */}
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
            <TypeIcon kind={itemKind} size={30} />
          </div>
        )}

        {selectable && (
          <input
            type="checkbox"
            checked={!!selected}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleSelect?.()}
            title="Selecionar nota"
            style={{
              position: "absolute",
              top: "0.5rem",
              left: "0.5rem",
              width: "16px",
              height: "16px",
              cursor: "pointer",
            }}
          />
        )}

        <div style={{ position: "absolute", top: "0.4rem", right: "0.4rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className="toolbar-link"
            title={isFavorite ? "Remover dos favoritos" : "Marcar como favorita"}
            style={overlayButtonStyle}
          >
            <StarIcon filled={isFavorite} />
          </button>

          {showMenu && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setMenuAnchor({ left: rect.right - 140, top: rect.top, bottom: rect.bottom });
              }}
              className="toolbar-link"
              title="Opções"
              style={{ ...overlayButtonStyle, color: "white" }}
            >
              <MoreIcon />
            </button>
          )}
        </div>
      </div>

      {menuAnchor && (
        <NoteRowMenu
          triggerRect={menuAnchor}
          onOpen={() => {
            setMenuAnchor(null);
            onClick();
          }}
          onRename={() => {
            setMenuAnchor(null);
            setRenameDraft(note.title);
            setIsRenaming(true);
          }}
          onDelete={() => {
            setMenuAnchor(null);
            onDelete?.();
          }}
          onAddCover={() => {
            setMenuAnchor(null);
            handleAddCoverClick();
          }}
          onClose={() => setMenuAnchor(null)}
        />
      )}

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

      {/* Corpo — altura fixa por construção (título em até 2 linhas + preview
          em 1 linha + rodapé, cada um com clamp/minHeight reservado), igual
          com ou sem capa, título curto ou longo. */}
      <div style={{ padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.3rem", flex: 1 }}>
        {isRenaming ? (
          <input
            autoFocus
            value={renameDraft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setRenameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setIsRenaming(false);
              }
            }}
            style={{
              fontWeight: "bold",
              lineHeight: 1.3,
              minHeight: "2.6em",
              background: "var(--panel-bg)",
              border: "1px solid var(--accent)",
              borderRadius: "4px",
              color: "var(--foreground)",
              padding: "0 0.3rem",
              fontFamily: "inherit",
              fontSize: "inherit",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
        ) : (
          <div
            className="note-card-title"
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
            {note.title}
          </div>
        )}

        {note.isIndexNote ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem", color: "var(--text-muted)", minHeight: "1.3em" }}>
            <LinkIcon />
            {note.linkedNotesCount} {note.linkedNotesCount === 1 ? "nota vinculada" : "notas vinculadas"}
          </div>
        ) : (
          <p
            style={{
              fontSize: "0.85rem",
              margin: 0,
              color: "var(--foreground)",
              lineHeight: 1.3,
              minHeight: "1.3em",
              display: "-webkit-box",
              WebkitLineClamp: 1,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {note.summary || " "}
          </p>
        )}

        <div style={{ marginTop: "auto", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          {metaOverride ?? readingTimeLabel(note.wordCount)}
        </div>
      </div>
    </div>
  );
}
