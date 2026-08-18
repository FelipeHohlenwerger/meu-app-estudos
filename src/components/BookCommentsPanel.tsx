"use client";

import { useEffect, useRef, useState } from "react";
import CalloutSlashMenu from "@/components/CalloutSlashMenu";
import CommentModal from "@/components/CommentModal";
import { calloutIcons } from "@/lib/livePreview";
import { calloutColors } from "@/lib/colors";
import { useVault } from "@/lib/vaultContext";

type BookComment = {
  id: number;
  tipo: string;
  comment: string;
  // Só preenchidos pra comentários ancorados "auto-contidos" de EPUB
  // (gerados pelas ações de IA) — ver vaultIndex.ts (migração v10).
  anchorCfi?: string | null;
  anchorText?: string | null;
};

// Comentário ancorado a um trecho de texto da própria nota .md — o conteúdo
// (tipo/texto/comentário) vem do PRÓPRIO TEXTO (fonte da verdade), não do
// banco; o banco só guarda um id (pra ordenar junto com os gerais, por
// AUTOINCREMENT) e permite apagar. Ver NotePanel.tsx.
export type AnchoredComment = { id: number; tipo: string; texto: string; comentario: string };

type Props = {
  filename: string;
  // Só passado quando o "livro" é do Calibre (não do vault) — troca as 3
  // chamadas (GET/POST/DELETE) pras rotas /api/calibre/book-comments em vez
  // de /api/book-comments, chaveadas por calibreId em vez de filename.
  calibreId?: number;
  // Abaixo do breakpoint (ver useIsMobile.ts) — troca a coluna lateral
  // animada por width por uma folha fixa que sobe de baixo pra cima.
  isMobile?: boolean;
  open: boolean;
  onClose: () => void;
  // Só passado por notas .md — PDF/EPUB não tem texto pra ancorar comentário.
  anchoredComments?: AnchoredComment[];
  onGoToAnchor?: (id: number) => void;
  // Comentários ancorados "auto-contidos" de EPUB (com anchorCfi próprio,
  // vindos direto do fetch, não da prop anchoredComments) usam este callback
  // em vez de onGoToAnchor — NotePanel.tsx roteia pro EpubViewer atual.
  onGoToEpubAnchor?: (cfi: string) => void;
  onDeleteAnchored?: (id: number) => void;
  // Único jeito de editar o texto/tipo de um comentário ancorado, já que a
  // sintaxe nunca mais fica visível no editor pra ser tocada diretamente.
  onEditAnchored?: (id: number) => void;
  // Id do comentário pra rolar até e destacar automaticamente quando o painel
  // abre a partir do marcador clicado no texto (ver CommentMarkerWidget).
  scrollToId?: number | null;
  // Muda (incrementa) quando o botão flutuante do visualizador (NotePanel.tsx)
  // é clicado — abre o composer de comentário geral direto, sem precisar de
  // um segundo clique em "+ Novo comentário". O valor em si não importa, só
  // a MUDANÇA (por isso o guard no efeito com um ref pro valor anterior, não
  // "!== 0").
  autoComposeTrigger?: number;
  // Muda (incrementa) quando o usuário clica/aperta uma tecla dentro do
  // conteúdo do EPUB (ver EpubViewer.onContentInteraction) — um clique ali
  // nunca chega no document externo sozinho (isolamento de iframe), então é
  // assim que o menu de tipo de comentário (síntese/importante/...) fecha ao
  // "clicar fora" quando o "fora" é em cima do próprio livro. Mesma lógica de
  // mudança-de-valor do autoComposeTrigger acima, não o valor em si.
  closePickerTrigger?: number;
};

function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TipoIcon({ tipo }: { tipo: string }) {
  const color = calloutColors[tipo] ?? "#888";
  const icon = calloutIcons[tipo] ?? "";
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: icon }}
    />
  );
}

type MergedItem =
  | { kind: "anchored"; id: number; tipo: string; texto: string; comentario: string }
  | { kind: "general"; id: number; tipo: string; comment: string; anchorCfi?: string | null; anchorText?: string | null };

// Painel único de comentários — usado tanto pelos comentários gerais de
// PDF/EPUB (não ancorados a nenhum trecho) quanto, agora, pelos comentários
// (ancorados + gerais) das notas .md, unificados numa lista só, em ordem de
// criação (mais antigo no topo — o `id` de ambos os tipos vem da MESMA
// sequência AUTOINCREMENT da tabela book_comments, então ordenar por id
// reflete a ordem real de criação mesmo misturando os dois tipos).
export default function BookCommentsPanel({
  filename,
  calibreId,
  isMobile,
  open,
  onClose,
  anchoredComments,
  onGoToAnchor,
  onGoToEpubAnchor,
  onDeleteAnchored,
  onEditAnchored,
  scrollToId,
  autoComposeTrigger,
  closePickerTrigger,
}: Props) {
  const { vaultFetch } = useVault();
  const [comments, setComments] = useState<BookComment[]>([]);
  const [pickerAnchor, setPickerAnchor] = useState<{ x: number; y: number } | null>(null);
  const [pendingTipo, setPendingTipo] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const newCommentButtonRef = useRef<HTMLButtonElement>(null);

  // Aciona o MESMO fluxo do "+ Novo comentário" (clique real no botão, não
  // reimplementado aqui) quando o botão flutuante do visualizador dispara
  // `autoComposeTrigger` — só reage à mudança de valor (guarda o anterior
  // via ref), nunca no primeiro render, e só quando o painel já está aberto
  // (o botão só existe no DOM dentro de `{open && (...)}`, ver abaixo).
  //
  // O clique é adiado até a transição CSS de abrir o painel terminar (width
  // no desktop, bottom no mobile — as duas com 0.22s, ver o <aside> abaixo).
  // Sem o atraso, o clique síncrono acontece com o painel ainda animando
  // (largura/posição intermediária), e getBoundingClientRect() do botão
  // (usado pra ancorar o CalloutSlashMenu, ver "+ Novo comentário" abaixo)
  // captura essa posição transitória — o menu de tipo abre fora da
  // viewport, clicável só na aparência (bug real, achado testando esse
  // fluxo: o menu parecia "não fechar" porque o clique num tipo nunca
  // acertava o botão de verdade).
  const prevTriggerRef = useRef(autoComposeTrigger);
  useEffect(() => {
    if (open && autoComposeTrigger !== undefined && autoComposeTrigger !== prevTriggerRef.current) {
      const timeout = setTimeout(() => newCommentButtonRef.current?.click(), 260);
      prevTriggerRef.current = autoComposeTrigger;
      return () => clearTimeout(timeout);
    }
    prevTriggerRef.current = autoComposeTrigger;
  }, [open, autoComposeTrigger]);

  // Fecha o menu de tipo (síntese/importante/...) quando o "clicar fora"
  // aconteceu em cima do conteúdo do EPUB — ver comentário no tipo
  // `closePickerTrigger` acima. Só o pickerAnchor (a lista de tipos); NÃO
  // fecha o CommentModal (pendingTipo) se já estiver escrevendo o texto, pra
  // não perder um comentário em andamento por um clique sem querer.
  const prevCloseTriggerRef = useRef(closePickerTrigger);
  useEffect(() => {
    if (closePickerTrigger !== undefined && closePickerTrigger !== prevCloseTriggerRef.current) {
      setPickerAnchor(null);
    }
    prevCloseTriggerRef.current = closePickerTrigger;
  }, [closePickerTrigger]);

  useEffect(() => {
    const request =
      calibreId !== undefined
        ? fetch(`/api/calibre/book-comments?calibreId=${calibreId}`)
        : vaultFetch(`/api/book-comments?filename=${encodeURIComponent(filename)}`);
    request
      .then((res) => res.json())
      .then((data) =>
        // Placeholders ancorados de .md (anchored=1, sem anchorCfi) ficam de
        // fora — conteúdo real vem da prop anchoredComments. Ancorados
        // "auto-contidos" de EPUB (anchored=1, COM anchorCfi) entram
        // normalmente aqui, já que carregam tipo/comment reais.
        setComments((data.comments ?? []).filter((c: BookComment & { anchored?: boolean }) => !c.anchored || c.anchorCfi))
      );
  }, [filename, calibreId, vaultFetch]);

  useEffect(() => {
    if (!open || scrollToId == null) return;
    const el = cardRefs.current.get(scrollToId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(scrollToId);
    const timeout = setTimeout(() => setHighlightedId(null), 1600);
    return () => clearTimeout(timeout);
  }, [open, scrollToId]);

  async function handleConfirmComment(texto: string) {
    const tipo = pendingTipo;
    setPendingTipo(null);
    if (!tipo) return;
    const res =
      calibreId !== undefined
        ? await fetch("/api/calibre/book-comments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ calibreId, tipo, comment: texto }),
          })
        : await vaultFetch("/api/book-comments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, tipo, comment: texto }),
          });
    const data = await res.json();
    if (data.comment) setComments((prev) => [...prev, data.comment]);
  }

  async function handleDelete(id: number) {
    if (calibreId !== undefined) await fetch(`/api/calibre/book-comments/${id}`, { method: "DELETE" });
    else await vaultFetch(`/api/book-comments/${id}`, { method: "DELETE" });
    setComments((prev) => prev.filter((c) => c.id !== id));
  }

  const merged: MergedItem[] = [
    ...comments.map((c) => ({
      kind: "general" as const,
      id: c.id,
      tipo: c.tipo,
      comment: c.comment,
      anchorCfi: c.anchorCfi,
      anchorText: c.anchorText,
    })),
    ...(anchoredComments ?? []).map((c) => ({
      kind: "anchored" as const,
      id: c.id,
      tipo: c.tipo,
      texto: c.texto,
      comentario: c.comentario,
    })),
  ].sort((a, b) => a.id - b.id);

  return (
    <>
      {/* Backdrop só no mobile — no desktop a coluna lateral não cobre o
          editor, então não faz sentido escurecer o resto da tela. */}
      {isMobile && open && (
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1499 }}
        />
      )}
      <aside
        style={
          isMobile
            ? {
                position: "fixed",
                left: 0,
                right: 0,
                bottom: open ? 0 : "-100%",
                maxHeight: "70vh",
                background: "var(--panel-bg)",
                borderTop: "1px solid var(--panel-border)",
                borderTopLeftRadius: "12px",
                borderTopRightRadius: "12px",
                padding: "1rem",
                overflow: "hidden",
                overflowY: "auto",
                zIndex: 1500,
                transition: "bottom 0.22s ease",
              }
            : {
                width: open ? "280px" : "0px",
                borderLeft: open ? "1px solid var(--panel-border)" : "none",
                padding: open ? "1rem" : "0",
                overflow: "hidden",
                overflowY: open ? "auto" : "hidden",
                flexShrink: 0,
                transition: "width 0.22s ease, padding 0.22s ease",
              }
        }
      >
      {open && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>Comentários</h2>
            <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "1.2rem" }}>
              ×
            </button>
          </div>

          <button
            ref={newCommentButtonRef}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setPickerAnchor({ x: rect.left, y: rect.bottom + 6 });
            }}
            style={{
              width: "100%",
              padding: "0.5rem",
              marginBottom: "1rem",
              border: "1px solid var(--panel-border)",
              borderRadius: "6px",
              background: "transparent",
              color: "var(--foreground)",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            + Novo comentário
          </button>

          {merged.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Nenhum comentário ainda.</p>
          ) : (
            merged.map((item) => {
              const tipo = item.tipo;
              const texto = item.kind === "anchored" ? item.comentario : item.comment;
              const anchorSnippet = item.kind === "anchored" ? item.texto : item.anchorText ?? null;
              const isEpubAnchor = item.kind === "general" && !!item.anchorCfi;
              return (
                <div
                  key={`${item.kind}-${item.id}`}
                  ref={(el) => {
                    if (el) cardRefs.current.set(item.id, el);
                    else cardRefs.current.delete(item.id);
                  }}
                  style={{
                    marginBottom: "0.6rem",
                    padding: "0.5rem 0.7rem",
                    borderRadius: "6px",
                    borderLeft: `4px solid ${calloutColors[tipo] ?? "#888"}`,
                    background: "var(--panel-bg)",
                    fontSize: "0.85rem",
                    boxShadow: highlightedId === item.id ? "0 0 0 2px var(--accent)" : "none",
                    transition: "box-shadow 0.2s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: "bold", color: "var(--text-muted)" }}>
                      <TipoIcon tipo={tipo} />
                      {tipo}
                    </span>
                    <div style={{ display: "flex", gap: "0.2rem", alignItems: "center" }}>
                      {item.kind === "anchored" && (
                        <button
                          onClick={() => onEditAnchored?.(item.id)}
                          title="Editar comentário"
                          style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", padding: "2px" }}
                        >
                          <EditIcon />
                        </button>
                      )}
                      <button
                        onClick={() => (item.kind === "anchored" ? onDeleteAnchored?.(item.id) : handleDelete(item.id))}
                        title="Remover comentário"
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", fontSize: "1rem" }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {anchorSnippet && (
                    <div style={{ opacity: 0.75, marginBottom: "0.3rem", fontStyle: "italic" }}>&ldquo;{anchorSnippet}&rdquo;</div>
                  )}
                  <div>{texto}</div>
                  {(item.kind === "anchored" || isEpubAnchor) && (
                    <button
                      onClick={() =>
                        item.kind === "anchored" ? onGoToAnchor?.(item.id) : onGoToEpubAnchor?.(item.anchorCfi!)
                      }
                      style={{
                        marginTop: "0.4rem",
                        padding: "0.2rem 0.5rem",
                        border: "1px solid var(--panel-border)",
                        borderRadius: "4px",
                        background: "transparent",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                      }}
                    >
                      Ir para o trecho
                    </button>
                  )}
                </div>
              );
            })
          )}
        </>
      )}

      {pickerAnchor && (
        <CalloutSlashMenu
          x={pickerAnchor.x}
          y={pickerAnchor.y}
          // "ia" fica de fora do picker manual — só é criado pelas ações de
          // IA (ver aiActions.ts), nunca escolhido à mão.
          entries={Object.entries(calloutColors).filter(([tipo]) => tipo !== "ia")}
          selectedIndex={-1}
          onSelect={(tipo) => {
            setPickerAnchor(null);
            setPendingTipo(tipo);
          }}
          onClose={() => setPickerAnchor(null)}
        />
      )}

      {pendingTipo && (
        <CommentModal tipo={pendingTipo} onConfirm={handleConfirmComment} onCancel={() => setPendingTipo(null)} />
      )}
      </aside>
    </>
  );
}
