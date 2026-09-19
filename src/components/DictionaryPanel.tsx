"use client";

import type { DictionaryEntry } from "@/lib/dictionary";

type Props = {
  open: boolean;
  onClose: () => void;
  status: "loading" | "done" | "error" | null;
  entry?: DictionaryEntry;
  message?: string;
  // Clicar num chip de sinônimo consulta AQUELE sinônimo — NotePanel.tsx (ou
  // o viewer correspondente) é quem decide como buscar; este componente só
  // repassa qual palavra foi clicada, mesmo espírito de TranslatePanel.tsx
  // (painel só apresenta, quem chama decide QUANDO/O QUE buscar).
  onSelectSynonym?: (word: string) => void;
};

// Painel lateral (mesmo padrão visual/estrutural de TranslatePanel.tsx, só
// com um corpo mais rico: palavra + classe gramatical/idioma, definição em
// destaque, sinônimos clicáveis e exemplo de uso) que acompanha a seleção de
// texto enquanto aberto.
export default function DictionaryPanel({ open, onClose, status, entry, message, onSelectSynonym }: Props) {
  return (
    <aside
      style={{
        width: open ? "320px" : "0px",
        borderLeft: open ? "1px solid var(--panel-border)" : "none",
        overflow: "hidden",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        transition: "width 0.22s ease",
      }}
    >
      {open && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "1rem 1rem 0.5rem",
              flexShrink: 0,
            }}
          >
            <h2 style={{ fontSize: "1.1rem" }}>Dicionário</h2>
            <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "1.2rem" }}>
              ×
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 1rem 1rem", fontSize: "0.85rem" }}>
            {status === null && (
              <p style={{ color: "var(--text-muted)" }}>Selecione uma palavra e clique em Dicionário.</p>
            )}
            {status === "loading" && <p style={{ color: "var(--text-muted)" }}>Consultando...</p>}
            {status === "error" && (
              <div
                style={{
                  padding: "0.6rem 0.7rem",
                  borderRadius: "6px",
                  border: "1px solid var(--danger, #c0392b)",
                  background: "var(--panel-hover)",
                  color: "var(--danger, #c0392b)",
                  lineHeight: 1.4,
                }}
              >
                {message ?? "Erro ao consultar o dicionário"}
              </div>
            )}
            {status === "done" && entry && (
              <>
                <div style={{ fontSize: "20px", fontWeight: "bold", color: "var(--foreground)" }}>{entry.word}</div>
                {(entry.partOfSpeech || entry.language || entry.phonetic) && (
                  <div style={{ fontSize: "0.75rem", fontStyle: "italic", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                    {[entry.phonetic, entry.partOfSpeech, entry.language].filter(Boolean).join(" · ")}
                  </div>
                )}

                <div style={{ fontSize: "14px", lineHeight: 1.5, color: "var(--foreground)", marginTop: "0.75rem" }}>
                  {entry.definition}
                </div>

                <div style={{ borderTop: "1px solid var(--panel-border)", margin: "0.85rem 0" }} />

                {entry.synonyms.length > 0 && (
                  <div style={{ marginBottom: "0.85rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>Sinônimos</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                      {entry.synonyms.map((syn) => (
                        <button
                          key={syn}
                          onClick={() => onSelectSynonym?.(syn)}
                          style={{
                            background: "var(--panel-hover)",
                            border: "1px solid var(--panel-border)",
                            borderRadius: "999px",
                            padding: "0.15rem 0.6rem",
                            fontSize: "0.8rem",
                            color: "var(--foreground)",
                            cursor: onSelectSynonym ? "pointer" : "default",
                          }}
                        >
                          {syn}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {entry.example && (
                  <div style={{ marginBottom: "0.5rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>Exemplo</div>
                    <div
                      style={{
                        fontStyle: "italic",
                        borderLeft: "2px solid var(--panel-border)",
                        paddingLeft: "0.6rem",
                        color: "var(--foreground)",
                        lineHeight: 1.4,
                      }}
                    >
                      {entry.example}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.75rem" }}>
                  via {entry.source === "free-dictionary" ? "Free Dictionary" : "Gemini"}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
