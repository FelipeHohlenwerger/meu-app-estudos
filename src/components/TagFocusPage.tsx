"use client";

import { useState } from "react";
import NoteCard, { type LibraryNote } from "@/components/NoteCard";
import { matchesTypeFilter, CONTENT_TYPE_FILTER_OPTIONS, type ContentTypeFilter } from "@/lib/noteStatus";
import { formatTagLabel } from "@/lib/tagTree";

// Mesma largura fixa de card usada em toda lista da Homepage/Progresso (ver
// LibraryHome.tsx) — grid sem paginação/"+N outras" (GroupedNoteList.tsx
// já estabeleceu esse padrão pra listas "já agrupadas, mostrar tudo": aqui
// não haveria pra onde um "+N outras" levaria, já é a página mais específica).
const CARD_WIDTH = 220;

function BackArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

const serifStyle = { fontFamily: "var(--font-fraunces)" };
const sectionDividerStyle = { borderTop: "0.5px solid var(--panel-border)", paddingTop: "2rem", marginTop: "2rem" };

type Props = {
  macroTag: string;
  // Já vem filtrada pro subtree do macro-tema (tag exata OU começando com
  // "macroTag." — ver page.tsx) — este componente só cuida do filtro por
  // tipo e do agrupamento tema-direto/subtema em cima disso.
  notes: LibraryNote[];
  onBack: () => void;
  onOpenNote: (filename: string) => void;
  onRenameNote: (filename: string, newTitle: string, onSettled: () => void) => void;
  onDeleteNote: (filename: string) => void;
  onToggleFavorite: (filename: string) => void;
};

// Página de foco por macro-tema — aberta ao clicar no nome de um tema na
// Homepage (LibraryHome.tsx). Mostra o filtro por tipo (mesmo padrão da tela
// de Progresso), a seção do tema em si (notas tageadas exatamente
// `macroTag`, sem subtema) e uma seção por subtema (qualquer profundidade,
// cada tag exata do subtree vira sua própria seção).
export default function TagFocusPage({
  macroTag,
  notes,
  onBack,
  onOpenNote,
  onRenameNote,
  onDeleteNote,
  onToggleFavorite,
}: Props) {
  const [typeFilter, setTypeFilter] = useState<ContentTypeFilter>("all");

  const filteredNotes = notes.filter((n) => matchesTypeFilter(n, typeFilter));

  const directNotes = filteredNotes.filter((n) => n.tags.includes(macroTag));

  // Mesmo algoritmo por-tag-exata que a Homepage usava antes de agrupar por
  // macro-tema — aqui escopado ao subtree deste tema, cobre qualquer
  // profundidade (ex: "história.antiga.mesopotâmia" vira sua própria seção).
  const subtagMap = new Map<string, LibraryNote[]>();
  for (const note of filteredNotes) {
    for (const tag of note.tags) {
      if (tag === macroTag || !tag.startsWith(`${macroTag}.`)) continue;
      const list = subtagMap.get(tag) ?? [];
      list.push(note);
      subtagMap.set(tag, list);
    }
  }
  const sortedSubtags = Array.from(subtagMap.entries()).sort((a, b) => b[1].length - a[1].length);

  function renderGrid(groupNotes: LibraryNote[]) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, ${CARD_WIDTH}px)`, gap: "1rem" }}>
        {groupNotes.map((note) => (
          <NoteCard
            key={note.filename}
            note={note}
            onClick={() => onOpenNote(note.filename)}
            onRename={(newTitle, onSettled) => onRenameNote(note.filename, newTitle, onSettled)}
            onDelete={() => onDeleteNote(note.filename)}
            isFavorite={note.isFavorite}
            onToggleFavorite={() => onToggleFavorite(note.filename)}
          />
        ))}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "2.5rem 3rem" }}>
      <button
        onClick={onBack}
        className="toolbar-link"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.3rem 0.6rem",
          marginBottom: "1rem",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: "var(--text-muted)",
          fontSize: "0.85rem",
        }}
      >
        <BackArrowIcon />
        Voltar
      </button>

      <h1 style={{ ...serifStyle, fontSize: "2.4em", margin: 0 }}>{formatTagLabel(macroTag)}</h1>
      <p style={{ color: "var(--text-muted)", marginTop: "0.4rem" }}>
        {filteredNotes.length} {filteredNotes.length === 1 ? "nota" : "notas"}
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
        {CONTENT_TYPE_FILTER_OPTIONS.map((f) => (
          <button
            key={f.value}
            onClick={() => setTypeFilter(f.value)}
            className="toolbar-link"
            style={{
              padding: "0.35rem 0.8rem",
              borderRadius: "999px",
              border: "1px solid var(--panel-border)",
              background: typeFilter === f.value ? "var(--panel-hover)" : "transparent",
              color: typeFilter === f.value ? "var(--foreground)" : "var(--text-muted)",
              fontWeight: typeFilter === f.value ? "bold" : "normal",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {directNotes.length > 0 && (
        <section style={sectionDividerStyle}>
          <h2 style={{ ...serifStyle, fontSize: "1.3em", margin: "0 0 1rem 0" }}>
            {formatTagLabel(macroTag)}{" "}
            <span style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "0.6em", color: "var(--text-muted)" }}>
              ({directNotes.length} {directNotes.length === 1 ? "nota" : "notas"})
            </span>
          </h2>
          {renderGrid(directNotes)}
        </section>
      )}

      {sortedSubtags.map(([tag, tagNotes]) => (
        <section key={tag} style={sectionDividerStyle}>
          <h2 style={{ ...serifStyle, fontSize: "1.3em", margin: "0 0 1rem 0" }}>
            {formatTagLabel(tag)}{" "}
            <span style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "0.6em", color: "var(--text-muted)" }}>
              ({tagNotes.length} {tagNotes.length === 1 ? "nota" : "notas"})
            </span>
          </h2>
          {renderGrid(tagNotes)}
        </section>
      ))}

      {directNotes.length === 0 && sortedSubtags.length === 0 && (
        <p style={{ color: "var(--text-muted)", marginTop: "2rem" }}>Nenhuma nota encontrada.</p>
      )}
    </div>
  );
}
