"use client";

type Props = {
  open: boolean;
  onClose: () => void;
  status: "loading" | "done" | "error" | null;
  translatedText?: string;
  detectedSourceLanguage?: string;
  message?: string;
};

// Painel lateral (mesmo padrão visual de ChatPanel.tsx) que acompanha a
// seleção de texto enquanto aberto — NotePanel.tsx é quem decide QUANDO
// buscar uma tradução nova (clique em "Traduzir" ou seleção nova com o
// painel já aberto); este componente só apresenta o resultado.
export default function TranslatePanel({ open, onClose, status, translatedText, detectedSourceLanguage, message }: Props) {
  let idiomaLabel: string | undefined;
  if (detectedSourceLanguage) {
    try {
      idiomaLabel = new Intl.DisplayNames(["pt"], { type: "language" }).of(detectedSourceLanguage);
    } catch {
      idiomaLabel = detectedSourceLanguage;
    }
  }

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
            <h2 style={{ fontSize: "1.1rem" }}>Tradução</h2>
            <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "1.2rem" }}>
              ×
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 1rem 1rem", fontSize: "0.85rem" }}>
            {status === null && (
              <p style={{ color: "var(--text-muted)" }}>Selecione um trecho e clique em Traduzir.</p>
            )}
            {status === "loading" && <p style={{ color: "var(--text-muted)" }}>Traduzindo...</p>}
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
                {message ?? "Erro ao traduzir"}
              </div>
            )}
            {status === "done" && (
              <>
                {idiomaLabel && (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
                    Traduzido do {idiomaLabel}
                  </div>
                )}
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{translatedText}</div>
              </>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
