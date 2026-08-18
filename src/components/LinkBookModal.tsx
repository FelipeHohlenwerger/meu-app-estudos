"use client";

import { useEffect, useState } from "react";

type LinkedNote = { vaultId: string; filename: string; title: string; vaultName: string };

type Props = {
  calibreId: number;
  bookTitle: string;
  vaultId: string;
  // Lista de alvos de link já carregada por NotePanel.tsx (mesma usada pro
  // autocomplete "[[" — aqui filtramos só os com source !== "calibre", já
  // que este modal busca NOTAS, nunca outro livro).
  noteTargets: { filename: string; title: string; aliases: string[]; source?: "note" | "calibre" }[];
  onCreateNote: (title: string) => Promise<string | null>;
  onClose: () => void;
};

// Modal "Vincular a uma nota" — botão "Vincular" no cabeçalho do visualizador
// de um livro do Calibre (ver NotePanel.tsx). Mostra e permite remover os
// vínculos já existentes, e busca/cria uma nota nova pra vincular — nunca
// insere texto na nota, o vínculo é só metadado (ver calibreAnnotations.ts).
export default function LinkBookModal({ calibreId, bookTitle, vaultId, noteTargets, onCreateNote, onClose }: Props) {
  const [linkedNotes, setLinkedNotes] = useState<LinkedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  function fetchLinks() {
    fetch(`/api/calibre/note-links?calibreId=${calibreId}`)
      .then((res) => res.json())
      .then((data) => setLinkedNotes(data.notes ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calibreId]);

  async function addLink(filename: string) {
    setBusy(true);
    try {
      await fetch("/api/calibre/note-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calibreId, vaultId, filename }),
      });
      setQuery("");
      fetchLinks();
    } finally {
      setBusy(false);
    }
  }

  async function removeLink(note: LinkedNote) {
    setLinkedNotes((prev) => prev.filter((n) => !(n.vaultId === note.vaultId && n.filename === note.filename)));
    await fetch(
      `/api/calibre/note-links?calibreId=${calibreId}&vaultId=${encodeURIComponent(note.vaultId)}&filename=${encodeURIComponent(note.filename)}`,
      { method: "DELETE" }
    );
  }

  async function handleCreateAndLink() {
    const title = query.trim();
    if (!title) return;
    setBusy(true);
    try {
      const filename = await onCreateNote(title);
      if (filename) await addLink(filename);
    } finally {
      setBusy(false);
    }
  }

  const q = query.trim().toLowerCase();
  const linkedFilenamesInVault = new Set(linkedNotes.filter((n) => n.vaultId === vaultId).map((n) => n.filename));
  const suggestions = q
    ? noteTargets
        .filter((t) => t.source !== "calibre" && !linkedFilenamesInVault.has(t.filename))
        .filter((t) => t.title.toLowerCase().includes(q))
        .slice(0, 8)
    : [];
  const exactMatch = suggestions.some((s) => s.title.toLowerCase() === q);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3100 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel-bg)",
          border: "1px solid var(--panel-border)",
          borderRadius: "8px",
          padding: "1.25rem",
          width: "380px",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h3 style={{ fontSize: "1rem", margin: 0 }}>Vincular a uma nota</h3>
          <button
            onClick={onClose}
            title="Fechar"
            style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "1.2rem", color: "var(--text-muted)" }}
          >
            ×
          </button>
        </div>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 0, marginBottom: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {bookTitle}
        </p>

        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar ou criar nota..."
          style={{
            width: "100%",
            padding: "0.5rem 0.6rem",
            fontSize: "0.9rem",
            border: "1px solid var(--panel-border)",
            borderRadius: "6px",
            background: "var(--background)",
            color: "var(--foreground)",
            marginBottom: "0.5rem",
          }}
        />

        {q && (
          <div style={{ maxHeight: "180px", overflowY: "auto", marginBottom: "0.75rem" }}>
            {suggestions.map((s) => (
              <button
                key={s.filename}
                disabled={busy}
                onClick={() => addLink(s.filename)}
                className="toolbar-link"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.4rem 0.5rem",
                  background: "transparent",
                  border: "none",
                  borderRadius: "4px",
                  cursor: busy ? "default" : "pointer",
                  fontSize: "0.85rem",
                  color: "var(--foreground)",
                }}
              >
                {s.title}
              </button>
            ))}
            {!exactMatch && (
              <button
                disabled={busy}
                onClick={handleCreateAndLink}
                className="toolbar-link"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.4rem 0.5rem",
                  background: "transparent",
                  border: "none",
                  borderRadius: "4px",
                  cursor: busy ? "default" : "pointer",
                  fontSize: "0.85rem",
                  color: "var(--foreground)",
                }}
              >
                + Criar nota &quot;{query.trim()}&quot;
              </button>
            )}
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--panel-border)", paddingTop: "0.6rem", overflowY: "auto" }}>
          {loading ? (
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Carregando...</p>
          ) : linkedNotes.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Nenhuma nota vinculada ainda.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {linkedNotes.map((note) => (
                <li
                  key={`${note.vaultId}:${note.filename}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}
                >
                  <span style={{ fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {note.title}
                    {note.vaultId !== vaultId && (
                      <span style={{ color: "var(--text-muted)" }}> — {note.vaultName}</span>
                    )}
                  </span>
                  <button
                    onClick={() => removeLink(note)}
                    title="Remover vínculo"
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", flexShrink: 0 }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
