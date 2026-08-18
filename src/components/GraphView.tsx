"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { drag } from "d3-drag";
import { select } from "d3-selection";
import "d3-transition"; // side-effect: adiciona selection.transition(), usado no botão de reset de zoom
import { GRAPH_SPACE_BACKGROUND, GRAPH_TAG_NODE_COLOR, GRAPH_CALIBRE_NODE_COLOR, GRAPH_CALIBRE_GLOW_COLOR } from "@/lib/colors";
import { LayersIcon } from "@/components/SubtemaCard";

// `filename` dobra como "id" genérico do nó — pra um nó kind:"tag" (Modo Mapa
// de TagFocusPage.tsx) é o caminho de tag normalizado, não um arquivo de
// verdade; renomear o campo quebraria toda a fiação existente (posições,
// bind de drag, grau, aresta source/target) só pra um rótulo mais correto —
// não vale o custo. `kind` ausente (Graph View global, todo nó é sempre uma
// nota) é tratado como `"note"`, comportamento idêntico ao de antes desta
// adição — mudança puramente aditiva.
// "calibre" = livro da biblioteca Calibre (nó sintético gerado em
// getLocalGraph/getGlobalGraph, vaultIndex.ts — nunca existe na tabela
// `notes`) — mesmo círculo/glow pulsante de "note", só em dourado
// (GRAPH_CALIBRE_NODE_COLOR/GLOW), com um ícone de livro dentro.
export type GraphNode = { filename: string; title: string; tag: string | null; kind?: "note" | "tag" | "calibre" };
// `kind` ausente = `"wikilink"` (único tipo que existia antes desta adição) —
// mesma lógica de compatibilidade aditiva do `GraphNode.kind` acima.
export type GraphEdge = { source: string; target: string; kind?: "hierarchy" | "wikilink" };

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layoutMode: "force" | "radial";
  scope: "local" | "global";
  centerFilename?: string;
  // Nota atualmente aberta no editor — em qualquer escopo (local ou global), esse
  // nó recebe destaque visual (opacidade máxima + anel de contorno), diferente de
  // `centerFilename`, que só controla a geometria do layout radial.
  activeNoteFilename?: string;
  // Generalizado de onSelectNote(filename) — page.tsx trata "calibre" igual a
  // "note" (mesma pseudo-filename "calibre:<id>:<FORMAT>" que um clique em
  // "[[Título do Livro]]" já produz, ver NotePanel.tsx), só ignora "tag".
  onSelectNode: (id: string, kind: "note" | "tag" | "calibre") => void;
  // Opcionais — o Modo Mapa de TagFocusPage.tsx não tem um botão de tela
  // cheia próprio (pedido não incluiu isso); Graph View global continua
  // passando os dois sempre, comportamento idêntico a antes desta adição.
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
};

// Tamanho usado só até a primeira medição de verdade via ResizeObserver (evita
// renderizar em 0x0 no primeiro frame) — depois disso, `dims` sempre reflete o
// espaço real disponível (painel lateral ou tela cheia).
const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 440;
const RESIZE_DEBOUNCE_MS = 150;
const TRANSITION = "0.4s cubic-bezier(0.4, 0, 0.2, 1)";
// Alpha-alvo perpétuo da simulação — nunca deixa o grafo "congelar" de vez
// depois de assentar; um alvo baixo (em vez de 0) mantém uma vibração mínima
// e contínua, como neurônios ou estrelas que nunca ficam totalmente parados.
const IDLE_ALPHA_TARGET = 0.006;

// Visual "universo": todo nó é uma estrela branca — os mais conectados (maior grau)
// brilham em opacidade máxima, os mais isolados vão se apagando. Não há mais cor por
// tag (a tag continua nos dados, só deixou de ser usada como cor nesta tela).
const EDGE_COLOR = "#7b85b3";
const NODE_COLOR = "#ffffff";
const GLOW_COLOR = "#aab4ff";
const HIGHLIGHT_RING_COLOR = "#2f7fd6";
const MIN_NODE_OPACITY = 0.35;

// Hash simples e determinístico (mesmo filename sempre cai no mesmo valor,
// entre re-renders) — usado só pra variar duração/atraso do "brilho pulsante"
// de cada nó, pra não piscarem todos em uníssono feito diagrama, e sim de
// forma dessincronizada, mais orgânica.
function hashString(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Grau de cada nó (quantidade de arestas que tocam ele) — usado como proxy de
// "força" pra decidir o quão apagada cada estrela fica.
function computeDegrees(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const degrees = new Map<string, number>(nodes.map((n) => [n.filename, 0]));
  for (const e of edges) {
    degrees.set(e.source, (degrees.get(e.source) ?? 0) + 1);
    degrees.set(e.target, (degrees.get(e.target) ?? 0) + 1);
  }
  return degrees;
}

function opacityForDegree(degree: number, minDegree: number, maxDegree: number): number {
  if (maxDegree === minDegree) return 1;
  const t = (degree - minDegree) / (maxDegree - minDegree);
  return MIN_NODE_OPACITY + t * (1 - MIN_NODE_OPACITY);
}

type SimNode = SimulationNodeDatum & GraphNode & { id: string };
type SimLink = SimulationLinkDatum<SimNode>;

// Layout radial: distância BFS a partir de centerFilename vira o raio do anel;
// dentro de cada anel os nós ficam espalhados em ângulos iguais. Sem simulação —
// é um cálculo geométrico direto a partir da lista de arestas já carregada.
function computeRadialPositions(
  nodes: GraphNode[],
  edges: GraphEdge[],
  centerFilename: string | undefined,
  width: number,
  height: number
): Record<string, { x: number; y: number }> {
  if (!centerFilename) return {};

  const adjacency = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
    if (!adjacency.has(e.target)) adjacency.set(e.target, new Set());
    adjacency.get(e.source)!.add(e.target);
    adjacency.get(e.target)!.add(e.source);
  }

  const distances = new Map<string, number>([[centerFilename, 0]]);
  let frontier = [centerFilename];
  let depth = 0;
  while (frontier.length > 0) {
    depth++;
    const next: string[] = [];
    for (const f of frontier) {
      for (const neighbor of adjacency.get(f) ?? []) {
        if (!distances.has(neighbor)) {
          distances.set(neighbor, depth);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }

  const maxKnownDistance = Math.max(0, ...Array.from(distances.values()));
  const ringGroups = new Map<number, string[]>();
  for (const n of nodes) {
    const d = distances.get(n.filename) ?? maxKnownDistance + 1;
    if (!ringGroups.has(d)) ringGroups.set(d, []);
    ringGroups.get(d)!.push(n.filename);
  }

  const positions: Record<string, { x: number; y: number }> = {};
  const cx = width / 2;
  const cy = height / 2;
  const ringSpacing = 110;

  for (const [dist, filenames] of ringGroups) {
    if (dist === 0) {
      positions[filenames[0]] = { x: cx, y: cy };
      continue;
    }
    const radius = dist * ringSpacing;
    filenames.forEach((filename, i) => {
      const angle = (2 * Math.PI * i) / filenames.length - Math.PI / 2;
      positions[filename] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    });
  }

  return positions;
}

// Ícone dentro do círculo dourado de um nó "calibre" (ver GraphNode.kind) —
// `size`/posicionamento seguem o mesmo padrão de LayersIcon (SubtemaCard.tsx)
// já usado pro nó "tag": um <g translate> externo centraliza o ícone sobre o
// nó, então o SVG aqui só precisa ocupar seu próprio viewBox 0 0 24 24.
function BookIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6.5c-1.6-1-3.8-1.5-6.5-1.5v13c2.7 0 4.9.5 6.5 1.5" />
      <path d="M12 6.5c1.6-1 3.8-1.5 6.5-1.5v13c-2.7 0-4.9.5-6.5 1.5" />
      <path d="M12 6.5v13" />
    </svg>
  );
}

function ResetZoomIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 14v6h6M20 10V4h-6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20 10 14M20 4 14 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Setas apontando pra fora (entrar em tela cheia) / pra dentro (sair) — mesmo
// desenho conceitual de "maximizar/minimizar" usado em players de vídeo.
function FullscreenIcon({ active }: { active: boolean }) {
  const common = {
    width: 14,
    height: 14,
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

export default function GraphView({
  nodes,
  edges,
  layoutMode,
  scope,
  centerFilename,
  activeNoteFilename,
  onSelectNode,
  isFullscreen,
  onToggleFullscreen,
}: Props) {
  const [forcePositions, setForcePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [camera, setCamera] = useState({ x: 0, y: 0, k: 1 });
  const [draggingFilename, setDraggingFilename] = useState<string | null>(null);
  const [dims, setDims] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });

  const simulationRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const simNodesByFilenameRef = useRef<Map<string, SimNode>>(new Map());
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mede o espaço real disponível (painel lateral OU tela cheia) em vez de usar
  // um tamanho fixo — é o que faz o grafo de fato ocupar a tela inteira no modo
  // tela cheia, e esticar verticalmente também no painel lateral. Debounce curto
  // pra não reiniciar a simulação a cada frame da transição CSS de abrir/fechar
  // o painel (width 0.22s ease em page.tsx).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width < 1 || height < 1) return;
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = setTimeout(() => {
        setDims({ width: Math.round(width), height: Math.round(height) });
      }, RESIZE_DEBOUNCE_MS);
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
    };
  }, []);

  // Comportamento de arrastar nó — criado uma única vez (não recriado a cada
  // render); lê a simulação/nó atual só no momento do gesto, via refs.
  const dragBehaviorRef = useRef(
    drag<SVGGElement, unknown>()
      .clickDistance(4) // pequenos movimentos ainda contam como clique, não arraste
      .on("start", (event) => {
        const node = event.subject as SimNode;
        setDraggingFilename(node.id);
        const sim = simulationRef.current;
        if (sim && !event.active) sim.alphaTarget(0.3).restart();
        node.fx = node.x;
        node.fy = node.y;
      })
      .on("drag", (event) => {
        const node = event.subject as SimNode;
        node.fx = event.x;
        node.fy = event.y;
      })
      .on("end", (event) => {
        const node = event.subject as SimNode;
        setDraggingFilename(null);
        const sim = simulationRef.current;
        // Volta pro alvo ocioso (não 0) — senão o arraste "mataria" de vez a
        // vibração perpétua do grafo pro resto da sessão.
        if (sim && !event.active) sim.alphaTarget(IDLE_ALPHA_TARGET);
        node.fx = null;
        node.fy = null;
      })
  );

  // Simulação de força-livre — só roda quando layoutMode === "force". Reinicia
  // quando as dimensões mudam de verdade (resize/tela cheia), não a cada tick.
  useEffect(() => {
    simulationRef.current?.stop();

    if (layoutMode !== "force") {
      return;
    }

    const simNodes: SimNode[] = nodes.map((n) => ({ ...n, id: n.filename }));
    const simLinks: SimLink[] = edges.map((e) => ({ source: e.source, target: e.target }));

    simNodesByFilenameRef.current = new Map(simNodes.map((n) => [n.id, n]));

    const simulation = forceSimulation<SimNode>(simNodes)
      // Menos atrito (padrão do d3 é 0.4): os nós deslizam com inércia, como
      // corpos em órbita, em vez de travar no lugar assim que a força some.
      .velocityDecay(0.15)
      // Esfria bem mais devagar (padrão do d3 é ~0.0228): a movimentação
      // orgânica de assentamento dura visivelmente mais tempo.
      .alphaDecay(0.01)
      .force("charge", forceManyBody<SimNode>().strength(-320))
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(110)
      )
      .force("center", forceCenter<SimNode>(dims.width / 2, dims.height / 2))
      .force("collide", forceCollide<SimNode>(34))
      // Puxão individual e bem fraco de volta pro centro (não só o recentering
      // "de conjunto" do forceCenter) — sem isso, o atrito baixo e o
      // resfriamento lento davam tempo/inércia demais pra repulsão jogar nós
      // isolados (a maioria das notas não tem link nenhum) pra bem longe,
      // como se "fugissem" da tela em vez de orbitar um centro comum.
      .force("x", forceX<SimNode>(dims.width / 2).strength(0.03))
      .force("y", forceY<SimNode>(dims.height / 2).strength(0.03));

    simulationRef.current = simulation;
    // Depois de assentar, a simulação nunca chega a alpha=0 de vez — continua
    // vibrando bem sutilmente pra sempre (nunca vira um diagrama estático).
    simulation.alphaTarget(IDLE_ALPHA_TARGET);

    simulation.on("tick", () => {
      const next: Record<string, { x: number; y: number }> = {};
      for (const n of simNodes) {
        next[n.id] = { x: n.x ?? dims.width / 2, y: n.y ?? dims.height / 2 };
      }
      setForcePositions(next);

      // Os <g> só passam a existir no DOM a partir do primeiro tick (antes
      // disso "positions" está vazio e nada é renderizado ainda) — por isso o
      // bind do drag acontece aqui a cada tick, não num efeito separado que
      // rodaria cedo demais, antes de qualquer nó ter sido montado.
      if (svgRef.current) {
        const selection = select(svgRef.current).selectAll<SVGGElement, unknown>("g.graph-node");
        selection.each(function bindDatum() {
          const filename = this.getAttribute("data-filename");
          const simNode = filename ? simNodesByFilenameRef.current.get(filename) : undefined;
          if (simNode) select(this).datum(simNode);
        });
        selection.call(dragBehaviorRef.current);
      }
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, layoutMode, dims]);

  // Pan (arrastar o fundo) + zoom (roda do mouse/pinça), igual ao Obsidian — vale
  // pros dois layouts, é só a câmera sobre o mesmo desenho.
  useEffect(() => {
    if (!svgRef.current) return;

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        setCamera({ x: event.transform.x, y: event.transform.y, k: event.transform.k });
      });

    zoomBehaviorRef.current = zoomBehavior;
    const selection = select(svgRef.current);
    selection.call(zoomBehavior).on("dblclick.zoom", null);

    return () => {
      selection.on(".zoom", null);
    };
  }, []);

  const radialPositions = useMemo(
    () =>
      computeRadialPositions(
        nodes,
        edges,
        layoutMode === "radial" ? centerFilename : undefined,
        dims.width,
        dims.height
      ),
    [nodes, edges, layoutMode, centerFilename, dims]
  );

  const positions = layoutMode === "radial" ? radialPositions : forcePositions;

  const degrees = useMemo(() => computeDegrees(nodes, edges), [nodes, edges]);
  const degreeValues = Array.from(degrees.values());
  const minDegree = degreeValues.length ? Math.min(...degreeValues) : 0;
  const maxDegree = degreeValues.length ? Math.max(...degreeValues) : 0;

  function resetView() {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.transform, zoomIdentity);
  }

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }}>
      <style>{`
        @keyframes graph-node-pulse {
          0%, 100% { opacity: 0.22; }
          50% { opacity: 0.5; }
        }
        .graph-node-glow {
          animation-name: graph-node-pulse;
          animation-iteration-count: infinite;
          animation-timing-function: ease-in-out;
        }
      `}</style>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${dims.width} ${dims.height}`}
        style={{
          width: "100%",
          height: "100%",
          background: GRAPH_SPACE_BACKGROUND,
          borderRadius: isFullscreen ? 0 : "6px",
          cursor: "grab",
          display: "block",
        }}
      >
        <defs>
          <filter id="graph-star-glow" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <radialGradient id="graph-star-core" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor={NODE_COLOR} />
            <stop offset="100%" stopColor="#d7dcff" />
          </radialGradient>
          <radialGradient id="graph-calibre-core" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor={GRAPH_CALIBRE_GLOW_COLOR} />
            <stop offset="100%" stopColor={GRAPH_CALIBRE_NODE_COLOR} />
          </radialGradient>
        </defs>

        <g transform={`translate(${camera.x}, ${camera.y}) scale(${camera.k})`}>
          {edges.map((edge, i) => {
            const from = positions[edge.source];
            const to = positions[edge.target];
            if (!from || !to) return null;
            // `kind` AUSENTE = comportamento de sempre do Graph View global
            // (cinza sólida, EDGE_COLOR) — nunca muda, mesmo depois desta
            // adição. Só quando `kind` vem EXPLICITAMENTE setado (Modo Mapa
            // de TagFocusPage.tsx) é que a aresta pode ficar tracejada azul
            // ("wikilink" — link [[nota]] cruzando ramos, só informativo,
            // nunca clicável, sem onClick em nenhuma das duas variantes) ou
            // continuar sólida cinza ("hierarchy" — tema→subtema→nota).
            const isExplicitWikilink = edge.kind === "wikilink";
            return (
              <line
                key={i}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={isExplicitWikilink ? "var(--link-color)" : EDGE_COLOR}
                strokeWidth={1}
                strokeDasharray={isExplicitWikilink ? "4 3" : undefined}
                strokeLinecap="round"
                opacity={0.4}
                style={{
                  // Só faz sentido "animar" a posição no layout radial (muda de
                  // forma discreta e rara) — no layout de força a simulação já
                  // tickeia a ~60fps sozinha; uma transição CSS por cima disso
                  // só cria um atraso perceptível "correndo atrás" da posição
                  // real, o oposto de fluido.
                  transition:
                    layoutMode === "radial"
                      ? `x1 ${TRANSITION}, y1 ${TRANSITION}, x2 ${TRANSITION}, y2 ${TRANSITION}`
                      : "none",
                }}
              />
            );
          })}
          {nodes.map((node) => {
            const pos = positions[node.filename];
            if (!pos) return null;
            const isCenter = scope === "local" && node.filename === centerFilename;
            const isActive = node.filename === activeNoteFilename;
            const isDragging = draggingFilename === node.filename;
            const opacity = isActive ? 1 : opacityForDegree(degrees.get(node.filename) ?? 0, minDegree, maxDegree);
            const radius = isCenter || isActive ? 16 : 11;
            const seed = hashString(node.filename);
            const pulseDuration = 2.6 + (seed % 22) / 10; // 2.6s a 4.8s
            const pulseDelay = -((seed % 37) / 10); // atraso negativo: cada nó já nasce numa fase diferente do ciclo
            // Nó "tag" só existe no Modo Mapa (TagFocusPage.tsx) — visual
            // deliberadamente diferente da "estrela" de nota (sem glow, já
            // que "grau de conexão" não é uma métrica que faça sentido pra um
            // agrupamento): círculo vazio com anel colorido (âmbar na raiz —
            // mesmo tom de qualquer link de tema/tag no app — teal nos
            // demais) + o mesmo ícone de camadas usado em SubtemaCard.tsx,
            // reforçando "isto é um agrupamento" com a mesma linguagem visual
            // já usada ali.
            const isTagNode = node.kind === "tag";
            const isCalibreNode = node.kind === "calibre";
            const tagRingColor = isCenter ? "var(--tag-link-color)" : GRAPH_TAG_NODE_COLOR;
            const iconSize = radius * 1.3;
            return (
              <g
                key={node.filename}
                className="graph-node"
                data-filename={node.filename}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => onSelectNode(node.filename, node.kind ?? "note")}
                style={{
                  cursor: layoutMode === "force" ? "grab" : "pointer",
                  opacity,
                  transition:
                    isDragging || layoutMode === "force" ? `opacity ${TRANSITION}` : `transform ${TRANSITION}, opacity ${TRANSITION}`,
                }}
              >
                {isTagNode ? (
                  <>
                    <circle r={radius} fill={GRAPH_SPACE_BACKGROUND} stroke={tagRingColor} strokeWidth={2} />
                    <g transform={`translate(${-iconSize / 2}, ${-iconSize / 2})`} style={{ color: tagRingColor }}>
                      <LayersIcon size={iconSize} />
                    </g>
                  </>
                ) : isCalibreNode ? (
                  <>
                    {/* Mesmo glow pulsante do nó "nota" (graph-node-glow), só
                        em dourado — "corpo celeste" mais luminoso, nunca a
                        mesma cor de nota. */}
                    <circle
                      className="graph-node-glow"
                      r={radius * 2.2}
                      fill={GRAPH_CALIBRE_GLOW_COLOR}
                      filter="url(#graph-star-glow)"
                      style={{
                        animationDuration: `${pulseDuration}s`,
                        animationDelay: `${pulseDelay}s`,
                      }}
                    />
                    <circle
                      r={radius}
                      fill="url(#graph-calibre-core)"
                      stroke={isActive ? HIGHLIGHT_RING_COLOR : "none"}
                      strokeWidth={2}
                    />
                    <g transform={`translate(${-iconSize / 2}, ${-iconSize / 2})`} style={{ color: GRAPH_SPACE_BACKGROUND }}>
                      <BookIcon size={iconSize} />
                    </g>
                  </>
                ) : (
                  <>
                    <circle
                      className="graph-node-glow"
                      r={radius * 2.2}
                      fill={GLOW_COLOR}
                      filter="url(#graph-star-glow)"
                      style={{
                        animationDuration: `${pulseDuration}s`,
                        animationDelay: `${pulseDelay}s`,
                      }}
                    />
                    <circle
                      r={radius}
                      fill="url(#graph-star-core)"
                      stroke={isActive ? HIGHLIGHT_RING_COLOR : "none"}
                      strokeWidth={2}
                    />
                  </>
                )}
                <text x={0} y={26} textAnchor="middle" fontSize="12" fill="var(--foreground)">
                  {node.title}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {nodes.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            padding: "1rem",
            textAlign: "center",
          }}
        >
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "260px" }}>
            {scope === "local" ? "Nenhuma conexão encontrada pra este item." : "Nenhuma nota encontrada neste vault."}
          </p>
        </div>
      )}

      <div style={{ position: "absolute", top: "8px", right: "8px", display: "flex", gap: "6px" }}>
        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            style={{
              padding: "0.3rem 0.4rem",
              background: "var(--panel-bg)",
              border: "1px solid var(--panel-border)",
              borderRadius: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              color: "var(--foreground)",
            }}
          >
            <FullscreenIcon active={!!isFullscreen} />
          </button>
        )}
        <button
          onClick={resetView}
          title="Restaurar zoom"
          style={{
            padding: "0.3rem 0.4rem",
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: "4px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            color: "var(--foreground)",
          }}
        >
          <ResetZoomIcon />
        </button>
      </div>
    </div>
  );
}
