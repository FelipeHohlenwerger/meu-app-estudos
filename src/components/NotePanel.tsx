"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { GFM } from "@lezer/markdown";
import { EditorView, keymap } from "@codemirror/view";
import { EditorSelection, Prec } from "@codemirror/state";
import {
  livePreviewPlugin,
  setActiveCommentEffect,
  activeCommentField,
  slashMenuField,
  createCalloutSlashKeymap,
  linkTargetsField,
  setLinkTargetsEffect,
  wikiLinkMenuField,
  createWikiLinkKeymap,
  type LinkTargetsMap,
  blockRefsField,
  setBlockRefsEffect,
  blockRefKey,
  type BlockRefInfo,
  setSelectedImageEffect,
  selectedImageField,
  codeBlockDecorationsField,
  listIndentKeymap,
  videoTimestampClickHandler,
} from "@/lib/livePreview";
import HighlightMenu from "@/components/HighlightMenu";
import CommentModal from "@/components/CommentModal";
import CalloutSlashMenu from "@/components/CalloutSlashMenu";
import WikiLinkMenu from "@/components/WikiLinkMenu";
import FootnotePopup from "@/components/FootnotePopup";
import ImageControlPanel from "@/components/ImageControlPanel";
import FontSizePopup from "@/components/FontSizePopup";
import CoverMenu from "@/components/CoverMenu";
import TagField, { TagChips } from "@/components/TagField";
import { StarIcon } from "@/components/NoteCard";
import PdfNativeViewer from "@/components/PdfNativeViewer";
import EpubViewer, { type EpubViewerHandle } from "@/components/EpubViewer";
import BookCommentsPanel from "@/components/BookCommentsPanel";
import LinkBookModal from "@/components/LinkBookModal";
import ChatPanel from "@/components/ChatPanel";
import AiStatusBadge from "@/components/AiStatusBadge";
import TranslatePanel from "@/components/TranslatePanel";
import { extractBlockRefs, findBlockMarkers } from "@/lib/wikiLinkSyntax";
import {
  buildImageSyntax,
  DEFAULT_IMAGE_SIZE,
  DEFAULT_IMAGE_SHAPE,
  DEFAULT_IMAGE_ALIGN,
  DEFAULT_IMAGE_WRAP,
  type ImageShape,
  type ImageAlign,
  type ImageWrap,
} from "@/lib/imageSyntax";
import { extractHighlightEntries, generateHighlightsPdf } from "@/lib/exportHighlights";
import { requestAiAction, type AiAction } from "@/lib/aiActions";
import { requestTranslation } from "@/lib/translate";
import { calloutColorsPalette } from "@/lib/colors";
import { uploadAndSetCover, removeCover } from "@/lib/coverActions";
import { useVault } from "@/lib/vaultContext";
import type { CalibreBook } from "@/lib/calibreLibrary";
import { calibrePseudoFilename } from "@/lib/calibreLink";
import { cssVarForFont, type NoteFontId } from "@/lib/fonts";

const customHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, textDecoration: "none", fontWeight: "normal" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  // O parser de markdown tageia parte de "[[nota]]" como tags.link (colchetes
  // aninhados) — isso gera um span ANINHADO dentro do <span class="wiki-link">
  // de livePreview.ts, cobrindo o texto visível por cima. Precisa da MESMA cor
  // (--link-color, ver globals.css), senão o texto do link fica com uma cor
  // diferente da que a classe "wiki-link" define (bug real, achado ao testar
  // a mudança pra --link-color: sem isso aqui, o texto continuava com a cor
  // antiga --accent por baixo).
  { tag: tags.link, color: "var(--link-color)" },
  { tag: tags.monospace, fontFamily: "monospace", color: "#ff6b6b" },
]);

const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    height: "auto",
  },
  // .cm-content herda a fonte de .cm-scroller (seu pai no DOM), não da div
  // externa do <CodeMirror> — o próprio tema-base do CodeMirror já fixa
  // ".cm-scroller { font-family: monospace }" (ver @codemirror/view), então
  // sem sobrescrever os dois a escolha de fonte do corpo (fontFamily no style
  // do <CodeMirror>, ver mais abaixo) nunca chegaria a valer de verdade.
  ".cm-scroller": {
    fontFamily: "inherit",
  },
  ".cm-content": {
    caretColor: "var(--foreground)",
    fontFamily: "inherit",
  },
  ".cm-line": {
    lineHeight: "1.6",
    textAlign: "justify",
  },
  ".cm-gutters": {
    backgroundColor: "var(--background)",
    color: "var(--text-muted)",
    border: "none",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  // O fundo VISÍVEL da seleção vem de .cm-selectionBackground (um div
  // desenhado pelo próprio CodeMirror atrás do texto, via drawSelection do
  // basicSetup) — mas esse mesmo drawSelection já registra sua PRÓPRIA
  // variante colorida (clara ou escura) presa a uma cadeia bem mais
  // específica (".cm-focused > .cm-scroller > .cm-selectionLayer
  // .cm-selectionBackground"), que vence a nossa regra de 1 classe só
  // mesmo sem "!important" — por isso a linha de baixo repete essa cadeia
  // exata. O ::selection nativo, por sua vez, é forçado a
  // "background: transparent !important" pelo basicSetup (então nosso
  // "backgroundColor" nele não faz efeito sozinho) — o que ELE realmente
  // contribui é o "color": destaques/comentários fixam sua própria cor de
  // texto (ex: #1a1a1a, pensada pra contrastar com o fundo colorido deles)
  // — sem forçar de volta pra --foreground durante a seleção, esse texto
  // fica ilegível (quase invisível) contra .cm-selectionBackground no tema
  // escuro.
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--panel-hover)",
    color: "var(--foreground)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    background: "var(--panel-hover) !important",
  },
  // O basicSetup (drawSelection) tem AINDA uma outra regra, também mais
  // específica que a nossa de cima, que reativa a seleção NATIVA do
  // navegador especificamente quando o editor está focado —
  // "background-color: Highlight !important" (a cor de sistema do
  // SO/navegador). Essa cor de sistema não muda com o tema claro/escuro do
  // app (não é uma variável nossa), então em muitos sistemas ela fica clara
  // demais contra o texto claro do tema escuro — mesmo problema de
  // contraste, só que também acontecendo com texto SEM nenhuma marcação.
  // Precisa de uma regra com a MESMA especificidade
  // (".cm-content :focus ::selection") pra realmente vencer.
  ".cm-content :focus::selection, .cm-content :focus ::selection": {
    backgroundColor: "var(--panel-hover) !important",
    color: "var(--foreground) !important",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--foreground)",
  },
});

function stripMdExtension(filename: string): string {
  return filename.replace(/\.(md|pdf|epub)$/i, "");
}

// Ícone de lápis (mesmo desenho do "Pencil" do Lucide, redesenhado à mão
// aqui — o projeto não depende do pacote lucide-react, todo ícone é um SVG
// local no mesmo estilo, ver FocusModeIcon logo abaixo) — usado no botão
// flutuante de novo comentário. Antes era o emoji "💬", que renderizava como
// um retângulo genérico em sistemas sem fonte de emoji instalada.
function PencilIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

// Mesmo desenho/espírito do FullscreenIcon de GraphView.tsx (setas pra fora
// vs pra dentro) — duplicado aqui (componente pequeno, sem props em comum
// suficientes pra valer a pena extrair um compartilhado) pro botão de modo
// foco do visualizador PDF/EPUB.
function FocusModeIcon({ active }: { active: boolean }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (active) {
    return (
      <svg {...common}>
        <path d="M9 3v4a2 2 0 0 1-2 2H3" />
        <path d="M21 9h-4a2 2 0 0 1-2-2V3" />
        <path d="M3 15h4a2 2 0 0 1 2 2v4" />
        <path d="M15 21v-4a2 2 0 0 1 2-2h4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

// Largura confortável de leitura, já validada pro corpo `.md` (coluna
// centralizada em vez da largura inteira do painel) — reaproveitada também
// pelo visualizador de PDF/EPUB (ver viewerKind), que antes não tinha
// nenhum limite de largura.
const READING_MAX_WIDTH = "760px";

function buildLinkTargetsMap(targets: { filename: string; title: string; aliases: string[] }[]): LinkTargetsMap {
  const map: LinkTargetsMap = new Map();
  for (const t of targets) {
    const key = t.filename.replace(/\.md$/i, "").toLowerCase();
    if (!map.has(key)) map.set(key, { filename: t.filename, title: t.title });
  }
  for (const t of targets) {
    const key = t.title.toLowerCase();
    if (!map.has(key)) map.set(key, { filename: t.filename, title: t.title });
  }
  for (const t of targets) {
    for (const alias of t.aliases) {
      const key = alias.toLowerCase();
      if (!map.has(key)) map.set(key, { filename: t.filename, title: t.title });
    }
  }
  return map;
}

export type NotePanelHandle = {
  // Grava imediatamente qualquer edição pendente (autosave ainda não disparado)
  // — usado pelo pai antes de renomear esta nota a partir da sidebar, pra não
  // perder edição nem gravar por cima com o nome errado.
  flushPendingSave: () => Promise<void>;
  // Cancela (sem gravar) o autosave pendente — usado pelo pai antes de apagar
  // esta nota a partir da sidebar.
  cancelPendingSave: () => void;
  // Foca e seleciona o campo de título — usado pelo pai logo depois de abrir
  // uma nota vinda de um "renomear" disparado por um card da Biblioteca.
  focusTitle: () => void;
};

type NotePanelProps = {
  filename: string | null;
  theme: "dark" | "light";
  // Abaixo do breakpoint (ver useIsMobile.ts em page.tsx) — controla o menu
  // "⋯" que recolhe os controles secundários e o modo bottom-sheet do painel
  // de comentários unificado (ver BookCommentsPanel).
  isMobile: boolean;
  fontSize: number;
  isFontSizeOverridden: boolean;
  noteFont: NoteFontId;
  isNoteFontOverridden: boolean;
  noteTargets: { filename: string; title: string; aliases: string[]; source?: "note" | "calibre" }[];
  allTags: string[];
  // Lista completa (já carregada em page.tsx) — usada pra resolver detalhes
  // de um livro do Calibre aberto neste painel (pseudo-filename
  // "calibre:<id>:<FORMAT>", ver isCalibreBook abaixo) sem precisar de uma
  // rota [id] própria, mesmo padrão "bulk fetch, filtra em memória" do resto
  // do app.
  calibreBooks: CalibreBook[];
  closable?: boolean;
  onClose?: () => void;
  onFocus: () => void;
  onFilenameChange: (next: string | null) => void;
  onLibraryChanged: () => void;
  onTagsChanged: (filename: string, tags: string[]) => void;
  onFavoriteChanged: (filename: string, isFavorite: boolean) => void;
  onFontSizeChange: (filename: string | null, size: number) => void;
  onToggleFontSizeOverride: (filename: string, checked: boolean, currentSize: number) => void;
  onNoteFontChange: (filename: string | null, font: NoteFontId) => void;
  onToggleNoteFontOverride: (filename: string, checked: boolean, currentFont: NoteFontId) => void;
  onCreateNoteFromLink: (title: string) => Promise<string | null>;
  // Modo foco de leitura (só faz sentido pra PDF/EPUB, ver viewerKind) — o
  // estado mora em page.tsx (precisa saber fechar a tela dividida ao entrar,
  // mesmo espírito de graphFullscreen); este painel só liga/desliga.
  focusMode?: boolean;
  onToggleFocusMode?: () => void;
};

// Botões da folha "Mais opções" do mobile (ver mobileToolsOpen) — mesmo
// estilo pra todos, empilhados e alinhados à esquerda (diferente da linha
// horizontal do desktop, ver o bloco logo acima na árvore de JSX).
const mobileToolSheetButtonStyle: CSSProperties = {
  textAlign: "left",
  background: "transparent",
  border: "none",
  borderRadius: "4px",
  color: "var(--foreground)",
  cursor: "pointer",
  padding: "0.6rem 0.4rem",
  fontSize: "0.9rem",
};

// Tudo que é "a nota atualmente aberta neste painel": título/tags/toolbar,
// troca CodeMirror ↔ PdfNativeViewer ↔ EpubViewer, backlinks/menções, coluna de
// bolhas de comentário, painel lateral de comentários (ancorado ou geral do
// livro) e os overlays flutuantes (HighlightMenu, CalloutSlashMenu,
// WikiLinkMenu, FootnotePopup, ImageControlPanel, FontSizePopup, CommentModal)
// — tudo local a ESTE painel, pra permitir duas instâncias independentes lado
// a lado (tela dividida).
const NotePanel = forwardRef<NotePanelHandle, NotePanelProps>(function NotePanel(
  {
    filename,
    theme,
    isMobile,
    fontSize,
    isFontSizeOverridden,
    noteFont,
    isNoteFontOverridden,
    noteTargets,
    allTags,
    calibreBooks,
    closable,
    onClose,
    onFocus,
    onFilenameChange,
    onLibraryChanged,
    onTagsChanged,
    onFontSizeChange,
    onToggleFontSizeOverride,
    onNoteFontChange,
    onToggleNoteFontOverride,
    onCreateNoteFromLink,
    onFavoriteChanged,
    focusMode,
    onToggleFocusMode,
  },
  ref
) {
  const { vaultId, vaultFetch } = useVault();
  const [content, setContent] = useState("");
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  // Capa MANUAL (cru, não resolvido com a automática) — o botão "+ Capa"
  // decide seu próprio comportamento (abrir seletor direto vs. popup de
  // trocar/remover) só com base nisso, nunca na capa automática.
  const [coverManualPath, setCoverManualPath] = useState<string | null>(null);
  const [coverMenuAnchor, setCoverMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [editingHighlight, setEditingHighlight] = useState<{
    from: number;
    to: number;
    tipo: string;
    modo: "fundo" | "sublinhado";
  } | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  // Painel único de comentários (ancorados + gerais) — ver BookCommentsPanel.
  const [showBookComments, setShowBookComments] = useState(false);
  // Incrementado a cada clique no botão flutuante de comentários do
  // visualizador (ver abaixo) — BookCommentsPanel usa a MUDANÇA de valor
  // (não o valor em si) pra abrir o composer de comentário geral direto,
  // sem precisar de um segundo clique em "+ Novo comentário".
  const [commentComposeTrigger, setCommentComposeTrigger] = useState(0);
  // Incrementado a cada clique/tecla dentro do conteúdo do EPUB (retransmitido
  // via EpubViewer.onContentInteraction — ver comentário lá: um clique que cai
  // em cima do iframe do livro nunca chega ao document externo sozinho).
  // BookCommentsPanel usa a MUDANÇA de valor pra fechar o menu de tipo de
  // comentário (síntese/importante/...) quando aberto, mesmo espírito do
  // outside-click que já fecha esse menu pro resto da tela.
  const [closeCommentPickerTrigger, setCloseCommentPickerTrigger] = useState(0);
  const [scrollToCommentId, setScrollToCommentId] = useState<number | null>(null);
  // Menu "⋯" no mobile: agrupa os controles secundários (inserir imagem, Aa,
  // comentários, chat, exportar destaques, controles de imagem) que no
  // desktop ficam sempre visíveis na linha abaixo do título.
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  // Painel de chat com IA — mutuamente exclusivo com o de comentários e o de
  // tradução (nunca dois abertos ao mesmo tempo, decisão confirmada com o
  // usuário).
  const [showChat, setShowChat] = useState(false);
  // Painel lateral de tradução (ver TranslatePanel.tsx) — diferente de um
  // popover pontual, fica aberto até a pessoa fechar manualmente e se
  // atualiza sozinho a cada nova seleção (ver scheduleTranslateUpdate).
  const [showTranslate, setShowTranslate] = useState(false);
  const [translateState, setTranslateState] = useState<{
    status: "loading" | "done" | "error";
    translatedText?: string;
    detectedSourceLanguage?: string;
    message?: string;
  } | null>(null);
  const translateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Diferente de handleAiAction, nunca insere nada na nota: usa o endpoint
  // gratuito do Google Tradutor, sem chave (ver translateServer.ts).
  async function runTranslate(texto: string) {
    if (translateDebounceRef.current) clearTimeout(translateDebounceRef.current);
    setTranslateState({ status: "loading" });
    try {
      const { translatedText, detectedSourceLanguage } = await requestTranslation(texto);
      setTranslateState({ status: "done", translatedText, detectedSourceLanguage });
    } catch (err) {
      setTranslateState({ status: "error", message: err instanceof Error ? err.message : "Erro ao traduzir" });
    }
  }
  function openTranslatePanel(texto: string) {
    setShowBookComments(false);
    setShowChat(false);
    setShowTranslate(true);
    runTranslate(texto);
  }
  function closeTranslatePanel() {
    setShowTranslate(false);
    setTranslateState(null);
    if (translateDebounceRef.current) clearTimeout(translateDebounceRef.current);
  }
  // Chamada tanto pelo watcher de seleção do CodeMirror quanto pelo callback
  // onSelectionChange do EpubViewer — só agenda se o painel já estiver
  // aberto (senão qualquer seleção no app dispararia chamadas à toa).
  function scheduleTranslateUpdate(texto: string) {
    if (!showTranslate) return;
    if (translateDebounceRef.current) clearTimeout(translateDebounceRef.current);
    translateDebounceRef.current = setTimeout(() => runTranslate(texto), 400);
  }
  useEffect(() => {
    return () => {
      if (translateDebounceRef.current) clearTimeout(translateDebounceRef.current);
    };
  }, []);
  function toggleBookComments() {
    setShowBookComments((prev) => {
      const next = !prev;
      if (next) {
        setShowChat(false);
        closeTranslatePanel();
      }
      return next;
    });
  }
  function toggleChat() {
    setShowChat((prev) => {
      const next = !prev;
      if (next) {
        setShowBookComments(false);
        closeTranslatePanel();
      }
      return next;
    });
  }
  // Popup de troca de tipo de um callout já existente (clique no rótulo) —
  // separado do "slashMenu" (que é o /callout digitado inline).
  const [calloutEditAnchor, setCalloutEditAnchor] = useState<{ x: number; y: number; headerFrom: number; headerTo: number } | null>(
    null
  );

  const [titleDraft, setTitleDraft] = useState("");
  const [backlinks, setBacklinks] = useState<string[]>([]);
  const [linkedBooks, setLinkedBooks] = useState<CalibreBook[]>([]);
  const [mentions, setMentions] = useState<{ filename: string; from: number; to: number; matchedText: string }[]>([]);
  const [showMentions, setShowMentions] = useState(false);

  const [commentDraft, setCommentDraft] = useState<{
    tipo: string;
    from: number;
    to: number;
    mode: "create" | "edit";
    anchorText?: string;
    initialText?: string;
    id?: number;
  } | null>(null);
  const [slashMenu, setSlashMenu] = useState<
    { open: boolean; from: number; to: number; selectedIndex: number; x: number; y: number } | null
  >(null);
  const [wikiLinkMenu, setWikiLinkMenu] = useState<
    { open: boolean; from: number; to: number; query: string; selectedIndex: number; x: number; y: number } | null
  >(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [aiStatus, setAiStatus] = useState<{ x: number; y: number; state: "loading" | "error"; message?: string } | null>(null);
  const [footnotePopup, setFootnotePopup] = useState<{ content: string; x: number; y: number } | null>(null);
  const [fontSizePopupAnchor, setFontSizePopupAnchor] = useState<{ x: number; y: number } | null>(null);
  const [selectedImage, setSelectedImage] = useState<{
    alt: string;
    path: string;
    size: number;
    shape: ImageShape;
    align: ImageAlign;
    wrap: ImageWrap;
    from: number;
    to: number;
    // Posição na tela (calculada a partir da própria imagem clicada, ver
    // ImageWidget em livePreview.ts) — ancora o popup flutuante de controles
    // logo abaixo dela, em vez de fixo no topo da nota.
    anchor: { x: number; y: number };
  } | null>(null);

  const editorViewRef = useRef<EditorView | null>(null);
  const epubViewerRef = useRef<EpubViewerHandle | null>(null);
  // Sinaliza (via setState, não só a ref) que o CodeMirror já criou a
  // EditorView de verdade — os efeitos que anexam listeners de evento
  // customizado em editorViewRef.current?.dom precisam disso na lista de
  // dependências, senão rodam ANTES de onCreateEditor preencher a ref (ref
  // não dispara re-execução de efeito) e o listener nunca é anexado.
  const [editorReady, setEditorReady] = useState(0);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  const pendingSaveRef = useRef<{ filename: string; content: string } | null>(null);
  const skipNextAutosaveRef = useRef(false);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFilenameForAutosaveRef = useRef<string | null>(null);
  const blockRefCacheRef = useRef<Map<string, BlockRefInfo>>(new Map());
  const blockRefsFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBlockScrollRef = useRef<{ filename: string; blockId: string } | null>(null);
  const pendingViewerAnchorRef = useRef<{ filename: string; kind: "page" | "chapter"; value: string } | null>(null);
  const [activeViewerAnchor, setActiveViewerAnchor] = useState<{
    filename: string;
    kind: "page" | "chapter";
    value: string;
  } | null>(null);

  // Pseudo-filename "calibre:<id>:<FORMAT>" — identidade de um livro do
  // Calibre em todo lugar que só conhecia "filename de nota" até aqui (ver
  // decisão de arquitetura no plano). O resto do app (page.tsx, split-screen)
  // continua tratando isso como uma string comum; só este painel e os
  // visualizadores precisam reconhecer o prefixo.
  const calibreMatch = filename?.match(/^calibre:(\d+):(.+)$/);
  const isCalibreBook = !!calibreMatch;
  const calibreId = calibreMatch ? Number(calibreMatch[1]) : null;
  const calibreFormat = calibreMatch ? calibreMatch[2] : null;
  const calibreBook = calibreId !== null ? calibreBooks.find((b) => b.id === calibreId) ?? null : null;

  const viewerKind = isCalibreBook
    ? calibreFormat === "EPUB"
      ? "epub"
      : calibreFormat === "PDF"
        ? "pdf"
        : null
    : filename && /\.pdf$/i.test(filename)
      ? "pdf"
      : filename && /\.epub$/i.test(filename)
        ? "epub"
        : null;

  // Número de página digitado à mão (PDF, ver PdfNativeViewer.tsx — não dá
  // pra ler a página atual de volta do iframe nativo) — mostrado + editável
  // na linha compacta do cabeçalho, não mais dentro do próprio visualizador.
  // Reseta quando um novo link de página é clicado (mesmo gatilho que antes
  // remontava o visualizador via `key`) ou o arquivo muda.
  const pdfInitialPage =
    activeViewerAnchor?.filename === filename && activeViewerAnchor.kind === "page"
      ? parseInt(activeViewerAnchor.value, 10) || undefined
      : undefined;
  const [pdfPageInput, setPdfPageInput] = useState(pdfInitialPage ?? 1);
  useEffect(() => {
    setPdfPageInput(pdfInitialPage ?? 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfInitialPage, filename]);

  // Posição textual do EPUB ("Capítulo N de M") — espelhada de dentro do
  // visualizador via onPositionChange (EpubViewer.tsx), computada a partir
  // da posição REAL de leitura, ao contrário do número de página do PDF.
  const [epubPosition, setEpubPosition] = useState("");
  useEffect(() => {
    setEpubPosition("");
  }, [filename]);

  // Rede de segurança: modo foco só faz sentido com viewerKind (o botão de
  // sair só existe nessa linha do cabeçalho) — se o arquivo aberto deixar de
  // ser PDF/EPUB enquanto o modo foco está ativo, sai sozinho pra nunca
  // deixar o overlay em tela cheia sem um jeito de fechar.
  useEffect(() => {
    if (focusMode && !viewerKind) onToggleFocusMode?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMode, viewerKind]);
  const [linkCopyFeedback, setLinkCopyFeedback] = useState(false);

  function handleCopyPositionLink() {
    if (viewerKind === "pdf" && filename) {
      const label = isCalibreBook ? calibreBook?.title ?? filename : filename;
      navigator.clipboard.writeText(`[[${label}#p${pdfPageInput}]]`);
    } else if (viewerKind === "epub") {
      epubViewerRef.current?.copyCurrentLink();
    } else {
      return;
    }
    setLinkCopyFeedback(true);
    setTimeout(() => setLinkCopyFeedback(false), 1500);
  }

  // Modo foco de leitura (só PDF/EPUB) e modal "Vincular a uma nota" (só
  // livro do Calibre) — ver Partes B/C do plano.
  const [showLinkModal, setShowLinkModal] = useState(false);

  const highlightEntries = useMemo(() => {
    if (!filename || viewerKind) return [];
    return extractHighlightEntries(content);
  }, [filename, content, viewerKind]);

  // Comentários ancorados pro painel unificado — só os já migrados (com id;
  // ver efeito de migração acima) entram na lista, já que só eles têm como
  // ordenar corretamente junto com os gerais.
  const anchoredComments = useMemo(() => {
    if (!filename || viewerKind) return [];
    return listComments(content)
      .filter((c) => c.id !== undefined)
      .map((c) => ({ id: c.id!, tipo: c.tipo, texto: c.anchorText, comentario: c.comentario }));
  }, [filename, content, viewerKind]);

  async function saveNote(filenameToSave: string, contentToSave: string) {
    setStatus("Salvando...");
    const res = await vaultFetch("/api/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: filenameToSave, content: contentToSave }),
    });
    const data = await res.json();
    setStatus(data.success ? "Salvo!" : "Erro ao salvar: " + data.error);
    if (data.success) onLibraryChanged();
    pendingSaveRef.current = null;
  }

  function handleSave() {
    if (!filename) return;
    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    saveNote(filename, content);
  }

  useImperativeHandle(ref, () => ({
    async flushPendingSave() {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (pending) await saveNote(pending.filename, pending.content);
    },
    cancelPendingSave() {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
      pendingSaveRef.current = null;
    },
    focusTitle() {
      requestAnimationFrame(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      });
    },
  }));

  async function performRename(oldFilename: string, newTitle: string): Promise<{ filename?: string; error?: string }> {
    const res = await vaultFetch("/api/note/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldFilename, newTitle }),
    });
    return res.json();
  }

  // Renomeia o arquivo a partir do título editado no topo do painel. O pending
  // save precisa ser descartado e a edição atual gravada em disco ANTES da
  // troca de nome, senão uma edição não salva pode se perder ou ser salva com
  // o nome errado.
  async function renameActiveNote(newTitleRaw: string) {
    if (!filename) return;
    const trimmed = newTitleRaw.trim();
    const currentTitle = stripMdExtension(filename);
    if (!trimmed || trimmed === currentTitle) {
      setTitleDraft(currentTitle);
      return;
    }

    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    pendingSaveRef.current = null;
    // PDF/EPUB não têm conteúdo de texto pra preservar (`content` é sempre "")
    // — salvar aqui sobrescreveria o binário original com uma string vazia.
    if (!viewerKind) await saveNote(filename, content);

    const data = await performRename(filename, trimmed);
    if (!data.filename) {
      const message = data.error ?? "desconhecido";
      setStatus("Erro ao renomear: " + message);
      window.alert(message);
      setTitleDraft(currentTitle);
      return;
    }

    const newFilename: string = data.filename;
    skipNextAutosaveRef.current = true;
    onFilenameChange(newFilename);
    onLibraryChanged();
    editorViewRef.current?.focus();
  }

  function handleTagsChange(nextTags: string[]) {
    if (!filename) return;
    setNoteTags(nextTags);
    onTagsChanged(filename, nextTags);
  }

  function handleFavoriteToggle() {
    if (!filename) return;
    const next = !isFavorite;
    setIsFavorite(next);
    onFavoriteChanged(filename, next);
  }

  // Botão "+ Capa": sem capa manual ainda, abre o seletor de arquivo direto
  // (mesmo gesto do "+ tag"); com uma já definida, abre o popup de
  // trocar/remover (CoverMenu) em vez de ir direto pro seletor de novo.
  function handleCoverButtonClick(rect: DOMRect) {
    if (coverManualPath) {
      setCoverMenuAnchor({ x: rect.left, y: rect.bottom + 4 });
    } else {
      coverFileInputRef.current?.click();
    }
  }

  async function handleCoverFileSelected(file: File) {
    if (!filename) return;
    const path = await uploadAndSetCover(vaultFetch, filename, file);
    if (!path) return;
    setCoverManualPath(path);
    onLibraryChanged();
  }

  function handleRemoveCover() {
    if (!filename) return;
    setCoverManualPath(null);
    setCoverMenuAnchor(null);
    removeCover(vaultFetch, filename).then(() => onLibraryChanged());
  }

  function handleExportHighlights() {
    if (!filename || highlightEntries.length === 0) return;
    generateHighlightsPdf(stripMdExtension(filename), highlightEntries);
  }

  function openFontSizePopup(rect: DOMRect) {
    setFontSizePopupAnchor({ x: rect.left, y: rect.bottom + 6 });
  }

  function handleFontSizeChange(newSize: number) {
    onFontSizeChange(filename, newSize);
  }

  function handleToggleFontSizeOverride(checked: boolean) {
    if (!filename) return;
    onToggleFontSizeOverride(filename, checked, fontSize);
  }

  function handleNoteFontChange(newFont: NoteFontId) {
    onNoteFontChange(filename, newFont);
  }

  function handleToggleNoteFontOverride(checked: boolean) {
    if (!filename) return;
    onToggleNoteFontOverride(filename, checked, noteFont);
  }

  useEffect(() => {
    function handleIconClick(e: Event) {
      const detail = (e as CustomEvent).detail as { tipo: string; modo: "fundo" | "sublinhado"; from: number; to: number };
      const view = editorViewRef.current;
      if (!view) return;
      setEditingHighlight(detail);
      const coords = view.coordsAtPos(detail.to);
      if (coords) setMenuPos({ x: coords.left, y: coords.bottom + 6 });
    }
    const dom = editorViewRef.current?.dom;
    dom?.addEventListener("highlight-icon-click", handleIconClick);
    return () => dom?.removeEventListener("highlight-icon-click", handleIconClick);
  }, [filename, editorReady]);

  useEffect(() => {
    function handleImageClick(e: Event) {
      const detail = (e as CustomEvent).detail as {
        alt: string;
        path: string;
        size: number;
        shape: ImageShape;
        align: ImageAlign;
        wrap: ImageWrap;
        from: number;
        to: number;
        anchor: { x: number; y: number };
      };
      const view = editorViewRef.current;
      if (!view) return;
      setSelectedImage(detail);
    }
    const dom = editorViewRef.current?.dom;
    dom?.addEventListener("image-click", handleImageClick);
    return () => dom?.removeEventListener("image-click", handleImageClick);
  }, [filename, editorReady]);

  useEffect(() => {
    function handleBlockEmbedOpen(e: Event) {
      const detail = (e as CustomEvent).detail as { filename: string | null };
      if (detail.filename) onFilenameChange(detail.filename);
    }
    const dom = editorViewRef.current?.dom;
    dom?.addEventListener("block-embed-open", handleBlockEmbedOpen);
    return () => dom?.removeEventListener("block-embed-open", handleBlockEmbedOpen);
  }, [filename, editorReady]);

  // Clique no marcador circular de comentário (ver CommentMarkerWidget em
  // livePreview.ts): abre o painel único e rola/destaca o card correspondente.
  useEffect(() => {
    function handleCommentMarkerClick(e: Event) {
      const detail = (e as CustomEvent).detail as { commentId: string | null };
      if (!detail.commentId) return;
      setShowBookComments(true);
      setScrollToCommentId(Number(detail.commentId));
    }
    const dom = editorViewRef.current?.dom;
    dom?.addEventListener("comment-marker-click", handleCommentMarkerClick);
    return () => dom?.removeEventListener("comment-marker-click", handleCommentMarkerClick);
  }, [filename, editorReady]);

  // Clique no rótulo de um callout já existente (ver CalloutLabelWidget em
  // livePreview.ts): abre o mesmo popup de tipos, agora pra TROCAR o tipo do
  // callout — a única forma de editar isso, já que "[!tipo]" nunca mais fica
  // visível pra digitar por cima.
  useEffect(() => {
    function handleCalloutLabelClick(e: Event) {
      const detail = (e as CustomEvent).detail as { tipo: string; headerFrom: number; headerTo: number };
      const view = editorViewRef.current;
      if (!view) return;
      const coords = view.coordsAtPos(detail.headerTo);
      setCalloutEditAnchor({ x: coords?.left ?? 0, y: (coords?.bottom ?? 0) + 6, headerFrom: detail.headerFrom, headerTo: detail.headerTo });
    }
    const dom = editorViewRef.current?.dom;
    dom?.addEventListener("callout-label-click", handleCalloutLabelClick);
    return () => dom?.removeEventListener("callout-label-click", handleCalloutLabelClick);
  }, [filename, editorReady]);

  useEffect(() => {
    setTitleDraft(isCalibreBook ? calibreBook?.title ?? "" : filename ? stripMdExtension(filename) : "");
  }, [filename, isCalibreBook, calibreBook?.title]);

  // Livro do Calibre nunca vem de /api/note (não é uma nota do vault) — os
  // detalhes já estão em `calibreBooks` (bulk-carregado em page.tsx). Reseta
  // o estado "de nota" pra um livro do Calibre não herdar tags/favorito/capa
  // da nota aberta anteriormente neste mesmo painel.
  useEffect(() => {
    if (!filename) return;
    if (isCalibreBook) {
      setContent("");
      setStatus("");
      setBacklinks([]);
      setNoteTags([]);
      setIsFavorite(false);
      setCoverManualPath(null);
      return;
    }
    setStatus("Carregando...");
    vaultFetch(`/api/note?filename=${encodeURIComponent(filename)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.content !== undefined) {
          skipNextAutosaveRef.current = true;
          setContent(data.content);
          setStatus("Carregado.");
          setBacklinks(data.backlinks ?? []);
          setNoteTags(data.tags ?? []);
          setIsFavorite(!!data.isFavorite);
          setCoverManualPath(data.coverManualPath ?? null);
        } else {
          setStatus("Erro ao carregar: " + data.error);
        }
      });
  }, [filename, vaultFetch, isCalibreBook]);

  // Livros do Calibre vinculados a esta nota (ver botão "Vincular" no
  // visualizador do livro — vínculo é metadado puro, nunca texto na nota).
  useEffect(() => {
    if (!filename || isCalibreBook) {
      setLinkedBooks([]);
      return;
    }
    fetch(`/api/note/calibre-links?vault=${encodeURIComponent(vaultId)}&filename=${encodeURIComponent(filename)}`)
      .then((res) => res.json())
      .then((data) => setLinkedBooks(data.books ?? []));
  }, [filename, vaultId, isCalibreBook]);

  // Migração de compatibilidade: comentários ancorados gravados antes do
  // painel unificado existir não têm o "¶id" (não dava pra ordená-los junto
  // com os gerais). Na primeira carga em que aparecem sem id, cria a linha
  // placeholder em book_comments pra cada um e regrava o texto com o id —
  // depois disso o autosave já existente cuida de persistir a mudança.
  useEffect(() => {
    if (!filename || viewerKind) return;
    const missing = listComments(content).filter((c) => c.id === undefined);
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const view = editorViewRef.current;
      if (!view) return;
      // Do fim pro início, pra não invalidar as posições dos que ainda faltam.
      const sorted = [...missing].sort((a, b) => b.from - a.from);
      for (const c of sorted) {
        if (cancelled) return;
        const res = await vaultFetch("/api/book-comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename, anchored: true }),
        });
        const data = await res.json();
        const id = data.comment?.id;
        if (id == null || cancelled) continue;

        const currentDoc = view.state.doc;
        const expected = `~${c.anchorText}~¶${c.tipo}{${c.comentario}}`;
        if (currentDoc.sliceString(c.from, c.to) !== expected) continue; // texto mudou nesse meio-tempo

        view.dispatch({ changes: { from: c.to, to: c.to, insert: `¶${id}` } });
      }
      if (!cancelled) setContent(view.state.doc.toString());
    })();

    return () => {
      cancelled = true;
    };
  }, [content, filename, viewerKind, vaultFetch]);

  useEffect(() => {
    const pending = pendingBlockScrollRef.current;
    if (!pending || pending.filename !== filename) return;
    pendingBlockScrollRef.current = null;

    const view = editorViewRef.current;
    if (!view) return;

    const marker = findBlockMarkers(content).find((m) => m.blockId.toLowerCase() === pending.blockId.toLowerCase());
    if (!marker) return;

    view.dispatch({
      selection: EditorSelection.cursor(marker.paragraphFrom),
      effects: EditorView.scrollIntoView(marker.paragraphFrom, { y: "center" }),
    });
  }, [content, filename]);

  useEffect(() => {
    const pending = pendingViewerAnchorRef.current;
    if (!pending || pending.filename !== filename) return;
    pendingViewerAnchorRef.current = null;
    setActiveViewerAnchor(pending);
  }, [filename]);

  useEffect(() => {
    if (!filename || isCalibreBook) {
      setMentions([]);
      return;
    }
    vaultFetch(`/api/note/mentions?filename=${encodeURIComponent(filename)}`)
      .then((res) => res.json())
      .then((data) => setMentions(data.mentions ?? []));
  }, [filename, vaultFetch, isCalibreBook]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    view.dispatch({ effects: setActiveCommentEffect.of(activeCommentId) });
  }, [activeCommentId]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    view.dispatch({
      effects: setSelectedImageEffect.of(selectedImage ? { from: selectedImage.from, to: selectedImage.to } : null),
    });
  }, [selectedImage]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    view.dispatch({ effects: setLinkTargetsEffect.of(buildLinkTargetsMap(noteTargets)) });
  }, [noteTargets]);

  useEffect(() => {
    if (blockRefsFetchTimeoutRef.current) clearTimeout(blockRefsFetchTimeoutRef.current);

    blockRefsFetchTimeoutRef.current = setTimeout(() => {
      const refs = extractBlockRefs(content);
      const missing = new Map<string, { noteRaw: string; blockId: string }>();
      for (const r of refs) {
        const key = blockRefKey(r.noteRaw, r.blockId);
        if (!blockRefCacheRef.current.has(key)) missing.set(key, { noteRaw: r.noteRaw, blockId: r.blockId });
      }
      if (missing.size === 0) return;

      vaultFetch("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refs: Array.from(missing.values()) }),
      })
        .then((res) => res.json())
        .then((data: { resolved?: (BlockRefInfo & { noteRaw: string; blockId: string })[] }) => {
          if (!data.resolved) return;
          for (const r of data.resolved) {
            blockRefCacheRef.current.set(blockRefKey(r.noteRaw, r.blockId), {
              noteExists: r.noteExists,
              noteFilename: r.noteFilename,
              noteTitle: r.noteTitle,
              blockFound: r.blockFound,
              text: r.text,
            });
          }
          const view = editorViewRef.current;
          if (view) view.dispatch({ effects: setBlockRefsEffect.of(new Map(blockRefCacheRef.current)) });
        });
    }, 400);

    return () => {
      if (blockRefsFetchTimeoutRef.current) clearTimeout(blockRefsFetchTimeoutRef.current);
    };
  }, [content, vaultFetch]);

  // Autosave: espera uma pausa de digitação e salva sozinho. "noteJustChanged"
  // evita salvar o conteúdo da nota ANTERIOR por cima do arquivo da nota NOVA
  // (a comparação é síncrona, não depende de quem vence uma corrida entre um
  // timer e um fetch, então nunca falha por timing).
  useEffect(() => {
    const noteJustChanged = lastFilenameForAutosaveRef.current !== filename;
    lastFilenameForAutosaveRef.current = filename;

    // PDF/EPUB nunca têm conteúdo de texto editável (`content` fica sempre ""
    // pra eles, ver GET /api/note) — nunca pode ser autosalvo, senão sobrescreve
    // o binário original com uma string vazia. Sem esse corte, o StrictMode do
    // React (dev) roda esse efeito duas vezes seguidas quando `content` muda
    // (ver skipNextAutosaveRef acima): a 1ª invocação consome a flag, mas a 2ª
    // (só de verificação, do próprio StrictMode) já não a vê mais marcada e
    // agenda um autosave de verdade com content="" — foi o que corrompeu os
    // EPUBs testados nesta sessão.
    if (viewerKind) {
      pendingSaveRef.current = null;
      return;
    }

    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      pendingSaveRef.current = null;
      return;
    }
    if (noteJustChanged || !filename) {
      pendingSaveRef.current = null;
      return;
    }

    pendingSaveRef.current = { filename, content };
    autosaveTimeoutRef.current = setTimeout(() => {
      if (pendingSaveRef.current) saveNote(pendingSaveRef.current.filename, pendingSaveRef.current.content);
    }, 1500);

    return () => {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    };
  }, [content, filename, viewerKind]);

  // Se trocar de nota antes do autosave disparar, salva imediatamente o que
  // ainda estava pendente — troca rápida de nota não pode perder edição.
  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) {
        const pending = pendingSaveRef.current;
        pendingSaveRef.current = null;
        vaultFetch("/api/note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: pending.filename, content: pending.content }),
        });
      }
    };
  }, [filename, vaultFetch]);

  function getWikiLinkSuggestions(query: string): { label: string; filename: string; source?: "note" | "calibre" }[] {
    const q = query.trim().toLowerCase();
    const matches = noteTargets.filter((t) => {
      if (t.filename === filename) return false;
      if (!q) return true;
      if (t.title.toLowerCase().includes(q)) return true;
      if (t.filename.toLowerCase().includes(q)) return true;
      return t.aliases.some((a) => a.toLowerCase().includes(q));
    });
    return matches.slice(0, 8).map((t) => ({ label: t.title, filename: t.filename, source: t.source }));
  }

  function confirmWikiLink(item: { label: string; filename: string }, range: { from: number; to: number }) {
    const view = editorViewRef.current;
    if (!view) return;
    const insertText = `${item.label}]]`;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: insertText },
      selection: EditorSelection.cursor(range.from + insertText.length),
    });
    view.focus();
  }

  async function createNoteFromLink(title: string) {
    const newFilename = await onCreateNoteFromLink(title);
    if (newFilename) onFilenameChange(newFilename);
  }

  async function insertImageAt(view: EditorView, pos: number, file: File) {
    const placeholder = "![Enviando imagem...]()";
    view.dispatch({
      changes: { from: pos, to: pos, insert: placeholder },
      selection: EditorSelection.cursor(pos + placeholder.length),
    });

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await vaultFetch("/api/attachments", { method: "POST", body: formData });
      const data = await res.json();

      const currentText = view.state.doc.toString();
      const placeholderStillThere = currentText.slice(pos, pos + placeholder.length) === placeholder;
      if (!placeholderStillThere) return;

      if (!data.path) {
        view.dispatch({ changes: { from: pos, to: pos + placeholder.length, insert: "" } });
        window.alert(data.error ?? "Não foi possível inserir a imagem");
        return;
      }

      const finalSyntax = buildImageSyntax(
        file.name,
        data.path,
        DEFAULT_IMAGE_SIZE,
        DEFAULT_IMAGE_SHAPE,
        DEFAULT_IMAGE_ALIGN,
        DEFAULT_IMAGE_WRAP
      );
      view.dispatch({ changes: { from: pos, to: pos + placeholder.length, insert: finalSyntax } });
    } catch {
      const currentText = view.state.doc.toString();
      if (currentText.slice(pos, pos + placeholder.length) === placeholder) {
        view.dispatch({ changes: { from: pos, to: pos + placeholder.length, insert: "" } });
      }
      window.alert("Não foi possível inserir a imagem");
    }
  }

  function handleInsertImageClick() {
    imageFileInputRef.current?.click();
  }

  function handleImageSizeChange(size: number) {
    const view = editorViewRef.current;
    if (!view || !selectedImage) return;
    const newSyntax = buildImageSyntax(selectedImage.alt, selectedImage.path, size, selectedImage.shape, selectedImage.align, selectedImage.wrap);
    const newTo = selectedImage.from + newSyntax.length;
    view.dispatch({
      changes: { from: selectedImage.from, to: selectedImage.to, insert: newSyntax },
      effects: setSelectedImageEffect.of({ from: selectedImage.from, to: newTo }),
    });
    setSelectedImage({ ...selectedImage, size, to: newTo });
  }

  function handleImageShapeChange(shape: ImageShape) {
    const view = editorViewRef.current;
    if (!view || !selectedImage) return;
    const newSyntax = buildImageSyntax(selectedImage.alt, selectedImage.path, selectedImage.size, shape, selectedImage.align, selectedImage.wrap);
    const newTo = selectedImage.from + newSyntax.length;
    view.dispatch({
      changes: { from: selectedImage.from, to: selectedImage.to, insert: newSyntax },
      effects: setSelectedImageEffect.of({ from: selectedImage.from, to: newTo }),
    });
    setSelectedImage({ ...selectedImage, shape, to: newTo });
  }

  function handleImageAlignChange(align: ImageAlign) {
    const view = editorViewRef.current;
    if (!view || !selectedImage) return;
    const newSyntax = buildImageSyntax(selectedImage.alt, selectedImage.path, selectedImage.size, selectedImage.shape, align, selectedImage.wrap);
    const newTo = selectedImage.from + newSyntax.length;
    view.dispatch({
      changes: { from: selectedImage.from, to: selectedImage.to, insert: newSyntax },
      effects: setSelectedImageEffect.of({ from: selectedImage.from, to: newTo }),
    });
    setSelectedImage({ ...selectedImage, align, to: newTo });
  }

  function handleImageWrapChange(wrap: ImageWrap) {
    const view = editorViewRef.current;
    if (!view || !selectedImage) return;
    const newSyntax = buildImageSyntax(selectedImage.alt, selectedImage.path, selectedImage.size, selectedImage.shape, selectedImage.align, wrap);
    const newTo = selectedImage.from + newSyntax.length;
    view.dispatch({
      changes: { from: selectedImage.from, to: selectedImage.to, insert: newSyntax },
      effects: setSelectedImageEffect.of({ from: selectedImage.from, to: newTo }),
    });
    setSelectedImage({ ...selectedImage, wrap, to: newTo });
  }

  async function convertMention(mention: { filename: string; from: number; to: number; matchedText: string }) {
    const res = await vaultFetch(`/api/note?filename=${encodeURIComponent(mention.filename)}`);
    const data = await res.json();
    const currentContent: string = data.content ?? "";

    if (currentContent.slice(mention.from, mention.to) !== mention.matchedText) {
      if (filename) {
        vaultFetch(`/api/note/mentions?filename=${encodeURIComponent(filename)}`)
          .then((r) => r.json())
          .then((d) => setMentions(d.mentions ?? []));
      }
      return;
    }

    const updated = currentContent.slice(0, mention.from) + `[[${mention.matchedText}]]` + currentContent.slice(mention.to);

    await vaultFetch("/api/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: mention.filename, content: updated }),
    });

    if (mention.filename === filename) setContent(updated);
    setMentions((prev) => prev.filter((m) => m !== mention));
  }

  function findHighlightAt(view: EditorView, pos: number) {
    const text = view.state.doc.toString();
    const regex = /==(.+?)==§(\w+)(:sub)?/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (pos >= start && pos <= end) {
        return { from: start, to: end, tipo: match[2], modo: (match[3] ? "sublinhado" : "fundo") as "fundo" | "sublinhado" };
      }
    }
    return null;
  }

  function findCommentAt(view: EditorView, pos: number): boolean {
    const text = view.state.doc.toString();
    const regex = /~(.+?)~¶(\w+){([^}]*)}(?:¶(\d+))?/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (pos >= start && pos <= end) return true;
    }
    return false;
  }

  // "id" é o id da linha placeholder em book_comments (ver migrateOldAnchoredComments
  // logo abaixo) — undefined pra comentários ainda não migrados pro novo formato.
  function listComments(text: string) {
    const regex = /~(.+?)~¶(\w+){([^}]*)}(?:¶(\d+))?/g;
    const results: { from: number; to: number; tipo: string; anchorText: string; comentario: string; id?: number }[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      results.push({
        from: match.index,
        to: match.index + match[0].length,
        tipo: match[2],
        anchorText: match[1],
        comentario: match[3],
        id: match[4] ? Number(match[4]) : undefined,
      });
    }
    return results;
  }

  // Acha a posição atual de um comentário ancorado pelo id persistido (embutido
  // na sintaxe como "¶id") — usado pelo painel unificado ("ir para o trecho",
  // editar, apagar), já que o id não muda mas a posição no texto muda a cada edição.
  function findAnchoredCommentByPersistedId(id: number): { from: number; to: number } | null {
    const view = editorViewRef.current;
    if (!view) return null;
    const match = listComments(view.state.doc.toString()).find((c) => c.id === id);
    return match ? { from: match.from, to: match.to } : null;
  }

  function handleGoToAnchor(id: number) {
    const view = editorViewRef.current;
    const loc = findAnchoredCommentByPersistedId(id);
    if (!view || !loc) return;
    view.dispatch({
      selection: EditorSelection.cursor(loc.from),
      effects: EditorView.scrollIntoView(loc.from, { y: "center" }),
    });
    view.focus();
  }

  // "Ir para o trecho" de um comentário ancorado de EPUB (auto-contido, com
  // CFI próprio) — diferente de handleGoToAnchor (.md, posição de texto), só
  // pede pro EpubViewer JÁ MONTADO navegar até lá, sem remontar.
  function handleGoToEpubAnchor(cfi: string) {
    epubViewerRef.current?.goToCfi(cfi);
  }

  // Marcador de comentário ancorado clicado dentro do EPUB — mesmo estado já
  // usado pelo marcador de .md (CommentMarkerWidget).
  function handleEpubMarkerClick(commentId: number) {
    setShowBookComments(true);
    setScrollToCommentId(commentId);
  }

  function handleEditAnchoredById(id: number) {
    const loc = findAnchoredCommentByPersistedId(id);
    if (loc) editComment(loc.from);
  }

  function handleDeleteAnchoredById(id: number) {
    const loc = findAnchoredCommentByPersistedId(id);
    if (loc) deleteComment(loc.from);
  }

  function removeHighlight() {
    const view = editorViewRef.current;
    if (!view || !editingHighlight) return;
    const innerText = view.state.doc.sliceString(
      editingHighlight.from + 2,
      view.state.doc.toString().indexOf("==", editingHighlight.from + 2)
    );
    view.dispatch({
      changes: { from: editingHighlight.from, to: editingHighlight.to, insert: innerText },
      selection: EditorSelection.cursor(editingHighlight.from + innerText.length),
    });
    setEditingHighlight(null);
    setMenuPos(null);
    view.focus();
  }

  function startComment(tipo: string) {
    const view = editorViewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    if (sel.empty) return;
    setCommentDraft({ tipo, from: sel.from, to: sel.to, mode: "create" });
    setMenuPos(null);
  }

  function insertCallout(tipo: string, replaceRange?: { from: number; to: number }) {
    const view = editorViewRef.current;
    if (!view) return;

    if (replaceRange) {
      const calloutText = `> [!${tipo}]\n> `;
      view.dispatch({
        changes: { from: replaceRange.from, to: replaceRange.to, insert: calloutText },
        selection: EditorSelection.cursor(replaceRange.from + calloutText.length),
      });
    } else {
      const cursor = view.state.selection.main.head;
      const line = view.state.doc.lineAt(cursor);
      const insertPos = line.to;
      const calloutText = `\n> [!${tipo}]\n> `;
      view.dispatch({
        changes: { from: insertPos, to: insertPos, insert: calloutText },
        selection: EditorSelection.cursor(insertPos + calloutText.length),
      });
    }
    view.focus();
  }

  // Insere o resultado de uma ação de IA como um callout tipo "ia" LOGO
  // DEPOIS de afterPos — nunca substitui nada (diferente de insertCallout
  // com replaceRange), pra preservar o trecho original selecionado, mesmo
  // princípio de destaques/comentários (nunca apagam o texto por baixo).
  function insertAiCallout(afterPos: number, resultado: string) {
    const view = editorViewRef.current;
    if (!view) return;
    const linhas = resultado.split("\n").map((linha) => `> ${linha}`).join("\n");
    const calloutText = `\n> [!ia]\n${linhas}\n`;
    view.dispatch({
      changes: { from: afterPos, to: afterPos, insert: calloutText },
      selection: EditorSelection.cursor(afterPos + calloutText.length),
    });
    view.focus();
  }

  async function handleAiAction(action: AiAction) {
    const view = editorViewRef.current;
    if (!view || !menuPos) return;
    const sel = view.state.selection.main;
    if (sel.empty) return;
    const { from, to } = sel;
    const textoSelecionado = view.state.doc.sliceString(from, to);
    const badgePos = { x: menuPos.x, y: menuPos.y };
    setMenuPos(null);
    setAiStatus({ ...badgePos, state: "loading" });

    try {
      const resultado = await requestAiAction(action, textoSelecionado);
      // Confere que o trecho não mudou entre o disparo e a resposta (a
      // pessoa pode ter continuado editando enquanto a IA gerava) — mesma
      // checagem defensiva já usada na migração de comentários antigos.
      const aindaBate = editorViewRef.current?.state.doc.sliceString(from, to) === textoSelecionado;
      if (aindaBate) {
        insertAiCallout(to, resultado);
      }
      setAiStatus(null);
    } catch (err) {
      setAiStatus({ ...badgePos, state: "error", message: err instanceof Error ? err.message : "Erro ao gerar com IA" });
      setTimeout(() => setAiStatus(null), 3000);
    }
  }

  function handleTranslate() {
    const view = editorViewRef.current;
    if (!view || !menuPos) return;
    const sel = view.state.selection.main;
    if (sel.empty) return;
    const texto = view.state.doc.sliceString(sel.from, sel.to);
    setMenuPos(null);
    openTranslatePanel(texto);
  }

  function insertCalloutSlashCommand() {
    const view = editorViewRef.current;
    if (!view) return;
    const cursor = view.state.selection.main.head;
    view.dispatch({
      changes: { from: cursor, to: cursor, insert: "/callout" },
      selection: EditorSelection.cursor(cursor + "/callout".length),
    });
    view.focus();
  }

  const calloutShortcutKeymap = Prec.highest(
    keymap.of([
      {
        key: "Mod-Shift-f",
        run() {
          insertCalloutSlashCommand();
          return true;
        },
      },
    ])
  );

  function editComment(from: number) {
    const view = editorViewRef.current;
    if (!view) return;
    const text = view.state.doc.toString();
    const regex = /~(.+?)~¶(\w+){([^}]*)}(?:¶(\d+))?/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match.index === from) {
        setCommentDraft({
          tipo: match[2],
          from: match.index,
          to: match.index + match[0].length,
          mode: "edit",
          anchorText: match[1],
          initialText: match[3],
          id: match[4] ? Number(match[4]) : undefined,
        });
        return;
      }
    }
  }

  function deleteComment(from: number) {
    const view = editorViewRef.current;
    if (!view) return;
    const text = view.state.doc.toString();
    const regex = /~(.+?)~¶(\w+){([^}]*)}(?:¶(\d+))?/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match.index === from) {
        const anchorText = match[1];
        const persistedId = match[4];
        view.dispatch({ changes: { from: match.index, to: match.index + match[0].length, insert: anchorText } });
        view.focus();
        if (persistedId) vaultFetch(`/api/book-comments/${persistedId}`, { method: "DELETE" });
        return;
      }
    }
  }

  // No modo "create", precisa primeiro criar a linha placeholder em
  // book_comments (só assim ganha um id) antes de gravar a sintaxe no texto —
  // esse id é o que permite o comentário aparecer na ordem certa no painel
  // unificado (junto com os gerais) e ser localizado depois (ir pro trecho/
  // editar/apagar). No modo "edit", o id já existe e só precisa ser preservado.
  async function confirmComment(texto: string) {
    const view = editorViewRef.current;
    if (!view || !commentDraft) return;
    const anchorText = commentDraft.mode === "edit" ? commentDraft.anchorText! : view.state.doc.sliceString(commentDraft.from, commentDraft.to);

    let id = commentDraft.id;
    if (commentDraft.mode === "create" && filename) {
      const res = await vaultFetch("/api/book-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, anchored: true }),
      });
      const data = await res.json();
      id = data.comment?.id;
    }

    const suffix = id != null ? `¶${id}` : "";
    const newText = `~${anchorText}~¶${commentDraft.tipo}{${texto}}${suffix}`;
    view.dispatch({
      changes: { from: commentDraft.from, to: commentDraft.to, insert: newText },
      selection: EditorSelection.cursor(commentDraft.from + newText.length),
    });
    setCommentDraft(null);
    view.focus();
  }

  const selectionWatcher = EditorView.updateListener.of((update) => {
    if (update.selectionSet) {
      const sel = update.state.selection.main;
      if (sel.empty) {
        setMenuPos(null);
        setEditingHighlight(null);
        return;
      }
      // Acompanha qualquer seleção nova pro painel de tradução (se estiver
      // aberto) — antes das checagens de sobreposição abaixo, já que a
      // tradução deve seguir a seleção mesmo em cima de um trecho já
      // marcado/comentado.
      scheduleTranslateUpdate(update.state.doc.sliceString(sel.from, sel.to));
      const overlapsHighlight = findHighlightAt(update.view, sel.from) || findHighlightAt(update.view, sel.to);
      const overlapsComment = findCommentAt(update.view, sel.from) || findCommentAt(update.view, sel.to);
      if (overlapsHighlight || overlapsComment) {
        setMenuPos(null);
        setEditingHighlight(null);
        return;
      }
      setEditingHighlight(null);
      const coords = update.view.coordsAtPos(sel.head);
      if (coords) setMenuPos({ x: coords.left, y: coords.bottom + 6 });
    }
  });

  const slashMenuWatcher = EditorView.updateListener.of((update) => {
    const field = update.state.field(slashMenuField, false);
    if (!field || !field.open) {
      setSlashMenu(null);
      return;
    }
    const coords = update.view.coordsAtPos(field.to);
    if (coords) setSlashMenu({ ...field, x: coords.left, y: coords.bottom + 6 });
  });

  const commentClickHandler = EditorView.domEventHandlers({
    mousedown(event) {
      const target = event.target as HTMLElement;
      const anchorEl = target.closest(".comment-anchor") as HTMLElement | null;
      if (anchorEl) {
        const commentId = anchorEl.getAttribute("data-comment-id");
        if (commentId) {
          event.preventDefault();
          setActiveCommentId(commentId);
          return true;
        }
      }
      return false;
    },
  });

  const footnoteClickHandler = EditorView.domEventHandlers({
    mousedown(event, view) {
      const target = event.target as HTMLElement;
      const anchorEl = target.closest(".footnote-ref") as HTMLElement | null;
      if (anchorEl) {
        const id = anchorEl.getAttribute("data-footnote-id");
        if (id) {
          event.preventDefault();
          const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const defRegex = new RegExp(`^\\[\\^${escaped}\\]:\\s?(.*)$`, "m");
          const match = view.state.doc.toString().match(defRegex);
          const coords = view.coordsAtPos(view.posAtDOM(anchorEl));
          if (match && coords) setFootnotePopup({ content: match[1].trim(), x: coords.left, y: coords.bottom + 6 });
          return true;
        }
      }
      setFootnotePopup(null);
      return false;
    },
  });

  const imagePasteHandler = EditorView.domEventHandlers({
    paste(event, view) {
      const items = event.clipboardData?.items;
      if (!items) return false;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            insertImageAt(view, view.state.selection.main.head, file);
            return true;
          }
        }
      }
      return false;
    },
  });

  const imageDropHandler = EditorView.domEventHandlers({
    drop(event, view) {
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return false;
      const file = Array.from(files).find((f) => f.type.startsWith("image/"));
      if (!file) return false;
      event.preventDefault();
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
      insertImageAt(view, pos, file);
      return true;
    },
  });

  const wikiLinkMenuWatcher = EditorView.updateListener.of((update) => {
    const field = update.state.field(wikiLinkMenuField, false);
    if (!field || !field.open) {
      setWikiLinkMenu(null);
      return;
    }
    const coords = update.view.coordsAtPos(field.to);
    if (coords) setWikiLinkMenu({ ...field, x: coords.left, y: coords.bottom + 6 });
  });

  const wikiLinkClickHandler = EditorView.domEventHandlers({
    mousedown(event) {
      const target = event.target as HTMLElement;

      const validEl = target.closest(".wiki-link") as HTMLElement | null;
      if (validEl) {
        const targetFilename = validEl.getAttribute("data-target-filename");
        if (targetFilename) {
          event.preventDefault();
          onFilenameChange(targetFilename);
          return true;
        }
      }

      const brokenEl = target.closest(".wiki-link-broken") as HTMLElement | null;
      if (brokenEl) {
        const title = brokenEl.getAttribute("data-target-title");
        if (title) {
          event.preventDefault();
          createNoteFromLink(title);
          return true;
        }
      }

      const pageLinkEl = target.closest(".wiki-page-link") as HTMLElement | null;
      if (pageLinkEl) {
        const targetFilename = pageLinkEl.getAttribute("data-target-filename");
        const page = pageLinkEl.getAttribute("data-target-page");
        if (targetFilename && page) {
          event.preventDefault();
          pendingViewerAnchorRef.current = { filename: targetFilename, kind: "page", value: page };
          onFilenameChange(targetFilename);
          return true;
        }
      }

      const brokenPageLinkEl = target.closest(".wiki-page-link-broken") as HTMLElement | null;
      if (brokenPageLinkEl) {
        const title = brokenPageLinkEl.getAttribute("data-target-title");
        if (title) {
          event.preventDefault();
          createNoteFromLink(title);
          return true;
        }
      }

      const chapterLinkEl = target.closest(".wiki-chapter-link") as HTMLElement | null;
      if (chapterLinkEl) {
        const targetFilename = chapterLinkEl.getAttribute("data-target-filename");
        const chapter = chapterLinkEl.getAttribute("data-target-chapter");
        if (targetFilename && chapter) {
          event.preventDefault();
          pendingViewerAnchorRef.current = { filename: targetFilename, kind: "chapter", value: chapter };
          onFilenameChange(targetFilename);
          return true;
        }
      }

      const brokenChapterLinkEl = target.closest(".wiki-chapter-link-broken") as HTMLElement | null;
      if (brokenChapterLinkEl) {
        const title = brokenChapterLinkEl.getAttribute("data-target-title");
        if (title) {
          event.preventDefault();
          createNoteFromLink(title);
          return true;
        }
      }

      const blockLinkEl = target.closest(".wiki-block-link") as HTMLElement | null;
      if (blockLinkEl) {
        const targetFilename = blockLinkEl.getAttribute("data-target-filename");
        const blockId = blockLinkEl.getAttribute("data-target-block");
        if (targetFilename && blockId) {
          event.preventDefault();
          pendingBlockScrollRef.current = { filename: targetFilename, blockId };
          onFilenameChange(targetFilename);
          return true;
        }
      }

      const brokenBlockLinkEl = target.closest(".wiki-block-link-broken") as HTMLElement | null;
      if (brokenBlockLinkEl) {
        const noteExists = brokenBlockLinkEl.getAttribute("data-note-exists") === "1";
        const title = brokenBlockLinkEl.getAttribute("data-target-title");
        const targetFilename = brokenBlockLinkEl.getAttribute("data-target-filename");
        if (!noteExists && title) {
          event.preventDefault();
          createNoteFromLink(title);
          return true;
        }
        if (noteExists && targetFilename) {
          event.preventDefault();
          onFilenameChange(targetFilename);
          return true;
        }
      }

      return false;
    },
  });

  function applyHighlight(tipo: string, modo: "fundo" | "sublinhado") {
    const view = editorViewRef.current;
    if (!view) return;
    const suffix = modo === "sublinhado" ? ":sub" : "";

    if (editingHighlight) {
      const innerText = view.state.doc.sliceString(
        editingHighlight.from + 2,
        view.state.doc.toString().indexOf("==", editingHighlight.from + 2)
      );
      const newText = `==${innerText}==§${tipo}${suffix}`;
      const newCursorPos = editingHighlight.from + newText.length;

      view.dispatch({
        changes: { from: editingHighlight.from, to: editingHighlight.to, insert: newText },
        selection: EditorSelection.cursor(newCursorPos),
      });

      const updated = findHighlightAt(view, newCursorPos);
      setEditingHighlight(updated);
      if (updated) {
        const coords = view.coordsAtPos(newCursorPos);
        if (coords) setMenuPos({ x: coords.left, y: coords.bottom + 6 });
      }
      view.focus();
      return;
    } else {
      const sel = view.state.selection.main;
      if (sel.empty) return;
      const selectedText = view.state.doc.sliceString(sel.from, sel.to);
      const newText = `==${selectedText}==§${tipo}${suffix}`;
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: newText },
        selection: EditorSelection.cursor(sel.from + newText.length),
      });
      setMenuPos(null);
      view.focus();
    }
  }

  // Modo foco: em vez de participar do layout flex normal ao lado da
  // sidebar/segundo painel, o painel inteiro vira um overlay cobrindo a
  // tela (mesmo truque de z-index já usado pelo Graph View em tela cheia,
  // ver page.tsx/graphFullscreen) — cobre visualmente o cabeçalho global e a
  // sidebar sem precisar escondê-los de verdade.
  return (
    <div
      onMouseDownCapture={onFocus}
      style={
        focusMode
          ? { position: "fixed", inset: 0, zIndex: 3000, background: "var(--background)", display: "flex", minWidth: 0, minHeight: 0 }
          : { display: "flex", flex: 1, minWidth: 0, minHeight: 0 }
      }
    >
      <section style={{ flex: 1, display: "flex", position: "relative", minWidth: 0, minHeight: 0 }}>
        <div style={{ flex: 1, padding: "2rem", display: "flex", flexDirection: "column", position: "relative", minWidth: 0, minHeight: 0, overflowY: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", flexShrink: 0 }}>
          <div style={{ maxWidth: READING_MAX_WIDTH, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", flexShrink: 0 }}>
            {filename && viewerKind && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.75rem",
                }}
              >
                <div
                  style={{
                    fontSize: focusMode ? "1.1em" : "1.4em",
                    fontWeight: "bold",
                    color: "var(--foreground)",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isCalibreBook ? calibreBook?.title ?? "Carregando..." : stripMdExtension(filename)}
                </div>

                {!focusMode && isCalibreBook && (
                  <span
                    style={{
                      padding: "0.15rem 0.5rem",
                      borderRadius: "999px",
                      border: "1px solid var(--panel-border)",
                      color: "var(--text-muted)",
                      fontSize: "0.75rem",
                      flexShrink: 0,
                    }}
                  >
                    Calibre
                  </span>
                )}

                {viewerKind === "pdf" && (
                  <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", flexShrink: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Pág.
                    <input
                      type="number"
                      min={1}
                      value={pdfPageInput}
                      onChange={(e) => setPdfPageInput(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      style={{
                        width: "3.5em",
                        padding: "0.15rem 0.35rem",
                        borderRadius: "4px",
                        border: "1px solid var(--panel-border)",
                        background: "transparent",
                        color: "var(--foreground)",
                      }}
                    />
                  </span>
                )}
                {viewerKind === "epub" && epubPosition && (
                  <span style={{ flexShrink: 0, fontSize: "0.8rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{epubPosition}</span>
                )}

                {!focusMode && isCalibreBook && (
                  <button
                    onClick={() => setShowLinkModal(true)}
                    className="toolbar-link"
                    style={{
                      background: "transparent",
                      border: "1px solid var(--panel-border)",
                      borderRadius: "4px",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: "0.3rem 0.6rem",
                      fontSize: "0.85rem",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Vincular
                  </button>
                )}

                {onToggleFocusMode && (
                  <button
                    onClick={onToggleFocusMode}
                    className="toolbar-link"
                    title={focusMode ? "Sair do modo foco" : "Modo foco"}
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: "0.3rem", display: "flex", alignItems: "center", color: "var(--text-muted)", flexShrink: 0 }}
                  >
                    <FocusModeIcon active={!!focusMode} />
                  </button>
                )}

                <button
                  onClick={() => setMobileToolsOpen(true)}
                  className="toolbar-link"
                  title="Mais opções"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--panel-border)",
                    borderRadius: "4px",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "0.3rem 0.7rem",
                    fontSize: "1rem",
                    flexShrink: 0,
                    lineHeight: 1,
                  }}
                >
                  ⋯
                </button>
                {closable && !focusMode && (
                  <button
                    onClick={onClose}
                    title="Fechar painel"
                    style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "1.2rem", color: "var(--text-muted)", flexShrink: 0 }}
                  >
                    ×
                  </button>
                )}
              </div>
            )}

            {filename && !viewerKind && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    ref={titleInputRef}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={() => renameActiveNote(titleDraft)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Tab") {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    placeholder="Título da nota"
                    style={{
                      fontSize: "1.8em",
                      fontWeight: "bold",
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      color: "var(--foreground)",
                      padding: 0,
                      fontFamily: "inherit",
                      flex: 1,
                      minWidth: 0,
                    }}
                  />
                  <button
                    onClick={handleFavoriteToggle}
                    className="toolbar-link"
                    title={isFavorite ? "Remover dos favoritos" : "Marcar como favorita"}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: "0.2rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <StarIcon filled={isFavorite} />
                  </button>
                  <TagField tags={noteTags} allKnownTags={allTags} onChange={handleTagsChange} />
                  <button
                    onClick={(e) => handleCoverButtonClick(e.currentTarget.getBoundingClientRect())}
                    className="toolbar-link"
                    title={coverManualPath ? "Trocar ou remover capa" : "Adicionar capa"}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      padding: "0.2rem 0.3rem",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {coverManualPath ? "Capa ✓" : "+ capa"}
                  </button>
                </div>

                {noteTags.length > 0 && (
                  <div style={{ marginTop: "0.4rem" }}>
                    <TagChips tags={noteTags} allKnownTags={allTags} onChange={handleTagsChange} />
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: "0.5rem",
                    marginTop: "0.75rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  {!isMobile && (
                    <>
                      <button
                        className="toolbar-link"
                        onClick={handleInsertImageClick}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--panel-border)",
                          borderRadius: "4px",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          padding: "0.3rem 0.6rem",
                          fontSize: "0.85rem",
                          flexShrink: 0,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Inserir imagem
                      </button>
                      <button
                        className="toolbar-link"
                        title="Fonte e tamanho do texto"
                        onClick={(e) => openFontSizePopup(e.currentTarget.getBoundingClientRect())}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--panel-border)",
                          borderRadius: "4px",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          padding: "0.3rem 0.6rem",
                          fontSize: "0.85rem",
                          fontWeight: "bold",
                          flexShrink: 0,
                        }}
                      >
                        Aa
                      </button>
                    </>
                  )}
                  {!isMobile && (
                    <button
                      onClick={toggleBookComments}
                      className="toolbar-link"
                      style={{
                        background: showBookComments ? "var(--panel-hover)" : "transparent",
                        border: "1px solid var(--panel-border)",
                        borderRadius: "4px",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        padding: "0.3rem 0.6rem",
                        fontSize: "0.85rem",
                        flexShrink: 0,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Comentários
                    </button>
                  )}
                  {!isMobile && (
                    <button
                      onClick={toggleChat}
                      className="toolbar-link"
                      style={{
                        background: showChat ? "var(--panel-hover)" : "transparent",
                        border: "1px solid var(--panel-border)",
                        borderRadius: "4px",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        padding: "0.3rem 0.6rem",
                        fontSize: "0.85rem",
                        flexShrink: 0,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Chat
                    </button>
                  )}
                  {!isMobile && (
                    <button
                      className="toolbar-link"
                      title={highlightEntries.length === 0 ? "Nenhum destaque nesta nota" : "Exportar destaques em PDF"}
                      disabled={highlightEntries.length === 0}
                      onClick={handleExportHighlights}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--panel-border)",
                        borderRadius: "4px",
                        color: highlightEntries.length === 0 ? "var(--panel-border)" : "var(--text-muted)",
                        cursor: highlightEntries.length === 0 ? "default" : "pointer",
                        padding: "0.3rem 0.6rem",
                        fontSize: "0.85rem",
                        flexShrink: 0,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Exportar destaques
                    </button>
                  )}
                  {isMobile && (
                    <button
                      onClick={() => setMobileToolsOpen(true)}
                      className="toolbar-link"
                      title="Mais opções"
                      style={{
                        background: "transparent",
                        border: "1px solid var(--panel-border)",
                        borderRadius: "4px",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        padding: "0.3rem 0.7rem",
                        fontSize: "1rem",
                        flexShrink: 0,
                        lineHeight: 1,
                      }}
                    >
                      ⋯
                    </button>
                  )}
                  {closable && (
                    <button
                      onClick={onClose}
                      title="Fechar painel"
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        fontSize: "1.2rem",
                        color: "var(--text-muted)",
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </>
            )}

          </div>

          {!filename && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              {closable && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={onClose}
                    title="Fechar painel"
                    style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "1.2rem", color: "var(--text-muted)" }}
                  >
                    ×
                  </button>
                </div>
              )}
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                Selecione uma nota
              </div>
            </div>
          )}

          {viewerKind && filename && (
            <div style={{ maxWidth: READING_MAX_WIDTH, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              {viewerKind === "pdf" && (
                <PdfNativeViewer
                  key={activeViewerAnchor?.filename === filename && activeViewerAnchor.kind === "page" ? activeViewerAnchor.value : "default"}
                  filename={filename}
                  initialPage={
                    activeViewerAnchor?.filename === filename && activeViewerAnchor.kind === "page"
                      ? parseInt(activeViewerAnchor.value, 10) || undefined
                      : undefined
                  }
                  sourceUrl={isCalibreBook ? `/api/calibre/file/${calibreId}?format=${calibreFormat}` : undefined}
                />
              )}
              {viewerKind === "epub" && (
                <EpubViewer
                  ref={epubViewerRef}
                  filename={filename}
                  theme={theme}
                  fontSize={fontSize}
                  noteFont={noteFont}
                  initialChapter={
                    activeViewerAnchor?.filename === filename && activeViewerAnchor.kind === "chapter"
                      ? parseInt(activeViewerAnchor.value, 10) || undefined
                      : undefined
                  }
                  onMarkerClick={handleEpubMarkerClick}
                  sourceUrl={isCalibreBook ? `/api/calibre/file/${calibreId}?format=${calibreFormat}` : undefined}
                  linkLabel={isCalibreBook ? calibreBook?.title : undefined}
                  calibreId={isCalibreBook ? calibreId ?? undefined : undefined}
                  onPositionChange={setEpubPosition}
                  onContentInteraction={() => setCloseCommentPickerTrigger((t) => t + 1)}
                  onOpenTranslate={openTranslatePanel}
                  onSelectionChange={scheduleTranslateUpdate}
                />
              )}
            </div>
          )}

          {!viewerKind && filename && (
            <div style={{ maxWidth: READING_MAX_WIDTH, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", flex: 1 }}>
              <CodeMirror
                value={content}
                onChange={(value) => setContent(value)}
                extensions={[
                  markdown({ extensions: GFM }),
                  syntaxHighlighting(customHighlightStyle),
                  livePreviewPlugin,
                  codeBlockDecorationsField,
                  selectionWatcher,
                  slashMenuWatcher,
                  activeCommentField,
                  commentClickHandler,
                  slashMenuField,
                  createCalloutSlashKeymap(Object.keys(calloutColorsPalette), (tipo, range) => insertCallout(tipo, range)),
                  calloutShortcutKeymap,
                  listIndentKeymap,
                  videoTimestampClickHandler,
                  linkTargetsField,
                  blockRefsField,
                  wikiLinkMenuField,
                  wikiLinkMenuWatcher,
                  wikiLinkClickHandler,
                  createWikiLinkKeymap(getWikiLinkSuggestions, confirmWikiLink),
                  footnoteClickHandler,
                  selectedImageField,
                  imagePasteHandler,
                  imageDropHandler,
                  editorTheme,
                  EditorView.lineWrapping,
                ]}
                theme="none"
                height="auto"
                style={{ fontSize: `${fontSize}px`, fontFamily: cssVarForFont(noteFont) }}
                basicSetup={{ lineNumbers: false, foldGutter: false, closeBrackets: false }}
                onCreateEditor={(view) => {
                  editorViewRef.current = view;
                  view.dispatch({ effects: setLinkTargetsEffect.of(buildLinkTargetsMap(noteTargets)) });
                  setEditorReady((n) => n + 1);
                }}
              />

              <div style={{ marginTop: "1rem", display: "flex", gap: "1rem", alignItems: "center" }}>
                <button onClick={handleSave} style={{ padding: "0.5rem 1rem" }}>
                  Salvar
                </button>
                <span>{status}</span>
              </div>
            </div>
          )}
          </div>

          {filename && !isCalibreBook && (
            <div style={{ maxWidth: "760px", width: "100%", margin: "0 auto" }}>
              <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--panel-border)", paddingTop: "1rem" }}>
                <h3 style={{ fontSize: "0.9rem", marginBottom: "0.5rem", color: "var(--text-muted)" }}>Backlinks</h3>
                {backlinks.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Nenhuma nota linka pra essa.</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {backlinks.map((backlinkFilename) => (
                      <li key={backlinkFilename}>
                        <button
                          onClick={() => onFilenameChange(backlinkFilename)}
                          style={{
                            padding: "0.3rem 0.6rem",
                            background: "var(--panel-bg)",
                            border: "1px solid var(--panel-border)",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "0.85rem",
                            color: "var(--foreground)",
                          }}
                        >
                          {backlinkFilename}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {linkedBooks.length > 0 && (
                  <div style={{ marginTop: "1rem" }}>
                    <h3 style={{ fontSize: "0.9rem", marginBottom: "0.5rem", color: "var(--text-muted)" }}>Livros vinculados</h3>
                    <ul style={{ listStyle: "none", padding: 0, display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                      {linkedBooks.map((book) => (
                        <li key={book.id} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                          <button
                            onClick={() => onFilenameChange(calibrePseudoFilename(book))}
                            style={{
                              padding: "0.3rem 0.6rem",
                              background: "var(--panel-bg)",
                              border: "1px solid var(--panel-border)",
                              borderRadius: "4px",
                              cursor: "pointer",
                              fontSize: "0.85rem",
                              color: "var(--foreground)",
                            }}
                          >
                            {book.title}
                          </button>
                          <button
                            onClick={async () => {
                              setLinkedBooks((prev) => prev.filter((b) => b.id !== book.id));
                              if (!filename) return;
                              await fetch(
                                `/api/note/calibre-links?vault=${encodeURIComponent(vaultId)}&filename=${encodeURIComponent(filename)}&calibreId=${book.id}`,
                                { method: "DELETE" }
                              );
                            }}
                            title="Desvincular"
                            style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)" }}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  onClick={() => setShowMentions((prev) => !prev)}
                  style={{
                    marginTop: "1rem",
                    padding: "0.3rem 0.6rem",
                    background: "transparent",
                    border: "1px solid var(--panel-border)",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    color: "var(--text-muted)",
                  }}
                >
                  {showMentions ? "▾" : "▸"} Menções não linkadas ({mentions.length})
                </button>

                {showMentions && (
                  <ul style={{ listStyle: "none", padding: 0, marginTop: "0.6rem" }}>
                    {mentions.length === 0 ? (
                      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Nenhuma menção não linkada.</p>
                    ) : (
                      mentions.map((m, i) => (
                        <li
                          key={i}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "0.4rem 0.6rem",
                            background: "var(--panel-bg)",
                            borderRadius: "4px",
                            marginBottom: "0.4rem",
                            fontSize: "0.85rem",
                          }}
                        >
                          <span>
                            {m.filename}: &ldquo;{m.matchedText}&rdquo;
                          </span>
                          <button
                            onClick={() => convertMention(m)}
                            style={{
                              padding: "0.25rem 0.5rem",
                              background: "transparent",
                              border: "1px solid var(--panel-border)",
                              borderRadius: "4px",
                              cursor: "pointer",
                              fontSize: "0.8rem",
                              color: "var(--foreground)",
                            }}
                          >
                            Converter em link
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

      </section>

      {menuPos && (
        <HighlightMenu
          x={menuPos.x}
          y={menuPos.y}
          onSelect={applyHighlight}
          onRemove={editingHighlight ? removeHighlight : undefined}
          onComment={editingHighlight ? undefined : startComment}
          onAiAction={editingHighlight ? undefined : handleAiAction}
          onTranslate={editingHighlight ? undefined : handleTranslate}
          onClose={() => {
            setMenuPos(null);
            setEditingHighlight(null);
          }}
          getExcludedElement={() => editorViewRef.current?.dom ?? null}
          initialTipo={editingHighlight?.tipo}
          initialModo={editingHighlight?.modo}
        />
      )}

      {aiStatus && <AiStatusBadge x={aiStatus.x} y={aiStatus.y} state={aiStatus.state} message={aiStatus.message} />}

      {slashMenu?.open && (
        <CalloutSlashMenu
          x={slashMenu.x}
          y={slashMenu.y}
          entries={Object.entries(calloutColorsPalette)}
          selectedIndex={slashMenu.selectedIndex}
          onSelect={(tipo) => insertCallout(tipo, { from: slashMenu.from, to: slashMenu.to })}
        />
      )}

      {calloutEditAnchor && (
        <CalloutSlashMenu
          x={calloutEditAnchor.x}
          y={calloutEditAnchor.y}
          entries={Object.entries(calloutColorsPalette)}
          selectedIndex={-1}
          onSelect={(tipo) => {
            const view = editorViewRef.current;
            if (view) {
              view.dispatch({
                changes: { from: calloutEditAnchor.headerFrom, to: calloutEditAnchor.headerTo, insert: `> [!${tipo}]` },
              });
            }
            setCalloutEditAnchor(null);
          }}
          onClose={() => setCalloutEditAnchor(null)}
        />
      )}

      {wikiLinkMenu?.open && (
        <WikiLinkMenu
          x={wikiLinkMenu.x}
          y={wikiLinkMenu.y}
          entries={getWikiLinkSuggestions(wikiLinkMenu.query)}
          selectedIndex={wikiLinkMenu.selectedIndex}
          onSelect={(entry) => confirmWikiLink(entry, { from: wikiLinkMenu.from, to: wikiLinkMenu.to })}
        />
      )}

      {footnotePopup && (
        <FootnotePopup x={footnotePopup.x} y={footnotePopup.y} content={footnotePopup.content} onClose={() => setFootnotePopup(null)} />
      )}

      {fontSizePopupAnchor && (
        <FontSizePopup
          x={fontSizePopupAnchor.x}
          y={fontSizePopupAnchor.y}
          size={fontSize}
          isOverridden={isFontSizeOverridden}
          onSizeChange={handleFontSizeChange}
          onToggleOverride={handleToggleFontSizeOverride}
          font={noteFont}
          isFontOverridden={isNoteFontOverridden}
          onFontChange={handleNoteFontChange}
          onToggleFontOverride={handleToggleNoteFontOverride}
          onClose={() => setFontSizePopupAnchor(null)}
          itemLabel={viewerKind === "epub" ? "livro" : "nota"}
        />
      )}

      {coverMenuAnchor && (
        <CoverMenu
          x={coverMenuAnchor.x}
          y={coverMenuAnchor.y}
          onChange={() => {
            setCoverMenuAnchor(null);
            coverFileInputRef.current?.click();
          }}
          onRemove={handleRemoveCover}
          onClose={() => setCoverMenuAnchor(null)}
        />
      )}

      {/* Painel de controles de imagem: flutuante, ancorado na própria imagem
          selecionada (posição vem do próprio clique, ver ImageWidget em
          livePreview.ts) — não mais fixo no topo da nota, que obrigava rolar
          até lá pra ajustar uma imagem no meio de um texto longo. Só desktop
          — no mobile a mesma função já vive na folha "Mais opções" (abaixo),
          que não tem esse problema (é aberta sob demanda, não fica fixa). */}
      {!isMobile && selectedImage && (
        <ImageControlPanel
          x={selectedImage.anchor.x}
          y={selectedImage.anchor.y}
          onClose={() => setSelectedImage(null)}
          image={{
            size: selectedImage.size,
            shape: selectedImage.shape,
            align: selectedImage.align,
            wrap: selectedImage.wrap,
            onSizeChange: handleImageSizeChange,
            onShapeChange: handleImageShapeChange,
            onAlignChange: handleImageAlignChange,
            onWrapChange: handleImageWrapChange,
          }}
        />
      )}

      {commentDraft && (
        <CommentModal tipo={commentDraft.tipo} initialText={commentDraft.initialText} onConfirm={confirmComment} onCancel={() => setCommentDraft(null)} />
      )}

      {filename && (
        <BookCommentsPanel
          filename={filename}
          calibreId={isCalibreBook ? calibreId ?? undefined : undefined}
          isMobile={isMobile}
          open={showBookComments}
          onClose={() => setShowBookComments(false)}
          autoComposeTrigger={commentComposeTrigger}
          closePickerTrigger={closeCommentPickerTrigger}
          anchoredComments={!viewerKind ? anchoredComments : undefined}
          onGoToAnchor={handleGoToAnchor}
          onGoToEpubAnchor={handleGoToEpubAnchor}
          onEditAnchored={handleEditAnchoredById}
          onDeleteAnchored={handleDeleteAnchoredById}
          scrollToId={scrollToCommentId}
        />
      )}

      {/* Botão flutuante de comentários — no mobile cobre qualquer conteúdo
          (nota ou visualizador), mesmo espírito de sempre: no desktop, notas
          já têm o gatilho "Comentários" na linha de botões, mas o
          visualizador PDF/EPUB (cabeçalho enxuto de propósito, ver Parte A)
          não tem mais essa linha — por isso o botão também aparece no
          desktop quando `viewerKind`. Pra `viewerKind`, abre DIRETO no
          composer de comentário geral (autoComposeTrigger), não só a lista —
          pra nota comum no mobile, mantém o comportamento de sempre (só abre
          o painel). */}
      {filename && !showBookComments && (isMobile || viewerKind) && (
        <button
          onClick={() => {
            toggleBookComments();
            if (viewerKind) setCommentComposeTrigger((t) => t + 1);
          }}
          title="Comentários"
          style={{
            position: "fixed",
            right: "1.25rem",
            bottom: "1.25rem",
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            border: "1px solid var(--panel-border)",
            background: "var(--panel-bg)",
            color: "var(--foreground)",
            boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1400,
          }}
        >
          <PencilIcon />
        </button>
      )}

      {/* Menu "⋯" no mobile: os controles secundários que no desktop ficam
          sempre visíveis na linha abaixo do título (ver mais acima), mais o
          ImageControlPanel contextual — tudo dentro de uma folha só, aberta
          de baixo pra cima. */}
      {mobileToolsOpen && (isMobile || viewerKind) && (
        <>
          <div
            onClick={() => setMobileToolsOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1500 }}
          />
          <div
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: "70vh",
              overflowY: "auto",
              background: "var(--panel-bg)",
              borderTop: "1px solid var(--panel-border)",
              borderTopLeftRadius: "12px",
              borderTopRightRadius: "12px",
              padding: "1rem",
              zIndex: 1501,
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
              <h3 style={{ fontSize: "1rem", margin: 0, color: "var(--foreground)" }}>Mais opções</h3>
              <button
                onClick={() => setMobileToolsOpen(false)}
                title="Fechar"
                style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "1.2rem", color: "var(--text-muted)" }}
              >
                ×
              </button>
            </div>

            {!viewerKind && (
              <button
                className="toolbar-link"
                onClick={() => {
                  setMobileToolsOpen(false);
                  handleInsertImageClick();
                }}
                style={mobileToolSheetButtonStyle}
              >
                Inserir imagem
              </button>
            )}
            {viewerKind !== "pdf" && (
              <button
                className="toolbar-link"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMobileToolsOpen(false);
                  openFontSizePopup(rect);
                }}
                style={mobileToolSheetButtonStyle}
              >
                Fonte e tamanho do texto
              </button>
            )}
            <button
              className="toolbar-link"
              onClick={() => {
                setMobileToolsOpen(false);
                toggleBookComments();
              }}
              style={mobileToolSheetButtonStyle}
            >
              Comentários
            </button>
            {viewerKind !== "pdf" && (
              <button
                className="toolbar-link"
                onClick={() => {
                  setMobileToolsOpen(false);
                  toggleChat();
                }}
                style={mobileToolSheetButtonStyle}
              >
                Chat
              </button>
            )}
            {viewerKind && (
              <button
                className="toolbar-link"
                onClick={() => {
                  handleCopyPositionLink();
                  setMobileToolsOpen(false);
                }}
                style={mobileToolSheetButtonStyle}
              >
                {linkCopyFeedback ? "Copiado!" : viewerKind === "pdf" ? "Copiar link desta página" : "Copiar link deste capítulo"}
              </button>
            )}
            {isCalibreBook && calibreBook && calibreBook.formats.length > 1 && (
              <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                {calibreBook.formats.map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => {
                      setMobileToolsOpen(false);
                      onFilenameChange(`calibre:${calibreId}:${fmt}`);
                    }}
                    className="toolbar-link"
                    style={{
                      padding: "0.3rem 0.7rem",
                      borderRadius: "999px",
                      border: "1px solid var(--panel-border)",
                      background: fmt === calibreFormat ? "var(--panel-hover)" : "transparent",
                      color: fmt === calibreFormat ? "var(--foreground)" : "var(--text-muted)",
                      fontWeight: fmt === calibreFormat ? "bold" : "normal",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                    }}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            )}
            {!viewerKind && (
              <button
                className="toolbar-link"
                disabled={highlightEntries.length === 0}
                onClick={() => {
                  setMobileToolsOpen(false);
                  handleExportHighlights();
                }}
                style={{
                  ...mobileToolSheetButtonStyle,
                  color: highlightEntries.length === 0 ? "var(--panel-border)" : "var(--foreground)",
                  cursor: highlightEntries.length === 0 ? "default" : "pointer",
                }}
              >
                Exportar destaques
              </button>
            )}

            {!viewerKind && selectedImage && (
              <div style={{ borderTop: "1px solid var(--panel-border)", marginTop: "0.4rem", paddingTop: "0.75rem" }}>
                <ImageControlPanel
                  image={{
                    size: selectedImage.size,
                    shape: selectedImage.shape,
                    align: selectedImage.align,
                    wrap: selectedImage.wrap,
                    onSizeChange: handleImageSizeChange,
                    onShapeChange: handleImageShapeChange,
                    onAlignChange: handleImageAlignChange,
                    onWrapChange: handleImageWrapChange,
                  }}
                />
              </div>
            )}
          </div>
        </>
      )}

      {showLinkModal && isCalibreBook && calibreId !== null && (
        <LinkBookModal
          calibreId={calibreId}
          bookTitle={calibreBook?.title ?? ""}
          vaultId={vaultId}
          noteTargets={noteTargets}
          onCreateNote={onCreateNoteFromLink}
          onClose={() => setShowLinkModal(false)}
        />
      )}

      {filename && (
        <ChatPanel
          open={showChat}
          onClose={() => setShowChat(false)}
          filename={filename}
          noteTitle={isCalibreBook ? calibreBook?.title ?? "" : stripMdExtension(filename)}
          getOwnContent={viewerKind === "epub" ? async () => (await epubViewerRef.current?.getFullText()) ?? "" : async () => content}
          getCurrentChapterContent={
            viewerKind === "epub" ? async () => (await epubViewerRef.current?.getCurrentChapterText()) ?? "" : undefined
          }
          onLibraryChanged={onLibraryChanged}
        />
      )}

      <TranslatePanel
        open={showTranslate}
        onClose={closeTranslatePanel}
        status={translateState?.status ?? null}
        translatedText={translateState?.translatedText}
        detectedSourceLanguage={translateState?.detectedSourceLanguage}
        message={translateState?.message}
      />

      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const view = editorViewRef.current;
          if (file && view) insertImageAt(view, view.state.selection.main.head, file);
        }}
      />

      <input
        ref={coverFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleCoverFileSelected(file);
        }}
      />
    </div>
  );
});

export default NotePanel;
