"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CalibreBookCard from "@/components/CalibreBookCard";
import type { CalibreBook } from "@/lib/calibreLibrary";
import { formatTagLabel } from "@/lib/tagTree";

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

// Campo de busca-com-pílula-removível pra um dos 3 filtros (Assunto/Série/
// Autor) — mesmo espírito de interação do TagField.tsx (digitar, escolher
// sugestão existente, vira pílula), mas sem "criar": só valores que já
// existem nos dados podem virar filtro.
function CalibreFilterField({
  placeholder,
  options,
  selected,
  onChange,
  formatOption,
}: {
  placeholder: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  formatOption?: (value: string) => string;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  // Índice destacado na lista de sugestões — navegável por seta pra cima/
  // baixo, com Enter confirmando a selecionada (mesmo comportamento já
  // implementado pro autocomplete de tags em notas, ver TagField.tsx).
  const [highlighted, setHighlighted] = useState(0);
  // Índice da ÚLTIMA pílula "selecionada" via Backspace (sempre a última da
  // lista, mesmo padrão do campo "Para" do Gmail) — primeiro Backspace com o
  // campo vazio só destaca a pílula (chance de desistir apertando qualquer
  // outra tecla), um SEGUNDO Backspace em seguida é que remove de verdade.
  const [selectedPillIndex, setSelectedPillIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSelectedPillIndex(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setSelectedPillIndex(null);
      }
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
    ? options.filter((o) => o.toLowerCase().includes(query) && !selected.includes(o)).slice(0, 8)
    : [];

  function commit(value: string) {
    onChange([...selected, value]);
    setDraft("");
    setOpen(false);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      commit(suggestions[highlighted] ?? suggestions[0]);
    } else if (e.key === "Backspace" && draft === "") {
      if (selected.length === 0) return;
      e.preventDefault();
      const lastIndex = selected.length - 1;
      if (selectedPillIndex === lastIndex) {
        // 2º Backspace seguido, sem nada de permeio — remove de vez.
        onChange(selected.filter((_, i) => i !== lastIndex));
        setSelectedPillIndex(null);
      } else {
        // 1º Backspace — só destaca, ainda não remove.
        setSelectedPillIndex(lastIndex);
      }
    } else if (selectedPillIndex !== null) {
      // Qualquer outra tecla desfaz o destaque (só Backspace repetido remove).
      setSelectedPillIndex(null);
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative", minWidth: "220px", flex: 1 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.3rem",
          alignItems: "center",
          padding: "0.35rem 0.5rem",
          border: "1px solid var(--panel-border)",
          borderRadius: "6px",
          background: "var(--panel-bg)",
        }}
      >
        {selected.map((value, i) => (
          <span
            key={value}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
              padding: "0.15rem 0.5rem",
              borderRadius: "999px",
              // Destaque do 1º Backspace (ver handleInputKeyDown) — mesmo
              // tom de --accent já usado pra "isto está em edição" em
              // TagChips.tsx, avisando que outro Backspace remove de vez.
              background: selectedPillIndex === i ? "var(--accent)" : "var(--panel-hover)",
              color: selectedPillIndex === i ? "var(--background)" : "inherit",
              fontSize: "0.8rem",
            }}
          >
            {formatOption ? formatOption(value) : value}
            <button
              onClick={() => {
                onChange(selected.filter((s) => s !== value));
                setSelectedPillIndex(null);
              }}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: selectedPillIndex === i ? "var(--background)" : "var(--text-muted)",
                padding: 0,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            setHighlighted(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleInputKeyDown}
          placeholder={selected.length === 0 ? placeholder : ""}
          style={{
            flex: 1,
            minWidth: "80px",
            border: "none",
            outline: "none",
            background: "transparent",
            color: "var(--foreground)",
            fontSize: "0.85rem",
          }}
        />
      </div>

      {open && suggestions.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "0.25rem",
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: "6px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            zIndex: 10,
            padding: "0.3rem",
            maxHeight: "220px",
            overflowY: "auto",
          }}
        >
          {suggestions.map((s, i) => (
            <button
              key={s}
              onClick={() => commit(s)}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "0.35rem 0.5rem",
                background: highlighted === i ? "var(--panel-hover)" : "transparent",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.85rem",
                color: "var(--foreground)",
              }}
            >
              {formatOption ? formatOption(s) : s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type Props = {
  books: CalibreBook[];
  error: string | null;
  onBack: () => void;
  onOpenBook: (book: CalibreBook) => void;
  favoriteIds: Set<number>;
  onToggleFavorite: (calibreId: number) => void;
};

// Página cheia da biblioteca Calibre — grade de capas reais com 3 filtros
// combináveis (Assunto/Série/Autor, E lógico entre eles), diferente do modo
// EXCLUSIVO da aba "Calibre" da sidebar (ver page.tsx). Sem filtro de
// Editora (já disponível direto no Calibre, não precisa ser duplicado aqui).
export default function CalibreLibraryPage({ books, error, onBack, onOpenBook, favoriteIds, onToggleFavorite }: Props) {
  const [subjectFilters, setSubjectFilters] = useState<string[]>([]);
  const [seriesFilters, setSeriesFilters] = useState<string[]>([]);
  const [authorFilters, setAuthorFilters] = useState<string[]>([]);

  const allSubjects = useMemo(() => Array.from(new Set(books.flatMap((b) => b.subjects))).sort(), [books]);
  const allSeries = useMemo(
    () => Array.from(new Set(books.map((b) => b.series).filter((s): s is string => !!s))).sort(),
    [books]
  );
  const allAuthors = useMemo(() => Array.from(new Set(books.flatMap((b) => b.authors))).sort(), [books]);

  const filtered = books.filter(
    (b) =>
      (subjectFilters.length === 0 || subjectFilters.every((f) => b.subjects.includes(f))) &&
      (seriesFilters.length === 0 || (b.series !== null && seriesFilters.includes(b.series))) &&
      (authorFilters.length === 0 || authorFilters.every((f) => b.authors.includes(f)))
  );

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

      <h1 style={{ ...serifStyle, fontSize: "2.4em", margin: 0 }}>Biblioteca Calibre</h1>
      <p style={{ color: "var(--text-muted)", marginTop: "0.4rem" }}>
        {filtered.length} {filtered.length === 1 ? "livro" : "livros"}
      </p>

      {error && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: "6px",
            border: "1px solid var(--danger, #c0392b)",
            background: "var(--panel-hover)",
            color: "var(--danger, #c0392b)",
            fontSize: "0.85rem",
            lineHeight: 1.4,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
        <CalibreFilterField placeholder="Assunto..." options={allSubjects} selected={subjectFilters} onChange={setSubjectFilters} formatOption={formatTagLabel} />
        <CalibreFilterField placeholder="Série..." options={allSeries} selected={seriesFilters} onChange={setSeriesFilters} />
        <CalibreFilterField placeholder="Autor..." options={allAuthors} selected={authorFilters} onChange={setAuthorFilters} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, ${CARD_WIDTH}px)`, gap: "1rem", marginTop: "2rem" }}>
        {filtered.map((book) => (
          <CalibreBookCard
            key={book.id}
            book={book}
            onClick={() => onOpenBook(book)}
            isFavorite={favoriteIds.has(book.id)}
            onToggleFavorite={() => onToggleFavorite(book.id)}
          />
        ))}
      </div>

      {filtered.length === 0 && !error && <p style={{ color: "var(--text-muted)", marginTop: "2rem" }}>Nenhum livro encontrado.</p>}
    </div>
  );
}
