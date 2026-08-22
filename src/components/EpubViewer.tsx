"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import HighlightMenu from "@/components/HighlightMenu";
import AiStatusBadge from "@/components/AiStatusBadge";
import { requestAiAction, type AiAction } from "@/lib/aiActions";
import { calloutColors } from "@/lib/colors";
import { cssVarForFont, type NoteFontId } from "@/lib/fonts";
import { useVault } from "@/lib/vaultContext";

// Largura máxima confortável de leitura — o texto reflui dentro dessa coluna
// (com margem automática nas laterais quando a tela é mais larga que isso),
// nunca ultrapassando a largura de fato disponível no container.
const READING_COLUMN_WIDTH = 700;

// Lê as cores do tema ativo do app (variáveis CSS em globals.css) direto do
// DOM — única fonte de verdade, em vez de duplicar os valores aqui. Usado
// pra sobrescrever a cor de texto/fundo do CSS embutido no EPUB (cada livro
// traz o seu, tipicamente pensado pra fundo branco) sem mexer em nenhuma
// outra formatação (itálico, negrito, alinhamento, tamanho de título).
function getReadingColors() {
  const styles = getComputedStyle(document.documentElement);
  const foreground = styles.getPropertyValue("--foreground").trim() || "#e8ddc9";
  const background = styles.getPropertyValue("--background").trim() || "#1c1a17";
  const panelHover = styles.getPropertyValue("--panel-hover").trim() || "#2f2a23";
  return { foreground, background, panelHover };
}

// cssVarForFont devolve "var(--font-lora)" — útil como valor CSS no
// document PAI, mas variáveis CSS não atravessam pro document do iframe do
// capítulo (mesma razão de getReadingColors acima), então aqui resolvemos
// pro valor de verdade (a lista de fontes de fallback que next/font gerou)
// antes de injetar no tema do rendition.
function getReadingFontFamily(fontId: NoteFontId): string {
  const varName = cssVarForFont(fontId).match(/--[\w-]+/)?.[0] ?? "--font-lora";
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || "inherit";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyReadingTheme(rendition: any, fontId: NoteFontId, fontSize: number) {
  const { foreground, background, panelHover } = getReadingColors();
  const fontFamily = getReadingFontFamily(fontId);
  rendition.themes.default({
    body: {
      "max-width": `${READING_COLUMN_WIDTH}px !important`,
      margin: "0 auto !important",
      padding: "0 1.25rem !important",
      "box-sizing": "border-box !important",
      background: `${background} !important`,
      // Tamanho BASE, forçado só aqui (não em "*" abaixo) — headings/etc de
      // um EPUB comum usam unidades relativas (em/rem) próprias, então esse
      // !important garante que ESTE valor vence qualquer "body{font-size}"
      // do próprio livro, mas a proporção dos títulos continua cascateando
      // normalmente a partir dele (um h1{font-size:2em} do livro resolve
      // relativo a este valor, "!important" ou não — só achataria a
      // hierarquia se estivéssemos forçando o tamanho em "*" também, o que
      // deliberadamente não fazemos).
      "font-size": `${fontSize}px !important`,
    },
    // "*" (não só "body") porque um EPUB comum define cor/fonte/tamanho
    // explícito em elementos específicos (p, span, h1...) — uma regra só em
    // "body" perderia pra essas por herança sempre vencer nenhuma pra
    // qualquer estilo aplicado direto no elemento, mesmo sem !important do
    // lado do livro. Só a COR e a FAMÍLIA da fonte forçadas aqui — nunca o
    // tamanho, pra não achatar a hierarquia de títulos do livro.
    "*": {
      color: `${foreground} !important`,
      "font-family": `${fontFamily} !important`,
    },
    // Seleção nativa do navegador — sem isso, o fundo padrão (geralmente um
    // azul claro do sistema) some contra o texto claro forçado no tema
    // escuro pela regra "*" acima (texto claro sobre fundo claro = quase
    // invisível). --panel-hover é o mesmo par usado pra isso no editor
    // CodeMirror das notas .md, resolvido aqui pro valor real (variáveis CSS
    // não atravessam pro documento do iframe do capítulo).
    "::selection": {
      background: `${panelHover} !important`,
      color: `${foreground} !important`,
    },
    // Muitos EPUBs acadêmicos usam <a> pra referências/notas de rodapé no
    // meio do parágrafo (às vezes sem destino nenhum, só semântica), sem
    // depender de sublinhado pra isso — a aparência real pretendida (itálico,
    // cor normal, já coberta pela regra "*" acima) vem do próprio texto/CSS
    // do livro. Sem isso, o sublinhado padrão do navegador pra <a> conflita
    // visualmente com esse itálico, parecendo um link clicável que não existe.
    a: {
      "text-decoration": "none !important",
    },
    // Marcador de comentário ancorado (ver rendition.annotations.mark em
    // attachMark) — o epub.js cria um <a ref="epubjs-mk"> posicionado
    // absoluto no fim do trecho; estilizamos ele pra ficar igual ao
    // marcador circular que os comentários ancorados de .md já têm
    // (CommentMarkerWidget, em livePreview.ts).
    'a[ref="epubjs-mk"]': {
      display: "inline-block !important",
      width: "13px !important",
      height: "13px !important",
      "border-radius": "50% !important",
      background: `${calloutColors.ia} !important`,
      border: `1.5px solid ${background} !important`,
      cursor: "pointer !important",
      "vertical-align": "text-top !important",
    },
  });
}

type Props = {
  filename: string;
  theme: "dark" | "light";
  // Mesmo sistema (global + override por arquivo) já usado nas notas .md —
  // ver fonts.ts e page.tsx (fontSizeFor/noteFontFor). Aplicado ao CONTEÚDO
  // do livro via rendition.themes (ver applyReadingTheme), não como estilo
  // React normal, já que o texto vive dentro do iframe de cada capítulo.
  fontSize: number;
  noteFont: NoteFontId;
  // Número do capítulo (1-based, pela ordem natural do spine) de destino de
  // um link "[[arquivo#cap3]]" clicado — repassado pro epub.js abrir direto
  // no início desse capítulo (ver resolveChapterHref/rendition.display abaixo).
  // EPUB não tem página fixa (o texto reflui), por isso a navegação/link é
  // por capítulo, não por página como no PDF.
  initialChapter?: number;
  // Chamado quando um marcador de comentário ancorado (ver acima) é clicado
  // — NotePanel.tsx reusa o mesmo estado que já abre/rola o painel de
  // comentários pro marcador de .md.
  onMarkerClick?: (commentId: number) => void;
  // Só passados pra livro do Calibre — ver PdfNativeViewer.tsx (mesmo
  // espírito). calibreId roteia os comentários ancorados auto-contidos
  // (gerados pelas ações de IA) pras rotas /api/calibre/book-comments em vez
  // de /api/book-comments.
  sourceUrl?: string;
  linkLabel?: string;
  calibreId?: number;
  // Espelha a posição atual (ex: "Capítulo 3 de 12") pra fora — quem monta
  // este componente (NotePanel.tsx) mostra esse texto na linha compacta do
  // cabeçalho, em vez deste componente renderizar sua própria linha.
  onPositionChange?: (label: string) => void;
  // Clique/tecla dentro do conteúdo do livro (iframe próprio, ver comentário
  // grande sobre rendition.hooks.content.register abaixo) — um clique ali
  // NUNCA borbulha pro document externo (isolamento normal de iframe), então
  // popups flutuantes fora deste componente que fecham "ao clicar fora"
  // escutando o document de fora (ex: o menu de tipo de comentário em
  // BookCommentsPanel.tsx) nunca veriam um clique que caiu em cima do
  // conteúdo do livro sem este retransmissor.
  onContentInteraction?: () => void;
  // Clique em "Traduzir" no menu de seleção — pede pro pai (NotePanel.tsx)
  // abrir/reabastecer o painel lateral de tradução com este trecho.
  onOpenTranslate?: (texto: string) => void;
  // Toda seleção finalizada (rendition.on("selected")), independente de
  // abrir ou não o menu de IA — o pai decide se age (só se o painel de
  // tradução já estiver aberto, ver scheduleTranslateUpdate).
  onSelectionChange?: (texto: string) => void;
};

export type EpubViewerHandle = {
  // Navega o rendition JÁ MONTADO pra uma posição precisa (CFI) sem
  // remontar — usado pelo "Ir para o trecho" de um comentário ancorado de
  // IA no painel de comentários.
  goToCfi: (cfi: string) => void;
  // Extrai o texto do livro INTEIRO (todos os capítulos), pro chat com IA
  // (escopo "Esta nota") — não monta a rendition visual pra isso, só carrega
  // cada seção do spine sob demanda. Não trunca sozinho: quem decide o que
  // fazer com um resultado grande demais é o ChatPanel.
  getFullText: () => Promise<string>;
  // Só o capítulo atualmente aberto — alternativa mais leve quando o livro
  // inteiro excede o limite de contexto do chat.
  getCurrentChapterText: () => Promise<string>;
  // Copia "[[livro#capN]]" do capítulo atual — chamado pelo menu "⋯" de
  // NotePanel.tsx (o botão "Copiar link" não vive mais dentro deste
  // componente, ver cabeçalho compacto).
  copyCurrentLink: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extractSectionText(section: any, request: (path: string) => Promise<unknown>): Promise<string> {
  const doc = await section.load(request);
  const root = (doc?.querySelector?.("body") as Element | null) ?? doc;
  const text = ((root?.textContent as string | undefined) ?? "").replace(/\s+/g, " ").trim();
  section.unload();
  return text;
}

// Comentários ancorados a um trecho (gerados pelas ações de IA — resumir/
// explicar/perguntas, ver HighlightMenu/aiActions.ts) usam a API de
// anotações do próprio epub.js (rendition.annotations.mark), que já resolve
// certinho o problema de "achar a posição de volta depois que o layout
// muda" — não precisamos reimplementar isso.
//
// Seleção/cópia de texto nativa continua funcionando (ver histórico abaixo);
// a novidade é que agora TAMBÉM escutamos rendition.on("selected", ...) — um
// evento de alto nível que o próprio epub.js expõe (debounced 250ms
// internamente, só LÊ a seleção via getSelection(), nunca a reseta) — seguro,
// não é o mesmo listener problemático removido antes.
//
// Histórico: havia um listener de seleção antes (pra abrir o menu de
// marcação), e ele interferia com o arraste de seleção normal (a cada
// mudança de seleção, inclusive em pleno arraste, ele lia e IMEDIATAMENTE
// zerava a seleção nativa via `getSelection().removeAllRanges()`, fazendo a
// seleção "não completar" direito). Removendo esse listener, selecionar e
// copiar (Ctrl+C ou clique direito) passou a funcionar como em qualquer
// página normal — e continua funcionando agora, porque o novo listener
// (rendition.on("selected")) nunca toca na seleção, só lê.
const EpubViewer = forwardRef<EpubViewerHandle, Props>(function EpubViewer(
  {
    filename,
    theme,
    fontSize,
    noteFont,
    initialChapter,
    onMarkerClick,
    sourceUrl,
    linkLabel,
    calibreId,
    onPositionChange,
    onContentInteraction,
    onOpenTranslate,
    onSelectionChange,
  },
  ref
) {
  const { vaultId, vaultFetch } = useVault();
  const [aiMenu, setAiMenu] = useState<{ x: number; y: number; cfiRange: string; texto: string } | null>(null);
  const [aiStatus, setAiStatus] = useState<{ x: number; y: number; state: "loading" | "error"; message?: string } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renditionRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookRef = useRef<any>(null);
  // Número do capítulo atual (1-based) — usado só pelo botão "Copiar link
  // deste capítulo" (não é estado porque muda a cada rolagem/página e não
  // afeta renderização).
  const currentChapterRef = useRef<number | null>(null);
  const onMarkerClickRef = useRef(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;
  const onPositionChangeRef = useRef(onPositionChange);
  onPositionChangeRef.current = onPositionChange;
  const onContentInteractionRef = useRef(onContentInteraction);
  onContentInteractionRef.current = onContentInteraction;
  const onOpenTranslateRef = useRef(onOpenTranslate);
  onOpenTranslateRef.current = onOpenTranslate;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  useImperativeHandle(ref, () => ({
    goToCfi(cfi: string) {
      renditionRef.current?.display(cfi);
    },
    async getFullText() {
      const book = bookRef.current;
      if (!book) return "";
      await book.ready;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sections: any[] = [];
      book.spine.each((section: unknown) => sections.push(section));
      const parts: string[] = [];
      for (const section of sections) {
        const text = await extractSectionText(section, book.load.bind(book));
        if (text) parts.push(text);
      }
      return parts.join("\n\n");
    },
    async getCurrentChapterText() {
      const book = bookRef.current;
      if (!book) return "";
      await book.ready;
      const chapter = currentChapterRef.current ?? 1;
      const section = book.spine.get(chapter - 1);
      if (!section) return "";
      return extractSectionText(section, book.load.bind(book));
    },
    copyCurrentLink() {
      if (!currentChapterRef.current) return;
      navigator.clipboard.writeText(`[[${linkLabel ?? filename}#cap${currentChapterRef.current}]]`);
    },
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function resolveChapterHref(book: any, chapter: number): string | undefined {
    return book?.spine?.get(chapter - 1)?.href ?? undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function attachMark(rendition: any, id: number, cfi: string) {
    rendition.annotations.mark(cfi, { commentId: id }, () => onMarkerClickRef.current?.(id));
  }

  async function handleAiAction(action: AiAction) {
    if (!aiMenu) return;
    const { cfiRange, texto } = aiMenu;
    const badgePos = { x: aiMenu.x, y: aiMenu.y };
    setAiMenu(null);
    setAiStatus({ ...badgePos, state: "loading" });

    try {
      const resultado = await requestAiAction(action, texto);
      const res =
        calibreId !== undefined
          ? await fetch("/api/calibre/book-comments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ calibreId, tipo: "ia", comment: resultado, anchorCfi: cfiRange, anchorText: texto }),
            })
          : await vaultFetch("/api/book-comments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                filename,
                anchored: true,
                tipo: "ia",
                comment: resultado,
                anchorCfi: cfiRange,
                anchorText: texto,
              }),
            });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Não foi possível salvar o comentário");
      if (renditionRef.current && data.comment?.id) {
        attachMark(renditionRef.current, data.comment.id, cfiRange);
      }
      setAiStatus(null);
    } catch (err) {
      setAiStatus({ ...badgePos, state: "error", message: err instanceof Error ? err.message : "Erro ao gerar com IA" });
      setTimeout(() => setAiStatus(null), 3000);
    }
  }

  // Clique em "Traduzir" — diferente de handleAiAction, não faz nada aqui
  // além de avisar o pai (NotePanel.tsx), que é quem possui o painel lateral
  // de tradução e a lógica de buscar/atualizar (ver onOpenTranslate acima).
  function handleTranslate() {
    if (!aiMenu) return;
    const { texto } = aiMenu;
    setAiMenu(null);
    onOpenTranslateRef.current?.(texto);
  }

  useEffect(() => {
    let cancelled = false;
    let book: ReturnType<typeof import("epubjs").default> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let resizeDebounce: ReturnType<typeof setTimeout> | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contentCloseListeners: { contents: any; type: "mousedown" | "keydown" | "mouseup"; handler: (e: Event) => void }[] = [];

    (async () => {
      const container = containerRef.current;
      const viewerEl = viewerRef.current;
      if (!container || !viewerEl) return;

      // Espera o container ter uma largura de verdade antes de montar — o
      // epub.js precisa de um tamanho em pixel logo de cara; montar com 0px
      // (ou "100%" sem um layout já resolvido) é a causa do bug de largura
      // maior que a tela / coluna cortada.
      const waitForSize = () =>
        new Promise<{ width: number; height: number }>((resolve) => {
          const check = () => {
            const { width, height } = container.getBoundingClientRect();
            if (width > 0 && height > 0) resolve({ width, height });
            else requestAnimationFrame(check);
          };
          check();
        });
      const initialSize = await waitForSize();
      if (cancelled) return;

      const EpubMod = (await import("epubjs")).default;
      if (cancelled) return;

      // "openAs: epub" força o epub.js a tratar a URL como um arquivo .epub
      // compactado — sem isso, ele tenta adivinhar o tipo pela EXTENSÃO NO
      // CAMINHO da URL (ver determineType em epubjs/src/book.js), e nossa
      // rota tem o nome do arquivo só na query string (?filename=...), nunca
      // no path; sem essa opção, a extensão detectada fica vazia e o epub.js
      // cai no modo "directory" (tenta buscar META-INF/container.xml relativo
      // à URL, 404), nunca chegando a abrir o livro de verdade.
      book = EpubMod(
        sourceUrl ?? `/api/note/file?filename=${encodeURIComponent(filename)}&vault=${encodeURIComponent(vaultId)}`,
        { openAs: "epub" }
      );
      bookRef.current = book;
      const rendition = book.renderTo(viewerEl, {
        width: initialSize.width,
        height: initialSize.height,
        flow: "scrolled",
        manager: "continuous",
        spread: "none",
      });
      renditionRef.current = rendition;

      // Coluna de leitura confortável, centralizada, nunca maior que o espaço
      // disponível, e cor de texto/fundo seguindo o tema ativo do app (ver
      // applyReadingTheme) — o CSS embutido no próprio EPUB (cada livro traz
      // o seu) é injetado antes da nossa folha de estilo e, sem "!important",
      // um simples "body { max-width }"/cor do livro já venceria por ordem de
      // origem.
      applyReadingTheme(rendition, noteFont, fontSize);

      // Fecha o menu de IA ao clicar dentro do conteúdo do EPUB sem gerar
      // uma seleção nova, ou ao apertar ESC com o foco lá dentro — cliques e
      // teclas lá dentro não borbulham pro document externo (iframe), então
      // o outside-click/ESC padrão do HighlightMenu (que escuta o document
      // de fora) não alcançaria isso sozinho. Só fecha o menu, nunca mexe na
      // seleção em si (diferente do listener antigo removido).
      //
      // Precisa ser registrado ANTES de rendition.display() — hooks.content
      // só disparam pra views renderizadas DEPOIS do registro (mesmo padrão
      // que os hooks internos do próprio epub.js usam, todos registrados no
      // construtor da Rendition, antes de qualquer display()). Registrar
      // depois faria o primeiro capítulo (já renderizado por display())
      // nunca ganhar esses listeners, e clicar nele ou apertar ESC lá pra
      // fechar o menu não funcionaria.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rendition.hooks.content.register((contents: any) => {
        const mouseHandler = () => {
          setAiMenu(null);
          onContentInteractionRef.current?.();
        };
        const keyHandler = (e: Event) => {
          if ((e as KeyboardEvent).key === "Escape") {
            setAiMenu(null);
            onContentInteractionRef.current?.();
          }
        };
        contents.document.addEventListener("mousedown", mouseHandler);
        contents.document.addEventListener("keydown", keyHandler);
        contentCloseListeners.push({ contents, type: "mousedown", handler: mouseHandler });
        contentCloseListeners.push({ contents, type: "keydown", handler: keyHandler });
      });

      await book.ready;
      if (cancelled) return;
      const initialHref = initialChapter ? resolveChapterHref(book, initialChapter) : undefined;
      await rendition.display(initialHref);
      if (cancelled) return;

      // O manager "continuous" do epub.js, por padrão, destrói (trim) capítulos
      // que saem da janela de leitura e, ao remover um capítulo ACIMA da posição
      // atual, chama scrollTo(prevTop - bounds.height) pra compensar a altura
      // removida — tudo isso num setTimeout de 250ms, sem nenhuma ação do
      // usuário. Se a altura real do capítulo mudar entre a medição e a
      // remoção (ex: uma imagem que ainda estava carregando termina de
      // carregar nesse intervalo), a compensação erra por essa diferença e a
      // rolagem "pula" sozinha — pra frente ou pra trás, sem padrão aparente.
      // Essa é a causa do bug relatado (scroll pulando sozinho, mesmo parado
      // só lendo). Desativamos o trim: os capítulos já visitados continuam no
      // DOM (custo de memória aceitável pro tamanho típico dos livros aqui),
      // e a rolagem deixa de ser mexida por código nenhum além do próprio
      // scroll nativo do usuário.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const manager = (rendition as any).manager;
      if (manager) manager.trim = () => Promise.resolve();

      rendition.on("relocated", (location: { start: { index: number } }) => {
        const chapterNumber = location.start.index + 1;
        const total = (book!.spine as unknown as { length: number }).length;
        currentChapterRef.current = chapterNumber;
        onPositionChangeRef.current?.(`Capítulo ${chapterNumber} de ${total}`);
      });

      // Seleção de texto finalizada — evento de alto nível do próprio
      // epub.js (seguro, só lê a seleção, nunca a reseta). Abre o menu com
      // as ações disponíveis (destaque/comentar não se aplicam ao EPUB, só
      // IA e tradução).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rendition.on("selected", (cfiRange: string, contents: any) => {
        const selection = contents.window?.getSelection?.();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
        const texto = selection.toString();
        if (!texto.trim()) return;
        onSelectionChangeRef.current?.(texto);
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const iframe = contents.document?.defaultView?.frameElement as HTMLIFrameElement | undefined;
        const iframeRect = iframe?.getBoundingClientRect();
        const x = (iframeRect?.left ?? 0) + rect.left;
        const y = (iframeRect?.top ?? 0) + rect.bottom + 6;
        setAiMenu({ x, y, cfiRange, texto });
      });

      // Marcadores de comentários ancorados já existentes (gerados em
      // sessões anteriores) — o epub.js anexa automaticamente conforme cada
      // capítulo é renderizado (hook interno já embutido em
      // rendition.annotations), não precisa reanexar ao trocar de capítulo.
      try {
        const res =
          calibreId !== undefined
            ? await fetch(`/api/calibre/book-comments?calibreId=${calibreId}`)
            : await vaultFetch(`/api/book-comments?filename=${encodeURIComponent(filename)}`);
        const data = await res.json();
        if (cancelled) return;
        const anchored = (data.comments ?? []).filter(
          (c: { anchorCfi?: string | null }) => c.anchorCfi
        ) as { id: number; anchorCfi: string }[];
        for (const c of anchored) {
          attachMark(rendition, c.id, c.anchorCfi);
        }
      } catch {
        // Sem marcadores existentes não é fatal — a leitura continua normal.
      }

      // Redimensiona ao vivo (sem recriar o rendition) quando o painel muda de
      // tamanho — ex: abrir/fechar o painel de comentários, ou a janela toda.
      let lastSize = { width: initialSize.width, height: initialSize.height };
      resizeObserver = new ResizeObserver(() => {
        const { width, height } = container.getBoundingClientRect();
        if (width <= 0 || height <= 0) return;
        if (Math.abs(width - lastSize.width) <= 1 && Math.abs(height - lastSize.height) <= 1) return;

        // Só chama rendition.resize() (que faz um clear()+updateLayout()
        // completo, internamente) depois que o tamanho parar de mudar por um
        // instante — o painel de comentários abre/fecha com uma transição CSS
        // de largura (~220ms), e o ResizeObserver dispara em VÁRIOS frames
        // intermediários dessa animação. Chamar resize() a cada frame dispara
        // vários clear()+updateLayout() sobrepostos (o anterior ainda rodando
        // quando o próximo começa), e o resultado incompleto podia deixar o
        // conteúdo do EPUB largo demais pra área real disponível — foi o que
        // causava o EPUB abrir "pra fora da página" a primeira vez que o
        // painel era aberto (só normalizava ao trocar de livro, que remonta o
        // visualizador já com o tamanho final, sem transição no meio).
        if (resizeDebounce) clearTimeout(resizeDebounce);
        resizeDebounce = setTimeout(() => {
          const settled = container.getBoundingClientRect();
          if (settled.width <= 0 || settled.height <= 0) return;
          lastSize = { width: settled.width, height: settled.height };
          rendition.resize(settled.width, settled.height);
        }, 260);
      });
      resizeObserver.observe(container);
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (resizeDebounce) clearTimeout(resizeDebounce);
      contentCloseListeners.forEach(({ contents, type, handler }) => {
        contents.document?.removeEventListener(type, handler);
      });
      renditionRef.current?.destroy?.();
      book?.destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename, vaultId]);

  // Pula pra um novo capítulo (outro link "[[arquivo#cap...]]" clicado) sem
  // recriar o rendition inteiro — a montagem acima só reage a troca de
  // arquivo; isso cobre o caso de continuar no MESMO arquivo já aberto.
  useEffect(() => {
    if (!initialChapter || !bookRef.current) return;
    const href = resolveChapterHref(bookRef.current, initialChapter);
    if (href) renditionRef.current?.display(href);
  }, [initialChapter]);

  // Reaplica cores/fonte/tamanho de leitura (sem recriar o rendition) quando
  // o tema do app muda (claro/escuro) ou a pessoa troca fonte/tamanho no
  // menu "⋯" — getReadingColors()/getReadingFontFamily() leem o valor atual
  // das variáveis CSS, então só precisamos disparar a reaplicação de novo.
  useEffect(() => {
    if (renditionRef.current) applyReadingTheme(renditionRef.current, noteFont, fontSize);
  }, [theme, noteFont, fontSize]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div ref={containerRef} style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div ref={viewerRef} style={{ flex: 1, minHeight: 0, minWidth: 0 }} />
      </div>

      {aiMenu && (
        <HighlightMenu
          x={aiMenu.x}
          y={aiMenu.y}
          onAiAction={handleAiAction}
          onTranslate={handleTranslate}
          onClose={() => setAiMenu(null)}
        />
      )}
      {aiStatus && <AiStatusBadge x={aiStatus.x} y={aiStatus.y} state={aiStatus.state} message={aiStatus.message} />}
    </div>
  );
});

export default EpubViewer;
