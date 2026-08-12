"use client";

import { useEffect, useState } from "react";
import NoteCard, { type LibraryNote } from "@/components/NoteCard";
import SubtemaCard from "@/components/SubtemaCard";
import GraphView, { type GraphNode, type GraphEdge } from "@/components/GraphView";
import { matchesTypeFilter, CONTENT_TYPE_FILTER_OPTIONS, type ContentTypeFilter } from "@/lib/noteStatus";
import { formatTagLabel, normalizeTagKey, buildTagNoteTree, collectAllNotes, type TagNoteTreeNode } from "@/lib/tagTree";
import { useVault } from "@/lib/vaultContext";

// Mesma largura fixa de card usada em toda lista da Homepage/Progresso (ver
// LibraryHome.tsx) — grid sem paginação/"+N outras" (GroupedNoteList.tsx
// já estabeleceu esse padrão pra listas "já agrupadas, mostrar tudo": aqui
// não haveria pra onde um "+N outras" levaria, já é a página mais específica).
const CARD_WIDTH = 220;

type ViewMode = "nav" | "overview" | "map";

const VIEW_MODE_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "nav", label: "Navegação" },
  { value: "overview", label: "Visão Geral" },
  { value: "map", label: "Mapa" },
];

function BackArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

const serifStyle = { fontFamily: "var(--font-fraunces)" };
const sectionDividerStyle = { borderTop: "0.5px solid var(--panel-border)", paddingTop: "2rem", marginTop: "2rem" };

// Mesmo desenho de pílula usado logo abaixo pro filtro por tipo — reaproveitado
// pro seletor de modo (Navegação/Visão Geral/Mapa), mesma linguagem visual.
function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: "0.35rem 0.8rem",
    borderRadius: "999px",
    border: "1px solid var(--panel-border)",
    background: active ? "var(--panel-hover)" : "transparent",
    color: active ? "var(--foreground)" : "var(--text-muted)",
    fontWeight: active ? "bold" : "normal",
    cursor: "pointer",
    fontSize: "0.85rem",
  };
}

type Props = {
  // Caminho completo (dot-hierárquico) até o nível atual, ex:
  // "história.pré-história.livros" — não é mais necessariamente um tema de
  // topo (macro-tema): qualquer nível da árvore de tags pode ser o "atual".
  tagPath: string;
  // Já vem filtrada pro subtree deste nível (tag exata OU começando com
  // `${tagPath}.` — ver page.tsx); este componente cuida do filtro por tipo
  // e do agrupamento nível-atual/subtema-imediato em cima disso.
  notes: LibraryNote[];
  // null = Homepage. Usado pelo breadcrumb (pular pra qualquer nível
  // anterior), pelo botão "Voltar" (sempre um nível acima) e pelos links de
  // subtema (um nível abaixo) — navegação sempre passa por aqui, nunca por
  // um onBack fixo, porque não existe mais "o" nível anterior fixo.
  onNavigate: (tagPath: string | null) => void;
  onOpenNote: (filename: string) => void;
  onRenameNote: (filename: string, newTitle: string, onSettled: () => void) => void;
  onDeleteNote: (filename: string) => void;
  onToggleFavorite: (filename: string) => void;
  // Mapa completo { [tagPath]: coverPath } de capas manuais de subtema desta
  // vault (ver GET /api/tag/cover) — subtema sem entrada aqui cai no ícone de
  // camadas padrão do SubtemaCard.
  tagCovers: Record<string, string>;
  // Chamado depois de adicionar/trocar/remover a capa de um subtema — quem
  // usa esta página decide como refletir isso (refetch de tagCovers).
  onTagCoverChanged: () => void;
};

// Página de foco por tag hierárquica — aberta ao clicar no nome de um
// macro-tema na Homepage (nível 1), ou ao clicar num subtema (qualquer nível
// seguinte, profundidade ilimitada). Três modos de visualização alternáveis
// (pílulas no topo), todos lendo da MESMA árvore (buildTagNoteTree, ver
// tagTree.ts) — nenhum modo tem sua própria lógica de agrupamento, pra nunca
// repetir o tipo de bug já visto (um lugar mostra um subtema corretamente,
// outro não, por comparar tags de formas diferentes):
// - Navegação: cards de subtema, um nível de cada vez (comportamento de
//   sempre).
// - Visão Geral: toda a subárvore achatada numa lista só, uma seção por
//   subtema/sub-subtema com notas diretas, sem precisar clicar em nada.
// - Mapa: grafo de nós (hierarquia + links [[nota]] cruzando ramos),
//   reaproveitando o componente GraphView já usado pelo Graph View global.
export default function TagFocusPage({
  tagPath: rawTagPath,
  notes,
  onNavigate,
  onOpenNote,
  onRenameNote,
  onDeleteNote,
  onToggleFavorite,
  tagCovers,
  onTagCoverChanged,
}: Props) {
  const { vaultFetch } = useVault();
  const [typeFilter, setTypeFilter] = useState<ContentTypeFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("nav");
  // Arestas de wikilink do vault inteiro, buscadas só quando o Modo Mapa é
  // aberto pela primeira vez (não em toda troca de nível) — o mesmo dado já
  // alimenta o Graph View global (GET /api/graph?scope=global), aqui só
  // filtrado pro subtree desta página (ver buildMapGraph abaixo).
  const [globalWikilinkEdges, setGlobalWikilinkEdges] = useState<GraphEdge[] | null>(null);

  useEffect(() => {
    if (viewMode !== "map" || globalWikilinkEdges !== null) return;
    let cancelled = false;
    vaultFetch("/api/graph?scope=global")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.edges)) setGlobalWikilinkEdges(data.edges);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, globalWikilinkEdges]);

  // Normalizado uma vez na entrada (ver normalizeTagKey em tagTree.ts) — daí
  // pra baixo, todo o resto do componente (breadcrumb, parentPath, árvore)
  // deriva desta forma já normalizada, então fica consistente mesmo que quem
  // chamou não tenha normalizado (ex: um link antigo salvo em algum lugar).
  const tagPath = normalizeTagKey(rawTagPath);
  const segments = tagPath.split(".");
  const currentSegment = segments[segments.length - 1];
  // Nível acima na trilha — não a Homepage direto, exceto quando já estamos
  // num macro-tema (nível 1, sem "." no path).
  const parentPath = segments.length > 1 ? segments.slice(0, -1).join(".") : null;

  const filteredNotes = notes.filter((n) => matchesTypeFilter(n, typeFilter));
  // Uma árvore só, reaproveitada pelos 3 modos abaixo — ver comentário do
  // componente.
  const tree = buildTagNoteTree(tagPath, filteredNotes);

  function renderGrid(groupNotes: LibraryNote[]) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, ${CARD_WIDTH}px)`, gap: "1rem" }}>
        {groupNotes.map((note) => (
          <NoteCard
            key={note.filename}
            note={note}
            onClick={() => onOpenNote(note.filename)}
            onRename={(newTitle, onSettled) => onRenameNote(note.filename, newTitle, onSettled)}
            onDelete={() => onDeleteNote(note.filename)}
            isFavorite={note.isFavorite}
            onToggleFavorite={() => onToggleFavorite(note.filename)}
          />
        ))}
      </div>
    );
  }

  // Trilha completa desde a raiz — "Início" (Homepage) sempre primeiro,
  // depois um segmento por nível até o atual (inclusive).
  const breadcrumb: { label: string; path: string | null }[] = [{ label: "Início", path: null }];
  let acc = "";
  for (const segment of segments) {
    acc = acc ? `${acc}.${segment}` : segment;
    breadcrumb.push({ label: formatTagLabel(segment), path: acc });
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "2.5rem 3rem" }}>
      <button
        onClick={() => onNavigate(parentPath)}
        className="toolbar-link"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.3rem 0.6rem",
          marginBottom: "0.75rem",
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

      <nav
        aria-label="Trilha de navegação"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.35rem",
          marginBottom: "1rem",
          fontSize: "0.8rem",
          color: "var(--text-muted)",
        }}
      >
        {breadcrumb.map((crumb, i) => {
          const isLast = i === breadcrumb.length - 1;
          return (
            <span key={crumb.path ?? "home"} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              {i > 0 && <span aria-hidden="true">›</span>}
              {isLast ? (
                <span style={{ color: "var(--foreground)", fontWeight: "bold" }}>{crumb.label}</span>
              ) : (
                <button
                  onClick={() => onNavigate(crumb.path)}
                  className="toolbar-link"
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    padding: 0,
                    font: "inherit",
                  }}
                >
                  {crumb.label}
                </button>
              )}
            </span>
          );
        })}
      </nav>

      <h1 style={{ ...serifStyle, fontSize: "2.4em", margin: 0 }}>{formatTagLabel(currentSegment)}</h1>
      <p style={{ color: "var(--text-muted)", marginTop: "0.4rem" }}>
        {filteredNotes.length} {filteredNotes.length === 1 ? "nota" : "notas"}
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
        {VIEW_MODE_OPTIONS.map((m) => (
          <button key={m.value} onClick={() => setViewMode(m.value)} className="toolbar-link" style={pillStyle(viewMode === m.value)}>
            {m.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
        {CONTENT_TYPE_FILTER_OPTIONS.map((f) => (
          <button key={f.value} onClick={() => setTypeFilter(f.value)} className="toolbar-link" style={pillStyle(typeFilter === f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      {viewMode === "nav" && <NavMode tree={tree} currentSegment={currentSegment} tagCovers={tagCovers} onTagCoverChanged={onTagCoverChanged} onNavigate={onNavigate} renderGrid={renderGrid} />}

      {viewMode === "overview" && <OverviewMode tree={tree} renderGrid={renderGrid} />}

      {viewMode === "map" && (
        <MapMode
          tree={tree}
          tagPath={tagPath}
          globalWikilinkEdges={globalWikilinkEdges}
          onOpenNote={onOpenNote}
          onNavigateToTag={(path) => {
            setViewMode("nav");
            onNavigate(path);
          }}
        />
      )}
    </div>
  );
}

// --- Modo Navegação — cards de subtema, um nível de cada vez (comportamento
// já existente, agora lendo de `tree` em vez de calcular um nível sozinho). ---
function NavMode({
  tree,
  currentSegment,
  tagCovers,
  onTagCoverChanged,
  onNavigate,
  renderGrid,
}: {
  tree: TagNoteTreeNode<LibraryNote>;
  currentSegment: string;
  tagCovers: Record<string, string>;
  onTagCoverChanged: () => void;
  onNavigate: (tagPath: string | null) => void;
  renderGrid: (notes: LibraryNote[]) => React.ReactNode;
}) {
  const sortedChildren = tree.children
    .map((child) => ({ child, allNotes: collectAllNotes(child, (n) => n.filename) }))
    .sort((a, b) => b.allNotes.length - a.allNotes.length);

  return (
    <>
      {tree.ownNotes.length > 0 && (
        <section style={sectionDividerStyle}>
          <h2 style={{ ...serifStyle, fontSize: "1.3em", margin: "0 0 1rem 0" }}>
            {formatTagLabel(currentSegment)}{" "}
            <span style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "0.6em", color: "var(--text-muted)" }}>
              ({tree.ownNotes.length} {tree.ownNotes.length === 1 ? "nota" : "notas"})
            </span>
          </h2>
          {renderGrid(tree.ownNotes)}
        </section>
      )}

      {sortedChildren.length > 0 && (
        <section style={sectionDividerStyle}>
          <h2 style={{ ...serifStyle, fontSize: "1.3em", margin: "0 0 1rem 0" }}>Subtemas</h2>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, ${CARD_WIDTH}px)`, gap: "1rem" }}>
            {sortedChildren.map(({ child, allNotes }) => (
              <SubtemaCard
                key={child.path}
                tagPath={child.path}
                label={formatTagLabel(child.segment)}
                count={allNotes.length}
                coverPath={tagCovers[child.path] ?? null}
                onClick={() => onNavigate(child.path)}
                onCoverChanged={onTagCoverChanged}
              />
            ))}
          </div>
        </section>
      )}

      {tree.ownNotes.length === 0 && sortedChildren.length === 0 && (
        <p style={{ color: "var(--text-muted)", marginTop: "2rem" }}>Nenhuma nota encontrada.</p>
      )}
    </>
  );
}

// --- Modo Visão Geral — subárvore inteira achatada em pré-ordem, uma seção
// (título + grid) por nó com nota própria, indentada pela profundidade. ---
function flattenForOverview(
  node: TagNoteTreeNode<LibraryNote>,
  depth: number
): { node: TagNoteTreeNode<LibraryNote>; depth: number }[] {
  const result: { node: TagNoteTreeNode<LibraryNote>; depth: number }[] = [];
  if (node.ownNotes.length > 0) result.push({ node, depth });
  for (const child of node.children) result.push(...flattenForOverview(child, depth + 1));
  return result;
}

function OverviewMode({ tree, renderGrid }: { tree: TagNoteTreeNode<LibraryNote>; renderGrid: (notes: LibraryNote[]) => React.ReactNode }) {
  const sections = flattenForOverview(tree, 0);

  if (sections.length === 0) {
    return <p style={{ color: "var(--text-muted)", marginTop: "2rem" }}>Nenhuma nota encontrada.</p>;
  }

  return (
    <>
      {sections.map(({ node, depth }) => (
        <section key={node.path} style={{ ...sectionDividerStyle, paddingLeft: `${depth * 1.5}rem` }}>
          <h2 style={{ ...serifStyle, fontSize: "1.3em", margin: "0 0 1rem 0" }}>
            {formatTagLabel(node.segment)}{" "}
            <span style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "0.6em", color: "var(--text-muted)" }}>
              ({node.ownNotes.length} {node.ownNotes.length === 1 ? "nota" : "notas"})
            </span>
          </h2>
          {renderGrid(node.ownNotes)}
        </section>
      ))}
    </>
  );
}

// --- Modo Mapa — grafo (GraphView.tsx, reaproveitado do Graph View global):
// um nó "tag" por nível da árvore (raiz incluída) + um nó "note" por nota da
// subárvore, arestas de hierarquia (tag→filho tag, tag→suas próprias notas) e
// arestas de wikilink (só as que cruzam duas notas desta mesma subárvore, do
// grafo global já usado pelo Graph View). ---
function buildMapGraph(
  tree: TagNoteTreeNode<LibraryNote>,
  globalWikilinkEdges: GraphEdge[] | null
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const noteFilenames = new Set<string>();

  function visit(node: TagNoteTreeNode<LibraryNote>) {
    nodes.push({ filename: node.path, title: formatTagLabel(node.segment), tag: null, kind: "tag" });
    for (const note of node.ownNotes) {
      if (!noteFilenames.has(note.filename)) {
        noteFilenames.add(note.filename);
        nodes.push({ filename: note.filename, title: note.title, tag: null, kind: "note" });
      }
      edges.push({ source: node.path, target: note.filename, kind: "hierarchy" });
    }
    for (const child of node.children) {
      edges.push({ source: node.path, target: child.path, kind: "hierarchy" });
      visit(child);
    }
  }
  visit(tree);

  for (const e of globalWikilinkEdges ?? []) {
    if (noteFilenames.has(e.source) && noteFilenames.has(e.target)) {
      edges.push({ source: e.source, target: e.target, kind: "wikilink" });
    }
  }

  return { nodes, edges };
}

function MapMode({
  tree,
  tagPath,
  globalWikilinkEdges,
  onOpenNote,
  onNavigateToTag,
}: {
  tree: TagNoteTreeNode<LibraryNote>;
  tagPath: string;
  globalWikilinkEdges: GraphEdge[] | null;
  onOpenNote: (filename: string) => void;
  onNavigateToTag: (tagPath: string) => void;
}) {
  const { nodes, edges } = buildMapGraph(tree, globalWikilinkEdges);

  if (nodes.length <= 1) {
    return <p style={{ color: "var(--text-muted)", marginTop: "2rem" }}>Nenhuma nota encontrada.</p>;
  }

  return (
    <div style={{ ...sectionDividerStyle, height: "600px" }}>
      <GraphView
        nodes={nodes}
        edges={edges}
        layoutMode="radial"
        scope="local"
        centerFilename={tagPath}
        onSelectNode={(id, kind) => {
          if (kind === "note") onOpenNote(id);
          else if (id !== tagPath) onNavigateToTag(id);
        }}
      />
    </div>
  );
}
