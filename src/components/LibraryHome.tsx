"use client";

import { useState, type ReactNode } from "react";
import NoteCard, { type LibraryNote } from "@/components/NoteCard";
import { STATUS_COLORS } from "@/lib/colors";
import { STATUS_LABELS, BOOK_STATUS_ORDER, NOTE_STATUS_ORDER } from "@/lib/noteStatus";

type Props = {
  notes: LibraryNote[];
  onOpenNote: (filename: string) => void;
  onRenameNote: (filename: string) => void;
  onDeleteNote: (filename: string) => void;
  onViewTag: (tag: string | null) => void;
  onViewAllNotes: () => void;
  onViewStatus: (status: string) => void;
  onOpenNewNoteMenu: (rect: DOMRect, direction?: "down-right" | "up-left") => void;
  onFileDropped: (file: File) => void;
  // Mesmas 3 ações do menu "+" — reaproveitadas em destaque no estado vazio
  // (vault novo, ou vault existente que perdeu todas as notas).
  onCreateBlank: () => void;
  onImportClick: () => void;
  onImportWebClick: () => void;
  // Desabilita o botão "Criar nota" enquanto a criação anterior ainda está em
  // andamento — evita cliques repetidos disparando várias notas de uma vez
  // (ex: numa resposta de rede mais lenta que o normal).
  creatingBlankNote?: boolean;
};

function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function DocumentPlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M12 11v6M9 14h6" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      <path d="M7 9l5-5 5 5" />
      <path d="M12 4v12" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
    </svg>
  );
}

function EmptyStateActionButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="toolbar-link"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.7rem 1.2rem",
        border: "1px solid var(--panel-border)",
        borderRadius: "var(--radius)",
        background: "transparent",
        color: "var(--foreground)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        fontSize: "0.9rem",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

const serifStyle = { fontFamily: "var(--font-fraunces)" };

function SectionGrid({
  notes,
  onOpenNote,
  onRenameNote,
  onDeleteNote,
  onViewMore,
}: {
  notes: LibraryNote[];
  onOpenNote: (filename: string) => void;
  onRenameNote: (filename: string) => void;
  onDeleteNote: (filename: string) => void;
  onViewMore: () => void;
}) {
  const COLUMNS = 4;
  const showMoreCard = notes.length > COLUMNS;
  const visibleNotes = showMoreCard ? notes.slice(0, COLUMNS - 1) : notes;
  const remaining = notes.length - visibleNotes.length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
      {visibleNotes.map((note) => (
        <NoteCard
          key={note.filename}
          note={note}
          onClick={() => onOpenNote(note.filename)}
          onRename={() => onRenameNote(note.filename)}
          onDelete={() => onDeleteNote(note.filename)}
        />
      ))}
      {showMoreCard && (
        <div
          onClick={onViewMore}
          style={{
            border: "1px solid var(--panel-border)",
            borderRadius: "var(--radius)",
            padding: "1rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#2f7fd6",
            fontWeight: "bold",
          }}
        >
          + {remaining} outras
        </div>
      )}
    </div>
  );
}

function StatusCounter({ status, count, onClick }: { status: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="toolbar-link"
      style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
    >
      <div style={{ fontSize: "1.8em" }}>{count}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "0.8rem",
          color: "var(--text-muted)",
        }}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: STATUS_COLORS[status],
            display: "inline-block",
          }}
        />
        {STATUS_LABELS[status]}
      </div>
    </button>
  );
}

export default function LibraryHome({
  notes,
  onOpenNote,
  onRenameNote,
  onDeleteNote,
  onViewTag,
  onViewAllNotes,
  onViewStatus,
  onOpenNewNoteMenu,
  onFileDropped,
  onCreateBlank,
  onImportClick,
  onImportWebClick,
  creatingBlankNote,
}: Props) {
  const [dragActive, setDragActive] = useState(false);

  const tagCounts = new Map<string, number>();
  for (const note of notes) {
    for (const tag of note.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
  const untaggedNotes = notes.filter((n) => n.tags.length === 0);

  const statusCounts = new Map<string, number>();
  for (const note of notes) {
    statusCounts.set(note.status, (statusCounts.get(note.status) ?? 0) + 1);
  }

  const sectionDividerStyle = { borderTop: "0.5px solid var(--panel-border)", paddingTop: "2rem", marginTop: "2rem" };

  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        padding: "2.5rem 3rem",
        position: "relative",
        outline: dragActive ? "2px dashed #2f7fd6" : "none",
        outlineOffset: "-8px",
        background: "linear-gradient(to bottom, var(--gradient-top), var(--background) 260px, var(--background) 100%)",
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFileDropped(file);
      }}
    >
      {notes.length === 0 ? (
        <div
          style={{
            minHeight: "60vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: "0.5rem",
          }}
        >
          <h1 style={{ ...serifStyle, fontSize: "2em", margin: 0 }}>Sua biblioteca está vazia</h1>
          <p style={{ color: "var(--text-muted)", margin: "0 0 1.5rem 0" }}>
            Adicione sua primeira nota ou importe um conteúdo já pronto.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
            <EmptyStateActionButton
              icon={<DocumentPlusIcon />}
              label={creatingBlankNote ? "Criando..." : "Criar nota"}
              onClick={onCreateBlank}
              disabled={creatingBlankNote}
            />
            <EmptyStateActionButton icon={<UploadIcon />} label="Importar EPUB/PDF" onClick={onImportClick} />
            <EmptyStateActionButton icon={<GlobeIcon />} label="Importar da web" onClick={onImportWebClick} />
          </div>
        </div>
      ) : (
      <>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h1 style={{ ...serifStyle, fontSize: "2.4em", margin: 0 }}>Sua biblioteca</h1>
        <button
          onClick={onViewAllNotes}
          className="toolbar-link"
          style={{ padding: "0.4rem 0.8rem", border: "1px solid var(--panel-border)", borderRadius: "4px", cursor: "pointer" }}
        >
          Todas as notas
        </button>
      </div>
      <p style={{ color: "var(--text-muted)", marginTop: "0.4rem" }}>
        {notes.length} {notes.length === 1 ? "nota" : "notas"} em {sortedTags.length}{" "}
        {sortedTags.length === 1 ? "tema" : "temas"}
      </p>

      <section style={sectionDividerStyle}>
        <h2 style={{ ...serifStyle, fontSize: "1.3em", margin: "0 0 1rem 0" }}>Progresso</h2>

        <div style={{ marginBottom: "1.2rem" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>Livros</div>
          <div style={{ display: "flex", gap: "2.5rem", flexWrap: "wrap" }}>
            {BOOK_STATUS_ORDER.map((status) => (
              <StatusCounter
                key={status}
                status={status}
                count={statusCounts.get(status) ?? 0}
                onClick={() => onViewStatus(status)}
              />
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>Notas</div>
          <div style={{ display: "flex", gap: "2.5rem", flexWrap: "wrap" }}>
            {NOTE_STATUS_ORDER.map((status) => (
              <StatusCounter
                key={status}
                status={status}
                count={statusCounts.get(status) ?? 0}
                onClick={() => onViewStatus(status)}
              />
            ))}
          </div>
        </div>
      </section>

      {sortedTags.map(([tag, count]) => (
        <section key={tag} style={sectionDividerStyle}>
          <h2 style={{ ...serifStyle, fontSize: "1.3em", margin: "0 0 1rem 0" }}>
            {tag}{" "}
            <span style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "0.6em", color: "var(--text-muted)" }}>
              ({count} {count === 1 ? "nota" : "notas"})
            </span>
          </h2>
          <SectionGrid
            notes={notes.filter((n) => n.tags.includes(tag))}
            onOpenNote={onOpenNote}
            onRenameNote={onRenameNote}
            onDeleteNote={onDeleteNote}
            onViewMore={() => onViewTag(tag)}
          />
        </section>
      ))}

      <section style={sectionDividerStyle}>
        <h2 style={{ ...serifStyle, fontSize: "1.3em", margin: "0 0 1rem 0" }}>
          Sem categoria{" "}
          <span style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "0.6em", color: "var(--text-muted)" }}>
            ({untaggedNotes.length} {untaggedNotes.length === 1 ? "nota" : "notas"})
          </span>
        </h2>
        <SectionGrid
          notes={untaggedNotes}
          onOpenNote={onOpenNote}
          onRenameNote={onRenameNote}
          onDeleteNote={onDeleteNote}
          onViewMore={() => onViewTag(null)}
        />
      </section>
      </>
      )}

      <button
        onClick={(e) => onOpenNewNoteMenu(e.currentTarget.getBoundingClientRect(), "up-left")}
        title="Nova nota"
        style={{
          position: "fixed",
          right: "2.5rem",
          bottom: "2.5rem",
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          background: "#2f7fd6",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
        }}
      >
        <PlusIcon />
      </button>
    </div>
  );
}
