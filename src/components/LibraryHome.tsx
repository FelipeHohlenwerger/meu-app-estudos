"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import NoteCard, { type LibraryNote } from "@/components/NoteCard";
import { STATUS_COLORS } from "@/lib/colors";
import { STATUS_LABELS, NOTE_STATUS_ORDER } from "@/lib/noteStatus";
import { formatRelativeTime } from "@/lib/relativeTime";
import { formatTagLabel } from "@/lib/tagTree";

type Props = {
  notes: LibraryNote[];
  onOpenNote: (filename: string) => void;
  onRenameNote: (filename: string) => void;
  onDeleteNote: (filename: string) => void;
  onViewTag: (tag: string | null) => void;
  // Só o nome do macro-tema é clicável (ver seção de temas mais abaixo) — vai
  // pra página de foco (TagFocusPage), diferente de onViewTag(null), que
  // continua indo pra lista plana "Sem categoria".
  onViewTagFocus: (macroTag: string) => void;
  onViewStatus: (status: string) => void;
  onViewRecent: () => void;
  onViewFavorites: () => void;
  onToggleFavorite: (filename: string) => void;
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

// Largura fixa de cada card em toda grade de cards da Homepage — nunca
// "1fr"/"repeat(N, 1fr)", que estica o card pra dividir o espaço disponível
// (bug real: com poucos itens ou tela larga, o card fica muito maior que o
// tamanho pretendido). Cards sempre com essa largura, quebrando linha
// normalmente, sobra de espaço vazio é esperado e correto.
const CARD_ROW_MIN_WIDTH = 220;
const CARD_ROW_GAP = 16; // 1rem

function SectionGrid({
  notes,
  onOpenNote,
  onRenameNote,
  onDeleteNote,
  onViewMore,
  onToggleFavorite,
}: {
  notes: LibraryNote[];
  onOpenNote: (filename: string) => void;
  onRenameNote: (filename: string) => void;
  onDeleteNote: (filename: string) => void;
  onViewMore: () => void;
  onToggleFavorite: (filename: string) => void;
}) {
  const COLUMNS = 4;
  const showMoreCard = notes.length > COLUMNS;
  const visibleNotes = showMoreCard ? notes.slice(0, COLUMNS - 1) : notes;
  const remaining = notes.length - visibleNotes.length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(4, ${CARD_ROW_MIN_WIDTH}px)`, gap: "1rem" }}>
      {visibleNotes.map((note) => (
        <NoteCard
          key={note.filename}
          note={note}
          onClick={() => onOpenNote(note.filename)}
          onRename={() => onRenameNote(note.filename)}
          onDelete={() => onDeleteNote(note.filename)}
          isFavorite={note.isFavorite}
          onToggleFavorite={() => onToggleFavorite(note.filename)}
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

// Linha de cards que preenche a largura disponível (quantos couberem, sem
// quebrar linha nem rolar) em vez do grid fixo de 4 colunas do SectionGrid —
// por isso não reaproveita SectionGrid: são dois algoritmos de layout
// diferentes o bastante pra não valer a pena forçar um componente só a fazer
// as duas coisas. Mede a própria largura via ResizeObserver (o container da
// Homepage não tem max-width, então isso genuinamente varia com a janela).
// Reaproveitada tanto por "Favoritos" quanto por "Editados recentemente" —
// só muda a lista de notas (já ordenada por quem chama) e o texto de meta
// (getMeta, opcional — sem ele cada NoteCard mostra o padrão status/tempo de
// leitura). Sem card de "Mostrar todos": a lista completa já é acessível
// clicando no título da seção (ver LibraryHome), então cada linha mostra o
// máximo de cards reais que couberem no espaço, sem "gastar" um slot com um
// card de overflow.
function CardRow({
  notes,
  getMeta,
  onOpenNote,
  onRenameNote,
  onDeleteNote,
  onToggleFavorite,
}: {
  notes: LibraryNote[];
  getMeta?: (note: LibraryNote) => string;
  onOpenNote: (filename: string) => void;
  onRenameNote: (filename: string) => void;
  onDeleteNote: (filename: string) => void;
  onToggleFavorite: (filename: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const perCardWidth = CARD_ROW_MIN_WIDTH + CARD_ROW_GAP;
  // Antes de medir (primeiro render), assume 4 — mesmo padrão das outras
  // seções, evita um "pulo" grande assim que o ResizeObserver reporta.
  const fittable = containerWidth > 0 ? Math.max(1, Math.floor((containerWidth + CARD_ROW_GAP) / perCardWidth)) : 4;
  const visibleNotes = notes.slice(0, fittable);

  return (
    <div
      ref={containerRef}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.max(visibleNotes.length, 1)}, ${CARD_ROW_MIN_WIDTH}px)`,
        gap: `${CARD_ROW_GAP}px`,
      }}
    >
      {visibleNotes.map((note) => (
        <NoteCard
          key={note.filename}
          note={note}
          metaOverride={getMeta?.(note)}
          onClick={() => onOpenNote(note.filename)}
          onRename={() => onRenameNote(note.filename)}
          onDelete={() => onDeleteNote(note.filename)}
          isFavorite={note.isFavorite}
          onToggleFavorite={() => onToggleFavorite(note.filename)}
        />
      ))}
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
  onViewTagFocus,
  onViewStatus,
  onViewRecent,
  onViewFavorites,
  onToggleFavorite,
  onOpenNewNoteMenu,
  onFileDropped,
  onCreateBlank,
  onImportClick,
  onImportWebClick,
  creatingBlankNote,
}: Props) {
  const [dragActive, setDragActive] = useState(false);

  // Agrupado por MACRO-tema (primeiro segmento antes do "."), não por tag
  // exata — "história", "história.antiga" e "história.pré-história" viram
  // uma seção só ("história"), somando as notas dos subtemas junto. Uma nota
  // só conta uma vez por macro-tema mesmo se tiver mais de uma tag sob o
  // mesmo macro (Set por nota); se tiver tags em macro-temas diferentes,
  // aparece em cada seção correspondente — mesmo espírito de antes pra tags
  // distintas. Detalhe por subtema fica na página de foco (TagFocusPage),
  // acessível só clicando no nome da seção.
  const macroTagMap = new Map<string, LibraryNote[]>();
  for (const note of notes) {
    const macros = new Set(note.tags.map((t) => t.split(".")[0]));
    for (const macro of macros) {
      const list = macroTagMap.get(macro) ?? [];
      list.push(note);
      macroTagMap.set(macro, list);
    }
  }
  const sortedMacroTags = Array.from(macroTagMap.entries()).sort((a, b) => b[1].length - a[1].length);
  const untaggedNotes = notes.filter((n) => n.tags.length === 0);

  const statusCounts = new Map<string, number>();
  for (const note of notes) {
    statusCounts.set(note.status, (statusCounts.get(note.status) ?? 0) + 1);
  }

  // Mais recente primeiro. Cortado a um teto generoso antes de passar pro
  // CardRow — ele mesmo decide quantas cabem na largura disponível (nunca
  // mais que isso em tela, então o resto seria descartado de qualquer forma).
  const recentNotes = [...notes].sort((a, b) => b.lastActivityMs - a.lastActivityMs).slice(0, 12);
  const favoriteNotes = notes.filter((n) => n.isFavorite).sort((a, b) => b.lastActivityMs - a.lastActivityMs).slice(0, 12);

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
      <h1 style={{ ...serifStyle, fontSize: "2.4em", margin: 0 }}>Sua biblioteca</h1>
      <p style={{ color: "var(--text-muted)", marginTop: "0.4rem" }}>
        {notes.length} {notes.length === 1 ? "nota" : "notas"} em {sortedMacroTags.length}{" "}
        {sortedMacroTags.length === 1 ? "tema" : "temas"}
      </p>

      <section style={sectionDividerStyle}>
        <h2 style={{ ...serifStyle, fontSize: "1.3em", margin: "0 0 1rem 0" }}>Progresso</h2>

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

      {/* Favoritos + Editados recentemente lado a lado (cada metade da
          largura) — sem Favoritos (nenhuma nota favoritada), a única coluna
          (Editados) ocupa a largura inteira sozinha via flex:1, sem CSS
          extra. Os dois títulos agora são clicáveis (mesmo tratamento visual
          âmbar do nome de tema, classe .tag-link em globals.css). */}
      {recentNotes.length > 0 && (
        <section style={sectionDividerStyle}>
          <div style={{ display: "flex", gap: "2rem" }}>
            {favoriteNotes.length > 0 && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2
                  className="tag-link"
                  onClick={onViewFavorites}
                  style={{ ...serifStyle, fontSize: "1.3em", margin: "0 0 1rem 0" }}
                >
                  Favoritos
                </h2>
                <CardRow
                  notes={favoriteNotes}
                  onOpenNote={onOpenNote}
                  onRenameNote={onRenameNote}
                  onDeleteNote={onDeleteNote}
                  onToggleFavorite={onToggleFavorite}
                />
              </div>
            )}
            {/* Divisória entre as duas colunas — só faz sentido com as duas
                presentes; sem Favoritos, Editados fica sozinho, sem linha
                sobrando do lado. Mesmo padrão visual do divisor entre painéis
                no modo Dividir Tela (page.tsx). */}
            {favoriteNotes.length > 0 && <div style={{ width: "1px", flexShrink: 0, background: "var(--panel-border)" }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2
                className="tag-link"
                onClick={onViewRecent}
                style={{ ...serifStyle, fontSize: "1.3em", margin: "0 0 1rem 0" }}
              >
                Editados recentemente
              </h2>
              <CardRow
                notes={recentNotes}
                getMeta={(note) => formatRelativeTime(note.lastActivityMs)}
                onOpenNote={onOpenNote}
                onRenameNote={onRenameNote}
                onDeleteNote={onDeleteNote}
                onToggleFavorite={onToggleFavorite}
              />
            </div>
          </div>
        </section>
      )}

      {sortedMacroTags.map(([macro, macroNotes]) => (
        <section key={macro} style={sectionDividerStyle}>
          <h2 style={{ ...serifStyle, fontSize: "1.3em", margin: "0 0 1rem 0" }}>
            {/* Só o nome do tema é clicável (vai pra página de foco) — os
                cards de nota abaixo continuam abrindo a nota normalmente. */}
            <span
              className="tag-link"
              onClick={() => onViewTagFocus(macro)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") onViewTagFocus(macro);
              }}
            >
              {formatTagLabel(macro)}
            </span>{" "}
            <span style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "0.6em", color: "var(--text-muted)" }}>
              ({macroNotes.length} {macroNotes.length === 1 ? "nota" : "notas"})
            </span>
          </h2>
          <SectionGrid
            notes={macroNotes}
            onOpenNote={onOpenNote}
            onRenameNote={onRenameNote}
            onDeleteNote={onDeleteNote}
            onViewMore={() => onViewTagFocus(macro)}
            onToggleFavorite={onToggleFavorite}
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
          onToggleFavorite={onToggleFavorite}
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
