"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  tags: string[];
  allKnownTags: string[];
  onChange: (tags: string[]) => void;
};

export default function TagField({ tags, allKnownTags, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const query = draft.trim().toLowerCase();
  const suggestions = query
    ? allKnownTags.filter((t) => t.toLowerCase().includes(query) && !tags.includes(t)).slice(0, 6)
    : [];
  const exactMatch = allKnownTags.some((t) => t.toLowerCase() === query);
  const showCreateOption = query.length > 0 && !exactMatch && !tags.includes(query);

  function commitTag(tag: string) {
    const clean = tag.trim();
    if (!clean || tags.includes(clean)) return;
    onChange([...tags, clean]);
    setDraft("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0) commitTag(suggestions[0]);
      else if (draft.trim()) commitTag(draft);
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="+ tag"
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--foreground)",
          fontSize: "0.8rem",
          width: "70px",
          minWidth: "50px",
        }}
      />

      {open && (suggestions.length > 0 || showCreateOption) && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "0.25rem",
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: "6px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            padding: "0.3rem",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: "0.15rem",
            minWidth: "160px",
          }}
        >
          {suggestions.map((tag) => (
            <button
              key={tag}
              onClick={() => commitTag(tag)}
              className="toolbar-link"
              style={{
                padding: "0.4rem 0.55rem",
                background: "transparent",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "13px",
                color: "var(--foreground)",
              }}
            >
              {tag}
            </button>
          ))}
          {showCreateOption && (
            <button
              onClick={() => commitTag(draft)}
              className="toolbar-link"
              style={{
                padding: "0.4rem 0.55rem",
                background: "transparent",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "13px",
                color: "var(--accent, var(--foreground))",
              }}
            >
              Criar tag: “{draft.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Lista de tags já adicionadas — separada do input "+ tag" (que fica ao lado
// do título) pra poder ser renderizada numa linha própria, abaixo e à
// esquerda do título, em vez de inline com ele.
type TagChipsProps = {
  tags: string[];
  onChange: (tags: string[]) => void;
};

export function TagChips({ tags, onChange }: TagChipsProps) {
  if (tags.length === 0) return null;

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.35rem" }}>
      {tags.map((tag) => (
        <span
          key={tag}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            background: "var(--panel-hover)",
            border: "1px solid var(--panel-border)",
            borderRadius: "999px",
            padding: "0.15rem 0.5rem",
            fontSize: "0.8rem",
            color: "var(--foreground)",
            whiteSpace: "nowrap",
          }}
        >
          {tag}
          <button
            onClick={() => removeTag(tag)}
            title={`Remover tag "${tag}"`}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              lineHeight: 1,
              padding: 0,
              fontSize: "0.85rem",
            }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
