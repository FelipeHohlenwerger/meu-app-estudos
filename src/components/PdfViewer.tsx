"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask, TextLayer as PdfTextLayer } from "pdfjs-dist";
import { useVault } from "@/lib/vaultContext";
import HighlightMenu from "@/components/HighlightMenu";

type Props = {
  filename: string;
  // Só passado pra livro do Calibre — substitui a URL vault-relativa que
  // este componente construiria sozinho a partir de filename/vaultId (mesmo
  // significado de sourceUrl em EpubViewer.tsx).
  sourceUrl?: string;
  // Só lida na montagem (como initialCfi em EpubViewer.tsx) — navegação
  // subsequente pro MESMO arquivo já aberto é sempre via goToPage (ver
  // PdfViewerHandle), nunca remontagem.
  initialPage?: number;
  theme: "dark" | "light";
  // Página mais visível, debounced ~400ms depois do scroll assentar — nunca
  // durante o movimento em si (ver Observer B / mostVisiblePageRef). Chamado
  // também, sem debounce, em navegação deliberada (goToPage).
  onPageChange?: (page: number) => void;
  onDocumentLoaded?: (numPages: number) => void;
  onZoomChange?: (scalePercent: number) => void;
  onError?: (message: string) => void;
  // Espelham onSelectionChange/onOpenTranslate de EpubViewer.tsx — mesmo
  // contrato, mesmo dono (NotePanel.tsx passa as MESMAS funções
  // scheduleTranslateUpdate/openTranslatePanel pros dois visualizadores, sem
  // nenhuma diferença de wiring entre PDF e EPUB do lado de fora).
  // onSelectionChange dispara a cada seleção finalizada (mouseup) — o pai só
  // age se o painel de tradução já estiver aberto (auto-tradução debounced).
  // onOpenTranslate dispara só no clique em "Traduzir" do menu flutuante
  // local — abre o painel e traduz imediatamente, sem debounce.
  onSelectionChange?: (texto: string) => void;
  onOpenTranslate?: (texto: string) => void;
};

export type PdfViewerHandle = {
  goToPage: (page: number) => void;
  // Pula pro próximo/anterior nível de PDF_ZOOM_LEVELS (não incremento
  // livre) — usados pelos botões −/+ do cabeçalho.
  zoomIn: () => void;
  zoomOut: () => void;
  // Valor livre, arbitrário (clampado a [MIN_ZOOM_PERCENT, MAX_ZOOM_PERCENT])
  // — usado pelo campo "%" editável do cabeçalho, pros casos em que os
  // níveis fixos não atendem.
  setZoomPercent: (percent: number) => void;
};

// Concorrência de rasterização — page.render() é CPU-bound, mais que isso
// não ajuda e pode travar a thread principal.
const MAX_CONCURRENT_RENDERS = 2;
// Debounce do relatório de "página atual" (Observer B) — pedido: 300-500ms
// depois do scroll assentar, nunca a cada página intermediária durante o
// movimento.
const PAGE_REPORT_DEBOUNCE_MS = 400;
// Margem de pré-renderização (Observer A) — ~2 alturas de viewport acima/
// abaixo, o bastante pra evitar canvas em branco (pop-in) numa rolagem em
// velocidade normal, sem renderizar o documento inteiro de uma vez.
const RENDER_WINDOW_MARGIN = "200% 0px 200% 0px";
const MIN_SCALE = 0.2;
const MAX_BASE_SCALE = 3;
// Níveis fixos que zoomIn/zoomOut percorrem (pulo pro próximo/anterior da
// lista, não incremento livre) — export porque NotePanel.tsx usa os
// extremos pra desabilitar os botões −/+ no cabeçalho nos limites da lista,
// mesmo espírito do desabilitar das setas ‹/› de página nos limites do
// documento. Valor livre (fora da lista) ainda é possível via
// setZoomPercent — ver campo "%" editável no cabeçalho.
export const PDF_ZOOM_LEVELS = [50, 75, 100, 125, 150, 200];
// Faixa do campo de zoom livre (setZoomPercent) — mais folgada que os
// extremos de PDF_ZOOM_LEVELS, pra cobrir valores digitados fora da lista
// fixa (ex: "250%") sem deixar a escala de renderização degenerar.
const MIN_ZOOM_PERCENT = 40;
const MAX_ZOOM_PERCENT = 300;

// window.getSelection().toString() sobre a TextLayer vem quebrado por
// LINHA VISUAL da página (pdf.js insere um <br> a cada salto de posição Y
// detectado no texto original, ver hasEOL em pdf.js/src/display/text_layer.
// js) — não por frase. Sem nenhuma informação estrutural de parágrafo
// disponível na própria seleção, a única forma de diferenciar "quebra de
// linha por justificação" (deve virar espaço) de "quebra de parágrafo de
// verdade" (deve ser preservada) é heurística, baseada em pontuação/
// capitalização ao redor da quebra — imperfeita por natureza (mesma
// limitação de qualquer extrator de texto de PDF), mas cobre o caso comum.
function normalizeSelectedPdfText(raw: string): string {
  const lines = raw.split("\n");
  let result = lines[0] ?? "";
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      // Linha em branco na seleção — parágrafo vazio de verdade, preserva.
      result = `${result.trimEnd()}\n\n`;
      continue;
    }
    if (result.endsWith("\n\n")) {
      // Logo depois de uma quebra de parágrafo preservada acima — começa
      // um parágrafo novo, sem passar pelo trimEnd()/junção abaixo (que
      // apagaria a quebra dupla que acabamos de gravar).
      result += line;
      continue;
    }
    // Hifenização de quebra de linha: palavra cortada no fim da linha
    // anterior (minúscula + hífen) continuando em minúscula na próxima —
    // junta sem hífen e sem espaço. Não dá pra distinguir isso de um hífen
    // "de verdade" (palavra composta) só pelo texto — heurística assumida
    // aceitável (mesmo espírito do resto desta função).
    if (/\p{Ll}-$/u.test(result) && /^\p{Ll}/u.test(line)) {
      result = result.slice(0, -1) + line;
      continue;
    }
    const prevTrimmed = result.trimEnd();
    // Linha anterior termina em pontuação de fim de frase E a próxima
    // começa maiúscula/aspas/parêntese — provável quebra de parágrafo de
    // verdade, preserva como quebra.
    if (/[.!?:]["')\]]?$/.test(prevTrimmed) && /^[\p{Lu}"'(]/u.test(line)) {
      result = `${prevTrimmed}\n${line}`;
      continue;
    }
    // Caso padrão: quebra de linha por posição na página (justificação),
    // não por sentença — vira espaço.
    result = `${prevTrimmed} ${line.trimStart()}`;
  }
  return result.replace(/[ \t]+/g, " ").trim();
}

type PageDims = { width: number; height: number };

const PdfViewer = forwardRef<PdfViewerHandle, Props>(function PdfViewer(
  { filename, sourceUrl, initialPage, theme, onPageChange, onDocumentLoaded, onZoomChange, onError, onSelectionChange, onOpenTranslate },
  ref
) {
  const { vaultId } = useVault();

  const [numPages, setNumPages] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Menu flutuante mínimo (só "Traduzir", via HighlightMenu) mostrado sobre
  // uma seleção de texto recém-finalizada — mesmo papel do estado "aiMenu"
  // de EpubViewer.tsx, mas sem ações de IA (fora do escopo desta tarefa).
  const [translateMenu, setTranslateMenu] = useState<{ x: number; y: number; texto: string } | null>(null);

  // Props de callback espelhadas em refs a cada render — mesmo padrão de
  // EpubViewer.tsx — pra observers/efeitos assíncronos sempre chamarem a
  // versão mais recente sem precisar re-configurar tudo.
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const onDocumentLoadedRef = useRef(onDocumentLoaded);
  onDocumentLoadedRef.current = onDocumentLoaded;
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onOpenTranslateRef = useRef(onOpenTranslate);
  onOpenTranslateRef.current = onOpenTranslate;

  // wrapperRef nunca é o elemento de scroll em si — só existe pra ser
  // medido (getBoundingClientRect), puro box de layout flex (flex:1,
  // minHeight:0, sem overflow). scrollContainerRef é quem realmente rola
  // e é a raiz dos IntersectionObservers — ver comentário grande no JSX
  // de render sobre por que ele recebe altura em PIXEL explícita (via JS,
  // medida a partir de wrapperRef), não só `flex:1` puro.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLibRef = useRef<any>(null);

  // Dimensões da página em escala 1 (independente de zoom) — usadas pra
  // recalcular altura/largura de cada placeholder sem precisar reabrir o
  // documento a cada mudança de zoom/resize.
  const pageDimsRef = useRef<(PageDims | null)[]>([]);
  const pageElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasElsRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const textLayerElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const renderTasksRef = useRef<Map<number, RenderTask>>(new Map());
  const textLayersRef = useRef<Map<number, PdfTextLayer>>(new Map());
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const renderQueueRef = useRef<Set<number>>(new Set());
  const activeRendersRef = useRef(0);

  const visibilityRef = useRef<Map<number, number>>(new Map());
  const mostVisiblePageRef = useRef(1);
  const pageReportDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const numPagesRef = useRef<number | null>(null);
  // Escala "fit to width" recalculada a cada resize; escala final = essa
  // base × zoomPercentRef/100 (zoom é relativo à base, não absoluto — assim
  // redimensionar o painel não briga com um zoom manual já aplicado).
  const baseScaleRef = useRef(1);
  const zoomPercentRef = useRef(100);
  const scaleRef = useRef(1);

  const cancelledRef = useRef(false);
  const observerARef = useRef<IntersectionObserver | null>(null);
  const observerBRef = useRef<IntersectionObserver | null>(null);

  function freePage(n: number) {
    const task = renderTasksRef.current.get(n);
    if (task) {
      try {
        task.cancel();
      } catch {
        // esperado quando cancelamos nós mesmos — RenderingCancelledException
      }
      renderTasksRef.current.delete(n);
    }
    renderQueueRef.current.delete(n);
    renderedPagesRef.current.delete(n);
    const canvas = canvasElsRef.current.get(n);
    // Trick padrão pra descartar a memória do bitmap decodificado sem um
    // round-trip de clearRect+redraw — o <div>/<canvas> em si continuam no
    // DOM (baratos), só o bitmap caro é liberado.
    if (canvas) canvas.width = canvas.width;

    // Mesmo ciclo de vida do canvas: a TextLayer sai junto quando a página
    // sai da janela de renderização — cancela (se ainda renderizando) e
    // limpa os spans, o <div class="textLayer"> em si continua no DOM.
    const textLayer = textLayersRef.current.get(n);
    if (textLayer) {
      try {
        textLayer.cancel();
      } catch {
        // esperado
      }
      textLayersRef.current.delete(n);
    }
    const textLayerEl = textLayerElsRef.current.get(n);
    if (textLayerEl) textLayerEl.replaceChildren();
  }

  async function renderPage(n: number) {
    if (cancelledRef.current) return;
    const pdfDoc = pdfDocRef.current;
    const canvas = canvasElsRef.current.get(n);
    if (!pdfDoc || !canvas) return;
    try {
      const page = await pdfDoc.getPage(n);
      if (cancelledRef.current) return;
      const viewport = page.getViewport({ scale: scaleRef.current });

      const dimsAtScale1 = { width: viewport.width / scaleRef.current, height: viewport.height / scaleRef.current };
      const prev = pageDimsRef.current[n - 1];
      if (!prev || prev.width !== dimsAtScale1.width || prev.height !== dimsAtScale1.height) {
        pageDimsRef.current[n - 1] = dimsAtScale1;
        const pageEl = pageElsRef.current.get(n);
        if (pageEl) {
          pageEl.style.width = `${viewport.width}px`;
          pageEl.style.height = `${viewport.height}px`;
        }
      }

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // `canvas: null` + `canvasContext` (não o `canvas` recomendado na
      // API nova) de propósito — já aplicamos o scale de DPR manualmente
      // via ctx.setTransform acima; misturar os dois parâmetros arriscaria
      // o pdf.js aplicar sua própria lógica de canvas por cima da nossa.
      const renderTask = page.render({ canvas: null, canvasContext: ctx, viewport });
      renderTasksRef.current.set(n, renderTask);

      // Camada de texto selecionável — construída junto com o canvas, mesmo
      // gatilho/janela de renderização (Observer A), pra texto e bitmap
      // aparecerem juntos sem lag perceptível a mais. A geometria que o
      // pdf.js calcula pros spans é em unidades BRUTAS de página (não em
      // pixels finais) — por isso --total-scale-factor precisa ser setado
      // pra escala atual (ver comentário grande em globals.css/.textLayer),
      // senão o texto fica desalinhado/no tamanho errado por cima do canvas.
      const pdfjsLib = pdfjsLibRef.current;
      const textLayerEl = textLayerElsRef.current.get(n);
      let textLayerPromise: Promise<unknown> = Promise.resolve();
      if (pdfjsLib && textLayerEl) {
        textLayerEl.replaceChildren();
        textLayerEl.style.setProperty("--total-scale-factor", String(scaleRef.current));
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: page.streamTextContent(),
          container: textLayerEl,
          viewport,
        });
        textLayersRef.current.set(n, textLayer);
        textLayerPromise = textLayer.render();
      }

      await Promise.all([
        renderTask.promise,
        // cancel() da TextLayer rejeita com AbortException (não
        // RenderingCancelledException, que é só do RenderTask do canvas) —
        // mesmo caso normal de "página saiu da janela", não é erro real.
        textLayerPromise.catch((err) => {
          if (err instanceof Error && err.name === "AbortException") return;
          throw err;
        }),
      ]);
      renderTasksRef.current.delete(n);
      textLayersRef.current.delete(n);
      if (cancelledRef.current) return;
      renderedPagesRef.current.add(n);
    } catch (err) {
      renderTasksRef.current.delete(n);
      textLayersRef.current.delete(n);
      // RenderingCancelledException/AbortException é o caso normal de uma
      // página sair da janela de renderização antes de terminar — não é um
      // erro real.
      if (err instanceof Error && (err.name === "RenderingCancelledException" || err.name === "AbortException")) return;
      // Erro real numa página isolada não derruba o documento inteiro — a
      // página fica em branco e será tentada de novo se voltar a entrar na
      // janela de renderização.
    }
  }

  function kickRenderQueue() {
    while (activeRendersRef.current < MAX_CONCURRENT_RENDERS && renderQueueRef.current.size > 0) {
      const current = mostVisiblePageRef.current;
      let best: number | null = null;
      let bestDist = Infinity;
      for (const n of renderQueueRef.current) {
        const dist = Math.abs(n - current);
        if (dist < bestDist) {
          bestDist = dist;
          best = n;
        }
      }
      if (best === null) break;
      renderQueueRef.current.delete(best);
      activeRendersRef.current++;
      renderPage(best).finally(() => {
        activeRendersRef.current--;
        kickRenderQueue();
      });
    }
  }

  function enqueueRender(n: number) {
    if (renderedPagesRef.current.has(n) || renderQueueRef.current.has(n)) return;
    renderQueueRef.current.add(n);
    kickRenderQueue();
  }

  // Recalcula altura/largura de todos os placeholders na escala atual,
  // invalida o conteúdo já renderizado (está na escala errada) e pousa o
  // scroll no topo da página que estava atual antes da mudança — decisão
  // deliberada de simplicidade (não tenta preservar a fração exata de
  // scroll dentro da página): zoom/resize são ações pontuais, não contínuas
  // como o scroll de leitura, então um "snap" é um trade-off aceitável.
  function relayout() {
    scaleRef.current = baseScaleRef.current * (zoomPercentRef.current / 100);
    const n = numPagesRef.current ?? 0;
    for (let i = 0; i < n; i++) {
      const dims = pageDimsRef.current[i];
      if (!dims) continue;
      const el = pageElsRef.current.get(i + 1);
      if (el) {
        el.style.width = `${dims.width * scaleRef.current}px`;
        el.style.height = `${dims.height * scaleRef.current}px`;
      }
    }
    const current = mostVisiblePageRef.current;
    for (const pn of Array.from(renderedPagesRef.current)) freePage(pn);
    requestAnimationFrame(() => {
      const el = pageElsRef.current.get(current);
      if (el && scrollContainerRef.current) scrollContainerRef.current.scrollTop = el.offsetTop;
      for (let pn = Math.max(1, current - 2); pn <= Math.min(n, current + 2); pn++) enqueueRender(pn);
    });
    onZoomChangeRef.current?.(Math.round(zoomPercentRef.current));
  }

  useImperativeHandle(ref, () => ({
    goToPage(page: number) {
      const n = numPagesRef.current;
      const target = Math.min(Math.max(1, page), n ?? page);
      const el = pageElsRef.current.get(target);
      if (!el || !scrollContainerRef.current) return;
      if (pageReportDebounceRef.current) {
        clearTimeout(pageReportDebounceRef.current);
        pageReportDebounceRef.current = null;
      }
      scrollContainerRef.current.scrollTop = el.offsetTop;
      mostVisiblePageRef.current = target;
      onPageChangeRef.current?.(target);
    },
    zoomIn() {
      const next = PDF_ZOOM_LEVELS.find((level) => level > zoomPercentRef.current);
      if (next === undefined) return;
      zoomPercentRef.current = next;
      relayout();
    },
    zoomOut() {
      const prev = [...PDF_ZOOM_LEVELS].reverse().find((level) => level < zoomPercentRef.current);
      if (prev === undefined) return;
      zoomPercentRef.current = prev;
      relayout();
    },
    setZoomPercent(percent: number) {
      if (!Number.isFinite(percent)) return;
      zoomPercentRef.current = Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, Math.round(percent)));
      relayout();
    },
  }));

  // Montagem: carrega o documento. Efeito separado (abaixo, sobre
  // [numPages]) configura os IntersectionObservers depois que os
  // placeholders de página já existem no DOM.
  useEffect(() => {
    let cancelled = false;
    cancelledRef.current = false;
    setNumPages(null);
    setLoadError(null);
    setTranslateMenu(null);
    pageDimsRef.current = [];
    pageElsRef.current.clear();
    canvasElsRef.current.clear();
    textLayerElsRef.current.clear();
    textLayersRef.current.clear();
    renderedPagesRef.current.clear();
    renderQueueRef.current.clear();
    visibilityRef.current.clear();
    activeRendersRef.current = 0;
    mostVisiblePageRef.current = initialPage ?? 1;
    numPagesRef.current = null;
    zoomPercentRef.current = 100;

    (async () => {
      const wrapper = wrapperRef.current;
      const container = scrollContainerRef.current;
      if (!wrapper || !container) return;

      // Espera o wrapper ter um tamanho de verdade antes de calcular a
      // escala inicial "fit to width" — mesmo `waitForSize()` de
      // EpubViewer.tsx, evita o bug de largura errada por montar com 0px.
      // Mede o WRAPPER (puro box de layout flex, sem filhos, sem overflow),
      // nunca o próprio container de scroll — ver o comentário grande no
      // JSX de render sobre por que o container de scroll precisa de altura
      // em pixel EXPLÍCITA em vez de só confiar em `flex:1` puro.
      const waitForSize = () =>
        new Promise<{ width: number; height: number }>((resolve) => {
          const check = () => {
            const { width, height } = wrapper.getBoundingClientRect();
            if (width > 0 && height > 0) resolve({ width, height });
            else requestAnimationFrame(check);
          };
          check();
        });
      const { width: containerWidth, height: containerHeight } = await waitForSize();
      if (cancelled) return;
      container.style.height = `${containerHeight}px`;

      const pdfjsLib = await import("pdfjs-dist");
      if (cancelled) return;
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      pdfjsLibRef.current = pdfjsLib;

      const src = sourceUrl ?? `/api/note/file?filename=${encodeURIComponent(filename)}&vault=${encodeURIComponent(vaultId)}`;

      let bytes: ArrayBuffer;
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(String(res.status));
        bytes = await res.arrayBuffer();
      } catch {
        if (!cancelled) onErrorRef.current?.("Não foi possível carregar o PDF.");
        return;
      }
      if (cancelled) return;

      let pdfDoc: PDFDocumentProxy;
      try {
        // wasmUrl aponta pros codecs binários (JBIG2/OpenJPEG/qcms) que
        // pdfjs-dist 6.x carrega sob demanda — sem isso, TODA imagem JBIG2
        // (comum em PDF escaneado/OCR'd) falha a decodificar em silêncio
        // (warn "Unable to decode image"/"Dependent image isn't ready yet"
        // no console, sem erro visível pro usuário) e a página fica com a
        // imagem ausente pra sempre, mesmo rolando pra longe/voltando ou
        // reabrindo o arquivo — o pdf.js cacheia a falha de decodificação
        // por objeto de imagem (globalImageCache.addDecodeFailed) e nunca
        // tenta de novo. Assets copiados de node_modules/pdfjs-dist/wasm/
        // pra public/pdfjs-wasm/ em build/postinstall (mesmo padrão do
        // workerSrc acima, ver scripts/copy-pdfjs-assets.mjs).
        pdfDoc = await pdfjsLib.getDocument({ data: bytes, wasmUrl: "/pdfjs-wasm/" }).promise;
      } catch {
        if (!cancelled) onErrorRef.current?.("Arquivo PDF corrompido ou não suportado.");
        return;
      }
      if (cancelled) return;
      pdfDocRef.current = pdfDoc;

      const page1 = await pdfDoc.getPage(1);
      if (cancelled) return;
      const vp1 = page1.getViewport({ scale: 1 });
      baseScaleRef.current = Math.min(MAX_BASE_SCALE, Math.max(MIN_SCALE, containerWidth / vp1.width));
      scaleRef.current = baseScaleRef.current * (zoomPercentRef.current / 100);

      // Todas as páginas começam assumindo o tamanho da página 1 (caso
      // comum: páginas uniformes, já fica exato) — o efeito de medição em
      // segundo plano (abaixo) corrige o caso raro de tamanho misto.
      const total = pdfDoc.numPages;
      const dims1 = { width: vp1.width, height: vp1.height };
      for (let i = 0; i < total; i++) pageDimsRef.current[i] = dims1;

      numPagesRef.current = total;
      onDocumentLoadedRef.current?.(total);
      setNumPages(total);
    })();

    return () => {
      cancelled = true;
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename, sourceUrl, vaultId]);

  // Configura os dois IntersectionObservers e a medição de fundo depois que
  // os placeholders (um por página) já existem no DOM — precisa rodar
  // DEPOIS do commit do render que os criou (setNumPages acima), por isso é
  // um efeito próprio sobre [numPages], não parte do efeito de montagem.
  useEffect(() => {
    if (numPages === null) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    // Pula pra página inicial (link explícito ou posição salva, resolvidos
    // por NotePanel.tsx antes de montar este componente — ver o gate
    // "Carregando…" em NotePanel.tsx) ANTES de criar/observar com os
    // IntersectionObservers abaixo, de propósito — não depois. A primeira
    // invocação de qualquer callback de IntersectionObserver dispara de
    // forma síncrona-ish assim que `.observe()` é chamado, refletindo
    // QUALQUER QUE SEJA a posição de scroll NAQUELE INSTANTE — pular a
    // página DEPOIS faria essa primeira invocação reportar (corretamente,
    // do próprio ponto de vista dela) a página 1 (scroll ainda no topo),
    // iniciar o debounce de 400ms com esse valor ERRADO, e torcer pra uma
    // segunda invocação (depois do pulo, via requestAnimationFrame) chegar
    // a tempo de sobrescrever o timer antes dele disparar — uma corrida
    // frágil que se mostrou realmente perder às vezes na prática (bug real
    // encontrado ao testar retomada de leitura ao vivo: reabria sempre na
    // página 1, mesmo com a posição certa salva e carregada em `initialPage`
    // corretamente). Já rolar pra posição certa ANTES de observar elimina a
    // corrida de vez: a primeira invocação de cada observer já nasce
    // refletindo a página certa, não uma transitória errada esperando
    // correção. Não precisa de requestAnimationFrame aqui — os elementos já
    // têm a altura certa (de pageDimsRef) desde o primeiro render deste
    // efeito, não depende de nenhum layout assíncrono adicional.
    if (initialPage && initialPage > 1) {
      const el = pageElsRef.current.get(initialPage);
      if (el) {
        container.scrollTop = el.offsetTop;
        mostVisiblePageRef.current = initialPage;
      }
    }

    // Observer A ("janela de renderização") — margem generosa: decide quais
    // páginas ganham pixels renderizados. Observer B ("página atual") —
    // margem 0 (viewport real): decide o que reportar como posição de
    // leitura. Um observer só não serve pros dois papéis — a margem que
    // evita flash de canvas em branco é grande demais pra detecção precisa
    // de página atual, e vice-versa.
    const observerA = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const n = Number((entry.target as HTMLElement).dataset.page);
          if (!n) continue;
          if (entry.isIntersecting) enqueueRender(n);
          else freePage(n);
        }
      },
      { root: container, rootMargin: RENDER_WINDOW_MARGIN, threshold: 0 }
    );

    const observerB = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const n = Number((entry.target as HTMLElement).dataset.page);
          if (!n) continue;
          if (entry.isIntersecting) visibilityRef.current.set(n, entry.intersectionRatio);
          else visibilityRef.current.delete(n);
        }
        let best = mostVisiblePageRef.current;
        let bestRatio = -1;
        for (const [n, ratio] of visibilityRef.current) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = n;
          }
        }
        if (bestRatio >= 0) mostVisiblePageRef.current = best;
        if (pageReportDebounceRef.current) clearTimeout(pageReportDebounceRef.current);
        pageReportDebounceRef.current = setTimeout(() => {
          onPageChangeRef.current?.(mostVisiblePageRef.current);
        }, PAGE_REPORT_DEBOUNCE_MS);
      },
      { root: container, rootMargin: "0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    observerARef.current = observerA;
    observerBRef.current = observerB;
    for (const el of pageElsRef.current.values()) {
      observerA.observe(el);
      observerB.observe(el);
    }

    // Passagem de fundo, em lotes, cedendo a thread entre eles — corrige
    // pageDimsRef pro caso raro de páginas de tamanho diferente da página 1
    // (o caso comum, páginas uniformes, já está certo desde o início).
    let measureCancelled = false;
    (async () => {
      const pdfDoc = pdfDocRef.current;
      if (!pdfDoc) return;
      const CHUNK = 20;
      for (let start = 1; start <= numPages; start += CHUNK) {
        if (measureCancelled || cancelledRef.current) return;
        const end = Math.min(start + CHUNK - 1, numPages);
        for (let n = start; n <= end; n++) {
          try {
            const page = await pdfDoc.getPage(n);
            if (measureCancelled || cancelledRef.current) return;
            const vp = page.getViewport({ scale: 1 });
            const prev = pageDimsRef.current[n - 1];
            if (!prev || prev.width !== vp.width || prev.height !== vp.height) {
              pageDimsRef.current[n - 1] = { width: vp.width, height: vp.height };
              if (!renderedPagesRef.current.has(n)) {
                const el = pageElsRef.current.get(n);
                if (el) {
                  el.style.width = `${vp.width * scaleRef.current}px`;
                  el.style.height = `${vp.height * scaleRef.current}px`;
                }
              }
            }
          } catch {
            // página isolada ilegível — mantém o tamanho assumido, segue
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    })();

    const renderTasks = renderTasksRef.current;
    const textLayers = textLayersRef.current;
    return () => {
      measureCancelled = true;
      observerA.disconnect();
      observerB.disconnect();
      for (const [, task] of renderTasks) {
        try {
          task.cancel();
        } catch {
          // esperado
        }
      }
      renderTasks.clear();
      for (const [, textLayer] of textLayers) {
        try {
          textLayer.cancel();
        } catch {
          // esperado
        }
      }
      textLayers.clear();
      if (pageReportDebounceRef.current) {
        clearTimeout(pageReportDebounceRef.current);
        pageReportDebounceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages]);

  // Painel muda de tamanho (ex: abre painel de comentários) — recalcula a
  // escala "fit to width" E reaplica a altura em pixel explícita (ver
  // comentário grande no JSX de render) no settle, mesmo padrão debounced
  // (~260ms) do ResizeObserver de EpubViewer.tsx:574-598. Observa o
  // WRAPPER, não o container de scroll — é o wrapper que reflete o espaço
  // disponível de verdade.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const container = scrollContainerRef.current;
    if (!wrapper || !container) return;
    let resizeDebounce: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (resizeDebounce) clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(() => {
        const { width, height } = wrapper.getBoundingClientRect();
        if (width <= 0 || height <= 0) return;
        container.style.height = `${height}px`;
        const dims1 = pageDimsRef.current[0];
        if (!dims1) return;
        baseScaleRef.current = Math.min(MAX_BASE_SCALE, Math.max(MIN_SCALE, width / dims1.width));
        relayout();
      }, 260);
    });
    ro.observe(wrapper);
    return () => {
      ro.disconnect();
      if (resizeDebounce) clearTimeout(resizeDebounce);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seleção de texto finalizada na TextLayer — mesmo papel do evento
  // "selected" do epub.js em EpubViewer.tsx, mas sem nenhum obstáculo de
  // iframe: a TextLayer roda no documento principal, então um "mouseup" no
  // document, com getSelection() nativo, já basta (mouseup no document
  // funciona mesmo que o botão seja solto fora do container, ao contrário
  // de um listener preso ao próprio elemento). Escopo pro nosso container
  // via anchorNode.contains — sem isso, selecionar texto em QUALQUER outro
  // lugar do app (barra lateral, outro painel) também abriria este menu.
  useEffect(() => {
    function handleMouseUp() {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
      const container = scrollContainerRef.current;
      if (!container || !selection.anchorNode || !container.contains(selection.anchorNode)) return;
      const raw = selection.toString();
      if (!raw.trim()) return;
      const texto = normalizeSelectedPdfText(raw);
      if (!texto) return;
      onSelectionChangeRef.current?.(texto);
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setTranslateMenu({ x: rect.left, y: rect.bottom + 6, texto });
    }
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, []);

  // Clique em "Traduzir" no menu flutuante — só avisa o pai (NotePanel.tsx),
  // que é quem possui o painel lateral de tradução e a lógica de buscar/
  // atualizar (mesmo papel de handleTranslate em EpubViewer.tsx).
  function handleTranslateClick() {
    if (!translateMenu) return;
    const { texto } = translateMenu;
    setTranslateMenu(null);
    onOpenTranslateRef.current?.(texto);
  }

  const bgColor = theme === "dark" ? "var(--background)" : "var(--background)";

  return (
    // wrapperRef: puro box de layout flex (flex:1, minHeight:0, sem
    // overflow) — só existe pra ser MEDIDO. O container de scroll de
    // verdade (scrollContainerRef, mais abaixo) recebe altura em PIXEL
    // EXPLÍCITA via JS a partir dessa medição (mount + ResizeObserver),
    // não só `flex:1` puro — causa raiz de um bug real encontrado ao testar
    // ao vivo: com o container de scroll dependendo só de flex-grow pra
    // limitar sua altura, assim que as páginas (divs altos, empilhados)
    // eram adicionadas como filhas, o container CRESCIA pra caber todo o
    // conteúdo em vez de ficar limitado ao espaço disponível (mesmo com
    // `minHeight:0`) — getBoundingClientRect() dele passava a retornar a
    // altura do documento INTEIRO, não só o viewport visível. Como
    // IntersectionObserver mede interseção contra os limites REAIS do
    // `root`, um root do tamanho do conteúdo inteiro nunca "perde de vista"
    // nenhuma página — todas ficavam permanentemente reportadas como 100%
    // visíveis desde a montagem, e span rolagem real (de um ancestral mais
    // acima, que era quem de fato tinha overflow de verdade) nunca
    // disparava recálculo nenhum. Medir uma vez e fixar a altura em pixel
    // evita depender da propagação de altura via flexbox pra este caso
    // específico (mesmo espírito do `width`/`height` explícitos que
    // EpubViewer.tsx passa pro `book.renderTo()` do epub.js, em vez de
    // deixar o epub.js também confiar em CSS puro).
    <div ref={wrapperRef} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0, background: bgColor }}>
      {loadError ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--danger, #c0392b)", padding: "1rem", textAlign: "center" }}>
          {loadError}
        </div>
      ) : (
        // Sem `flex`/`minHeight` aqui de propósito — a causa raiz real do
        // bug de altura (ver comentário grande acima) era mais sutil do que
        // só "height:100% quebra a herança de altura": `flex:1` é atalho
        // pra `flex-grow:1; flex-shrink:1; flex-basis:0%`, e um item flex
        // com flex-basis definido (0%, não "auto") usa flex-basis — não a
        // propriedade `height` — pra estabelecer o tamanho no eixo
        // principal (altura, num flex column). Ou seja: `container.style.
        // height = "...px"` (JS) era sobrescrito pelo próprio algoritmo de
        // flex, silenciosamente, mesmo com minHeight:0. Sem NENHUMA
        // participação em flex-grow/flex-basis, a altura em pixel definida
        // via JS (mount + ResizeObserver, ver acima) governa sozinha,
        // igual ao `book.renderTo({width, height})` do epub.js em
        // EpubViewer.tsx — que também não confia em CSS puro pra isso.
        <div
          ref={scrollContainerRef}
          style={{
            overflowY: "auto",
            width: "100%",
            background: bgColor,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "1rem 0",
            boxSizing: "border-box",
          }}
        >
          {numPages === null ? (
            <div style={{ color: "var(--text-muted)", padding: "2rem" }}>Carregando…</div>
          ) : (
            Array.from({ length: numPages }, (_, i) => {
              const n = i + 1;
              const dims = pageDimsRef.current[i];
              const width = dims ? dims.width * scaleRef.current : undefined;
              const height = dims ? dims.height * scaleRef.current : undefined;
              return (
                <div
                  key={n}
                  data-page={n}
                  ref={(el) => {
                    if (el) pageElsRef.current.set(n, el);
                    else pageElsRef.current.delete(n);
                  }}
                  style={{
                    position: "relative",
                    width,
                    height,
                    marginBottom: "0.75rem",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                    flexShrink: 0,
                    background: "#fff",
                  }}
                >
                  <canvas
                    ref={(el) => {
                      if (el) canvasElsRef.current.set(n, el);
                      else canvasElsRef.current.delete(n);
                    }}
                    style={{ display: "block", width: "100%", height: "100%" }}
                  />
                  {/* Camada de texto selecionável (pdfjs-dist TextLayer) —
                      preenchida/limpa em renderPage/freePage, mesmo ciclo de
                      vida do canvas acima. Classe .textLayer definida em
                      globals.css. */}
                  <div
                    className="textLayer"
                    ref={(el) => {
                      if (el) textLayerElsRef.current.set(n, el);
                      else textLayerElsRef.current.delete(n);
                    }}
                  />
                </div>
              );
            })
          )}
        </div>
      )}
      {translateMenu && (
        <HighlightMenu
          x={translateMenu.x}
          y={translateMenu.y}
          onTranslate={handleTranslateClick}
          onClose={() => setTranslateMenu(null)}
        />
      )}
    </div>
  );
});

export default PdfViewer;
