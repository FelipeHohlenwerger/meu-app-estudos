"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useVault } from "@/lib/vaultContext";

// Valor conservador considerando o limite de contexto do Gemini e deixando
// margem pro histórico de mensagens trocadas na sessão (o orçamento é
// compartilhado) — estimativa grosseira de ~4 caracteres por token.
const MAX_CONTEXT_CHARS = 300_000;

type ChatRole = "user" | "model";
type Message = { role: ChatRole; text: string };

type LimitWarning = {
  canUseChapter: boolean;
  canUseOwnOnly: boolean;
  pendingMessage: string;
  pendingMessagesSoFar: Message[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  filename: string;
  noteTitle: string;
  // Implementado diferente por NotePanel.tsx conforme o tipo: .md devolve o
  // texto já carregado, EPUB extrai o livro inteiro (EpubViewerHandle.getFullText).
  getOwnContent: () => Promise<string>;
  // Só passado quando a nota é um EPUB — usado como alternativa mais leve
  // quando o livro inteiro excede o limite de contexto (ver MAX_CONTEXT_CHARS).
  getCurrentChapterContent?: () => Promise<string>;
  onLibraryChanged?: () => void;
};

function formatDateIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildTranscript(messages: Message[]): string {
  return messages.map((m) => `**${m.role === "user" ? "Você" : "IA"}:** ${m.text}`).join("\n\n");
}

export default function ChatPanel({
  open,
  onClose,
  filename,
  noteTitle,
  getOwnContent,
  getCurrentChapterContent,
  onLibraryChanged,
}: Props) {
  const { vaultFetch } = useVault();
  const [scope, setScope] = useState<"esta" | "relacionadas">("esta");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [limitWarning, setLimitWarning] = useState<LimitWarning | null>(null);
  const [chatFilename, setChatFilename] = useState<string | null>(null);

  const ownContentCacheRef = useRef<string | null>(null);
  const useChapterOnlyRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Cada abertura do painel é sempre uma sessão nova — nunca retoma uma
  // conversa anterior (pedido explícito do usuário), mesmo reabrindo na
  // mesma nota. Estado ajustado DURANTE o render (padrão recomendado pelo
  // React pra "resetar estado quando uma prop muda", evita o round-trip
  // extra de um efeito só pra isso) — refs (que não afetam o que é
  // renderizado) são resetadas à parte, num efeito próprio logo abaixo.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setScope("esta");
      setMessages([]);
      setInput("");
      setErrorMsg(null);
      setLimitWarning(null);
      setChatFilename(null);
    }
  }

  useEffect(() => {
    if (open) {
      ownContentCacheRef.current = null;
      useChapterOnlyRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, limitWarning, sending]);

  async function getOwnContentCached(): Promise<string> {
    if (ownContentCacheRef.current !== null) return ownContentCacheRef.current;
    const text =
      useChapterOnlyRef.current && getCurrentChapterContent
        ? await getCurrentChapterContent()
        : await getOwnContent();
    ownContentCacheRef.current = text;
    return text;
  }

  async function buildContext(scopeToUse: "esta" | "relacionadas"): Promise<{ text: string; ownLength: number }> {
    const own = await getOwnContentCached();
    if (scopeToUse === "esta") return { text: own, ownLength: own.length };

    const res = await vaultFetch(`/api/note/related?filename=${encodeURIComponent(filename)}`);
    const data = await res.json();
    const relatedTexts = ((data.related ?? []) as { filename: string; content: string | null }[])
      .filter((r) => r.content)
      .map((r) => `--- ${r.filename} ---\n${r.content}`)
      .join("\n\n");
    const text = relatedTexts ? `${own}\n\n${relatedTexts}` : own;
    return { text, ownLength: own.length };
  }

  async function persistChatNote(allMessages: Message[]) {
    const content = `[[${noteTitle}]]\n\n${buildTranscript(allMessages)}`;
    try {
      if (!chatFilename) {
        const title = `Chat - ${noteTitle} - ${formatDateIso(new Date())}`;
        const createRes = await vaultFetch("/api/note/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        const createData = await createRes.json();
        const newFilename: string | undefined = createData.filename;
        if (!newFilename) return;
        await vaultFetch("/api/note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: newFilename, content }),
        });
        await vaultFetch("/api/note/tags", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: newFilename, tags: ["chat"] }),
        });
        setChatFilename(newFilename);
        onLibraryChanged?.();
      } else {
        await vaultFetch("/api/note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: chatFilename, content }),
        });
      }
    } catch {
      // Falha ao salvar a nota de chat não deve quebrar a conversa em si —
      // a próxima troca tenta salvar de novo (POST reescreve o conteúdo
      // inteiro, então nada fica inconsistente).
    }
  }

  async function attemptSend(messagesSoFar: Message[], userText: string, scopeToUse: "esta" | "relacionadas") {
    setSending(true);
    setErrorMsg(null);
    try {
      const isFirst = messagesSoFar.length === 1;
      let contextText = "";
      if (isFirst) {
        const built = await buildContext(scopeToUse);
        if (built.text.length > MAX_CONTEXT_CHARS) {
          setLimitWarning({
            canUseChapter: !!getCurrentChapterContent && !useChapterOnlyRef.current,
            canUseOwnOnly: scopeToUse === "relacionadas" && built.ownLength <= MAX_CONTEXT_CHARS,
            pendingMessage: userText,
            pendingMessagesSoFar: messagesSoFar,
          });
          setSending(false);
          return;
        }
        contextText = built.text;
      } else {
        contextText = (await buildContext(scopeToUse)).text;
      }

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contextText, history: messagesSoFar.slice(0, -1), message: userText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Não foi possível obter resposta da IA");

      const finalMessages: Message[] = [...messagesSoFar, { role: "model", text: data.result }];
      setMessages(finalMessages);
      await persistChatNote(finalMessages);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro ao conversar com a IA");
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setErrorMsg(null);
    setLimitWarning(null);
    const newMessages = [...messages, { role: "user" as const, text }];
    setMessages(newMessages);
    await attemptSend(newMessages, text, scope);
  }

  async function handleUseChapterOnly() {
    if (!limitWarning) return;
    useChapterOnlyRef.current = true;
    ownContentCacheRef.current = null;
    const { pendingMessage, pendingMessagesSoFar } = limitWarning;
    setLimitWarning(null);
    await attemptSend(pendingMessagesSoFar, pendingMessage, scope);
  }

  async function handleUseOwnOnly() {
    if (!limitWarning) return;
    const { pendingMessage, pendingMessagesSoFar } = limitWarning;
    setScope("esta");
    setLimitWarning(null);
    await attemptSend(pendingMessagesSoFar, pendingMessage, "esta");
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
            <h2 style={{ fontSize: "1.1rem" }}>Chat</h2>
            <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "1.2rem" }}>
              ×
            </button>
          </div>

          <div style={{ display: "flex", gap: "0.4rem", padding: "0 1rem 0.75rem", flexShrink: 0 }}>
            <button
              onClick={() => setScope("esta")}
              style={{
                padding: "0.25rem 0.5rem",
                fontSize: "12px",
                fontWeight: scope === "esta" ? "bold" : "normal",
                background: scope === "esta" ? "var(--panel-hover)" : "transparent",
                border: "1px solid var(--panel-border)",
                borderRadius: "4px",
                color: "var(--foreground)",
                cursor: "pointer",
              }}
            >
              Esta nota
            </button>
            <button
              onClick={() => setScope("relacionadas")}
              style={{
                padding: "0.25rem 0.5rem",
                fontSize: "12px",
                fontWeight: scope === "relacionadas" ? "bold" : "normal",
                background: scope === "relacionadas" ? "var(--panel-hover)" : "transparent",
                border: "1px solid var(--panel-border)",
                borderRadius: "4px",
                color: "var(--foreground)",
                cursor: "pointer",
              }}
            >
              + Relacionadas
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {messages.length === 0 && !limitWarning && (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Pergunte alguma coisa sobre esta nota{scope === "relacionadas" ? " e as relacionadas" : ""}.
              </p>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "0.5rem 0.7rem",
                    borderRadius: "10px",
                    background: m.role === "user" ? "var(--panel-hover)" : "var(--panel-bg)",
                    color: "var(--foreground)",
                    border: m.role === "user" ? "none" : "1px solid var(--panel-border)",
                    fontSize: "0.85rem",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {sending && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div
                  style={{
                    padding: "0.5rem 0.7rem",
                    borderRadius: "10px",
                    background: "var(--panel-bg)",
                    border: "1px solid var(--panel-border)",
                    fontSize: "0.85rem",
                    color: "var(--text-muted)",
                  }}
                >
                  Pensando...
                </div>
              </div>
            )}

            {errorMsg && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div
                  style={{
                    padding: "0.5rem 0.7rem",
                    borderRadius: "10px",
                    border: "1px solid #d04444",
                    color: "#d04444",
                    fontSize: "0.8rem",
                  }}
                >
                  {errorMsg}
                </div>
              </div>
            )}

            {limitWarning && (
              <div
                style={{
                  padding: "0.6rem 0.7rem",
                  borderRadius: "10px",
                  border: "1px solid #d4af00",
                  fontSize: "0.8rem",
                }}
              >
                <p style={{ marginBottom: "0.5rem" }}>
                  O conteúdo pra essa conversa é grande demais pra mandar de uma vez pra IA.
                </p>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {limitWarning.canUseChapter && (
                    <button onClick={handleUseChapterOnly} style={limitButtonStyle}>
                      Usar apenas o capítulo atual
                    </button>
                  )}
                  {limitWarning.canUseOwnOnly && (
                    <button onClick={handleUseOwnOnly} style={limitButtonStyle}>
                      Usar só esta nota, sem as relacionadas
                    </button>
                  )}
                  <button onClick={onClose} style={limitButtonStyle}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div style={{ display: "flex", gap: "0.4rem", padding: "0.75rem 1rem 1rem", borderTop: "1px solid var(--panel-border)", flexShrink: 0 }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Pergunte algo..."
              rows={2}
              disabled={sending}
              style={{
                flex: 1,
                resize: "none",
                padding: "0.5rem",
                borderRadius: "6px",
                border: "1px solid var(--panel-border)",
                background: "var(--background)",
                color: "var(--foreground)",
                fontSize: "0.85rem",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              style={{
                padding: "0.5rem 0.8rem",
                borderRadius: "6px",
                border: "1px solid var(--panel-border)",
                background: sending || !input.trim() ? "transparent" : "var(--panel-hover)",
                color: "var(--foreground)",
                cursor: sending || !input.trim() ? "default" : "pointer",
                fontSize: "0.85rem",
              }}
            >
              Enviar
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

const limitButtonStyle: CSSProperties = {
  padding: "0.3rem 0.5rem",
  fontSize: "12px",
  border: "1px solid var(--panel-border)",
  borderRadius: "4px",
  background: "transparent",
  color: "var(--foreground)",
  cursor: "pointer",
};
