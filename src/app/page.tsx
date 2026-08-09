"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import GraphView, { type GraphNode, type GraphEdge } from "@/components/GraphView";
import LibraryHome from "@/components/LibraryHome";
import TagNoteList from "@/components/TagNoteList";
import GroupedNoteList from "@/components/GroupedNoteList";
import TagFocusPage from "@/components/TagFocusPage";
import { StarIcon, type LibraryNote } from "@/components/NoteCard";
import { buildTagTree, filterTagTree, formatTagLabel, type TagTreeNode } from "@/lib/tagTree";
import NewNoteMenu from "@/components/NewNoteMenu";
import NoteRowMenu from "@/components/NoteRowMenu";
import ConfirmModal from "@/components/ConfirmModal";
import ImportProgressModal from "@/components/ImportProgressModal";
import ImportWebModal from "@/components/ImportWebModal";
import { GRAPH_SPACE_BACKGROUND } from "@/lib/colors";
import { STATUS_LABELS, matchesTypeFilter, CONTENT_TYPE_FILTER_OPTIONS, type ContentTypeFilter } from "@/lib/noteStatus";
import NotePanel, { type NotePanelHandle } from "@/components/NotePanel";
import VaultSwitcher from "@/components/VaultSwitcher";
import CreateVaultModal from "@/components/CreateVaultModal";
import { VaultContext, appendVaultParam, type VaultEntry } from "@/lib/vaultContext";
import { setActiveVaultId as setLivePreviewVaultId } from "@/lib/livePreview";
import { DEFAULT_NOTE_FONT, type NoteFontId } from "@/lib/fonts";
import { isTauri } from "@/lib/platform";
import { useIsMobile } from "@/lib/useIsMobile";
import { formatRelativeTime } from "@/lib/relativeTime";

function stripMdExtension(filename: string): string {
  return filename.replace(/\.(md|pdf|epub)$/i, "");
}

// Chave do grupo "Sem tag" no expandedTags (não pode ser null, já que é chave de Set<string>).
const UNTAGGED_GROUP_KEY = "__sem_tag__";

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function SidebarToggleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}

function BackArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.5A8.5 8.5 0 1 1 11.5 3a7 7 0 0 0 9.5 9.5Z" />
    </svg>
  );
}

// Ícone do botão que revela o filtro por tipo na aba "Tags" da sidebar —
// mesmo desenho de livro do TypeIcon em NoteCard.tsx (não exportado de lá,
// então redesenhado aqui, tamanho igual aos outros ícones da toolbar da
// sidebar).
function FilterBookIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  );
}

type HomeView =
  | { kind: "library" }
  | { kind: "tagList"; tag: string | null }
  | { kind: "tagFocus"; macroTag: string }
  | { kind: "statusList"; status: string }
  | { kind: "recentList" }
  | { kind: "favoritesList" }
  | { kind: "editor" };

export default function Home() {
  // Vault ativo — ver src/lib/vaultContext.tsx. `activeVaultId` começa null
  // (ainda carregando a lista) até o efeito abaixo resolver qual vault abrir.
  const [vaults, setVaults] = useState<VaultEntry[]>([]);
  const [activeVaultId, setActiveVaultId] = useState<string | null>(null);
  // Distingue "ainda buscando /api/vaults" de "buscou e o registro está
  // vazio" — as duas situações deixam activeVaultId null, mas só a primeira
  // deve mostrar "Carregando..."; a segunda mostra a tela de boas-vindas.
  const [vaultsLoaded, setVaultsLoaded] = useState(false);
  const [showFirstVaultModal, setShowFirstVaultModal] = useState(false);
  const [creatingFirstVault, setCreatingFirstVault] = useState(false);
  // Espelha activeVaultId pra checar, dentro de callbacks de fetch já em voo,
  // se a resposta ainda é do vault ativo — sem isso, trocar de vault rápido
  // (ex: logo depois de criar um vault novo) corre risco de uma resposta
  // ATRASADA do vault ANTERIOR sobrescrever os dados corretos do vault novo
  // (ordem de conclusão de rede não é garantida ser a ordem de disparo).
  const activeVaultIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeVaultIdRef.current = activeVaultId;
  }, [activeVaultId]);

  const [homeView, setHomeView] = useState<HomeView>({ kind: "library" });
  const [libraryNotes, setLibraryNotes] = useState<LibraryNote[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);

  // Tela dividida: dois painéis independentes (cada um com seu próprio estado
  // de nota, edição, comentários etc. — ver NotePanel.tsx), controlados por
  // qual arquivo cada um mostra. panelB só existe (é renderizado) quando
  // splitMode está ativo. focusedPanel decide pra qual painel vai a próxima
  // nota aberta pela sidebar quando os dois já estão ocupados.
  const [panelA, setPanelA] = useState<string | null>(null);
  const [panelB, setPanelB] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState(false);
  const [focusedPanel, setFocusedPanel] = useState<"a" | "b">("a");
  const panelARef = useRef<NotePanelHandle>(null);
  const panelBRef = useRef<NotePanelHandle>(null);

  // Recolher/expandir a sidebar de notas — não precisa persistir entre
  // sessões, sempre volta expandida ao reabrir o app.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Abaixo do breakpoint (ver useIsMobile.ts), a UI simplifica: split-screen
  // some, e a sidebar vira um drawer por cima da tela em vez de dividir o
  // espaço horizontal — ver mobileSidebarOpen logo abaixo.
  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Aba ativa da sidebar (dentro do modo editor) — "Notas" (lista plana, por
  // título) ou "Tags" (árvore hierárquica, ver src/lib/tagTree.ts). A busca
  // abaixo é compartilhada pelas duas.
  const [sidebarTab, setSidebarTab] = useState<"notes" | "tags">("notes");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
  // Filtro por tipo da aba "Tags" — escondido por padrão atrás do ícone de
  // livro ao lado da busca (usado com pouca frequência, mesmo espírito do
  // "⋯" do painel de imagem); não reseta ao trocar de aba, mesmo espírito de
  // sidebarSearch.
  const [sidebarTypeFilter, setSidebarTypeFilter] = useState<ContentTypeFilter>("all");
  const [showSidebarTypeFilter, setShowSidebarTypeFilter] = useState(false);
  // Chave da ocorrência sendo renomeada na sidebar: "group.key::note.filename",
  // não só o filename — uma nota com várias tags aparece repetida em vários grupos,
  // e se a chave fosse só o filename, TODAS as ocorrências virariam <input
  // autoFocus> ao mesmo tempo; dois autoFocus simultâneos brigam pelo foco real do
  // navegador, o primeiro perde o foco, dispara onBlur, e cancela o rename sozinho.
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [noteRowMenu, setNoteRowMenu] = useState<{ x: number; y: number; rowKey: string; filename: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ filename: string } | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState<{ filenames: string[] } | null>(null);
  // Rastreia o clique anterior na sidebar pra distinguir "clique, espera, clique
  // de novo" (entra em modo renomear) de um duplo-clique rápido (só reabre a nota
  // — não deve renomear sem querer).
  const lastNoteClickRef = useRef<{ filename: string; time: number } | null>(null);

  // Menu "+" (Nota em branco / Importar PDF/EPUB) — uma única instância
  // compartilhada pelos 3 gatilhos (homepage, header, sidebar).
  const [newNoteMenuAnchor, setNewNoteMenuAnchor] = useState<{
    x: number;
    y: number;
    direction: "down-right" | "up-left";
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importingMessage, setImportingMessage] = useState("Convertendo arquivo...");
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [importWebOpen, setImportWebOpen] = useState(false);
  const [importWebUrl, setImportWebUrl] = useState("");
  const [creatingBlankNote, setCreatingBlankNote] = useState(false);

  // Última view (biblioteca/lista de tag/todas as notas) antes de abrir uma
  // nota no editor — permite o botão "Voltar" retornar exatamente pra onde a
  // pessoa estava, em vez de sempre cair na Biblioteca raiz.
  const [previousHomeView, setPreviousHomeView] = useState<HomeView>({ kind: "library" });

  const [showGraph, setShowGraph] = useState(false);
  const [graphScope, setGraphScope] = useState<"local" | "global">("local");
  const [graphLayout, setGraphLayout] = useState<"force" | "radial">("force");
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  // Tela cheia do Graph View: um overlay cobrindo a janela inteira em vez do
  // painel lateral de 420px — o conteúdo (cabeçalho + toggles + GraphView) é o
  // mesmo, só muda o wrapper (ver graphPanelBody mais abaixo).
  const [graphFullscreen, setGraphFullscreen] = useState(false);

  // Tema claro/escuro — sempre começa em "dark" (igual ao servidor, que não
  // tem acesso a localStorage) pra não causar hydration mismatch; o script em
  // layout.tsx já aplicou o data-theme certo no <html> ANTES do primeiro
  // paint (isso evita o flash visual), e este efeito só sincroniza o estado
  // React com o que já está no DOM logo depois da hidratação.
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    if (document.documentElement.dataset.theme === "light") setTheme("light");
  }, []);

  // Tamanho de fonte do editor: um padrão global ("fontSize") e sobrescritas
  // por nota ("fontSizeOverrides", um blob { [filename]: number }) — compartilhado
  // entre os dois painéis (a mesma nota deve ler o mesmo tamanho não importa em
  // qual painel for aberta).
  const [globalFontSize, setGlobalFontSize] = useState<number>(14);
  const [noteFontSizes, setNoteFontSizes] = useState<Record<string, number>>({});
  useEffect(() => {
    const storedGlobal = localStorage.getItem("fontSize");
    if (storedGlobal) {
      const parsed = Number(storedGlobal);
      if (!Number.isNaN(parsed)) setGlobalFontSize(parsed);
    }
    const storedOverrides = localStorage.getItem("fontSizeOverrides");
    if (storedOverrides) {
      try {
        setNoteFontSizes(JSON.parse(storedOverrides));
      } catch {
        // ignora blob corrompido
      }
    }
  }, []);

  function fontSizeFor(filename: string | null): number {
    return (filename && noteFontSizes[filename]) || globalFontSize;
  }

  function handleFontSizeChange(filename: string | null, newSize: number) {
    if (filename && filename in noteFontSizes) {
      const next = { ...noteFontSizes, [filename]: newSize };
      setNoteFontSizes(next);
      localStorage.setItem("fontSizeOverrides", JSON.stringify(next));
    } else {
      setGlobalFontSize(newSize);
      localStorage.setItem("fontSize", String(newSize));
    }
  }

  function handleToggleFontSizeOverride(filename: string, checked: boolean, currentSize: number) {
    const next = { ...noteFontSizes };
    if (checked) next[filename] = currentSize;
    else delete next[filename];
    setNoteFontSizes(next);
    localStorage.setItem("fontSizeOverrides", JSON.stringify(next));
  }

  // Fonte do corpo do texto: mesmo padrão de fontSize acima (global +
  // overrides por nota), mas independente — cada preferência liga/desliga
  // por conta própria.
  const [globalNoteFont, setGlobalNoteFont] = useState<NoteFontId>(DEFAULT_NOTE_FONT);
  const [noteFontOverrides, setNoteFontOverrides] = useState<Record<string, NoteFontId>>({});
  useEffect(() => {
    const storedGlobal = localStorage.getItem("noteFont");
    if (storedGlobal) setGlobalNoteFont(storedGlobal as NoteFontId);
    const storedOverrides = localStorage.getItem("noteFontOverrides");
    if (storedOverrides) {
      try {
        setNoteFontOverrides(JSON.parse(storedOverrides));
      } catch {
        // ignora blob corrompido
      }
    }
  }, []);

  function noteFontFor(filename: string | null): NoteFontId {
    return (filename && noteFontOverrides[filename]) || globalNoteFont;
  }

  function handleNoteFontChange(filename: string | null, newFont: NoteFontId) {
    if (filename && filename in noteFontOverrides) {
      const next = { ...noteFontOverrides, [filename]: newFont };
      setNoteFontOverrides(next);
      localStorage.setItem("noteFontOverrides", JSON.stringify(next));
    } else {
      setGlobalNoteFont(newFont);
      localStorage.setItem("noteFont", newFont);
    }
  }

  function handleToggleNoteFontOverride(filename: string, checked: boolean, currentFont: NoteFontId) {
    const next = { ...noteFontOverrides };
    if (checked) next[filename] = currentFont;
    else delete next[filename];
    setNoteFontOverrides(next);
    localStorage.setItem("noteFontOverrides", JSON.stringify(next));
  }

  const [noteTargets, setNoteTargets] = useState<{ filename: string; title: string; aliases: string[] }[]>([]);

  // Nota "em foco" no momento — usada pelo Graph view (escopo local) e por
  // qualquer outra coisa global que precise saber "a nota que a pessoa está
  // olhando agora", já que com dois painéis não existe mais uma "activeNote" única.
  const focusedFilename = focusedPanel === "a" ? panelA : panelB;

  // Salva a lista inteira de tags de uma nota (chamado pelo NotePanel a cada
  // adição/remoção de chip) e reflete a mudança na sidebar sem recarregar a
  // página inteira.
  function handleTagsChanged(filename: string, nextTags: string[]) {
    setLibraryNotes((prev) => prev.map((note) => (note.filename === filename ? { ...note, tags: nextTags } : note)));
    vaultFetch("/api/note/tags", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, tags: nextTags }),
    }).then(() => refreshAllTags());
  }

  // Salva o status de estudo escolhido no dropdown do painel de controles e
  // reflete a mudança na Homepage (seção "Progresso") sem recarregar a página.
  function handleStatusChanged(filename: string, nextStatus: string) {
    setLibraryNotes((prev) => prev.map((note) => (note.filename === filename ? { ...note, status: nextStatus } : note)));
    vaultFetch("/api/note/status", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, status: nextStatus }),
    });
  }

  // Alterna favorito (estrela no card e no editor) — mesma fonte única
  // chamada por todo card (Homepage/listas/sidebar) e pelo NotePanel, pra
  // nunca divergir. Favoritar não conta como "atividade" (ver touchActivity
  // em vaultIndex.ts), então não afeta "Editados recentemente".
  function handleFavoriteChanged(filename: string, isFavorite: boolean) {
    setLibraryNotes((prev) => prev.map((note) => (note.filename === filename ? { ...note, isFavorite } : note)));
    vaultFetch("/api/note/favorite", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, isFavorite }),
    });
  }

  // Wrapper de handleFavoriteChanged pra quem só tem o filename à mão (cards
  // da Homepage/listas/sidebar) e precisa inverter o valor atual — o
  // NotePanel já sabe o próximo valor de antemão (seu próprio estado local),
  // então chama handleFavoriteChanged direto.
  function toggleFavorite(filename: string) {
    const note = libraryNotes.find((n) => n.filename === filename);
    if (note) handleFavoriteChanged(filename, !note.isFavorite);
  }

  function toggleGraphPanel() {
    setShowGraph((prev) => !prev);
  }

  function setGraphScopeSafe(scope: "local" | "global") {
    setGraphScope(scope);
    // Radial só faz sentido com um nó central (escopo local).
    if (scope === "global" && graphLayout === "radial") {
      setGraphLayout("force");
    }
  }

  // Refaz a busca do grafo sempre que o painel está aberto e o escopo (ou a nota
  // em foco, quando o escopo é local) muda. Layout é só uma escolha de desenho —
  // não precisa buscar dados de novo quando ele muda.
  useEffect(() => {
    if (!showGraph) return;

    const params = new URLSearchParams();
    if (graphScope === "local" && focusedFilename) {
      params.set("scope", "local");
      params.set("filename", focusedFilename);
    } else {
      params.set("scope", "global");
    }

    const requestedVaultId = activeVaultId;
    vaultFetch(`/api/graph?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (activeVaultIdRef.current !== requestedVaultId) return; // vault já trocou; resposta obsoleta
        if (data.nodes) setGraphData({ nodes: data.nodes, edges: data.edges ?? [] });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGraph, graphScope, focusedFilename, activeVaultId]);

  // Busca a lista de tags já conhecidas no vault — alimenta o autocomplete do
  // TagField. Refeita depois de qualquer mudança de tags pra incluir as novas.
  function refreshAllTags() {
    const requestedVaultId = activeVaultId;
    vaultFetch("/api/tags")
      .then((res) => res.json())
      .then((data) => {
        if (activeVaultIdRef.current !== requestedVaultId) return; // vault já trocou; resposta obsoleta
        if (data.tagCounts) setAllTags((data.tagCounts as [string, number][]).map(([tag]) => tag));
      });
  }

  useEffect(() => {
    if (!activeVaultId) return;
    refreshAllTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVaultId]);

  function toggleTagGroup(key: string) {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Aba "Notas" da sidebar: lista plana de todas as notas do vault, por
  // título — sem agrupamento por tag. Filtrada só pelo título (busca de tag
  // é papel da aba "Tags").
  const sidebarNotesList = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    const matches = q ? libraryNotes.filter((note) => note.title.toLowerCase().includes(q)) : libraryNotes;
    return [...matches].sort((a, b) => a.title.localeCompare(b.title));
  }, [libraryNotes, sidebarSearch]);

  // Aba "Tags" da sidebar: árvore hierárquica (ver src/lib/tagTree.ts — tags
  // com "." viram níveis, ex: "História.Antiga"), filtrada pela mesma busca E
  // pelo filtro de tipo (sidebarTypeFilter). Como buildTagTree só cria nós
  // pra tags presentes em `counts`, filtrar as notas ANTES de contar já
  // esconde sozinho qualquer tema/subtema sem nenhum item que bata com o
  // tipo selecionado — sem precisar de lógica extra de "esconder nó vazio".
  // "Sem tag" fica de fora da árvore (não é uma tag de verdade) e é
  // renderizado como um item plano à parte, sempre por último — mesmo
  // espírito do grupo "Sem tag" que a sidebar já tinha antes das abas.
  const sidebarTagTree = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of libraryNotes) {
      if (!matchesTypeFilter(note, sidebarTypeFilter)) continue;
      for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return filterTagTree(buildTagTree(Array.from(counts.entries())), sidebarSearch);
  }, [libraryNotes, sidebarSearch, sidebarTypeFilter]);

  const sidebarUntaggedNotes = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    return libraryNotes.filter(
      (note) => note.tags.length === 0 && matchesTypeFilter(note, sidebarTypeFilter) && (!q || note.title.toLowerCase().includes(q))
    );
  }, [libraryNotes, sidebarSearch, sidebarTypeFilter]);

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      if (next === "light") {
        document.documentElement.dataset.theme = "light";
      } else {
        delete document.documentElement.dataset.theme;
      }
      localStorage.setItem("theme", next);
      return next;
    });
  }

  // Sempre injeta o vault ativo na URL — usado no lugar de fetch() cru em toda
  // chamada às rotas vault-aware, pra nunca esquecer o parâmetro num dos ~35
  // call sites do app (ver src/lib/vaultContext.tsx). Memoizado (referência
  // só muda quando activeVaultId muda) pra poder entrar em array de
  // dependência de efeitos sem causar reexecuções espúrias a cada render.
  const vaultFetch = useCallback(
    (url: string, init?: RequestInit): Promise<Response> => {
      if (!activeVaultId) return Promise.reject(new Error("Nenhum vault ativo"));
      return fetch(appendVaultParam(url, activeVaultId), init);
    },
    [activeVaultId]
  );

  // Troca de vault: reseta todo o estado "por vault" (painéis abertos, busca,
  // Graph View) e persiste a escolha — o efeito logo abaixo, que depende de
  // [activeVaultId], cuida de rebuscar noteTargets/library do vault novo.
  function switchVault(id: string) {
    setActiveVaultId(id);
    localStorage.setItem("activeVaultId", id);
    setPanelA(null);
    setPanelB(null);
    setSplitMode(false);
    setFocusedPanel("a");
    setHomeView({ kind: "library" });
    setShowGraph(false);
    setSidebarSearch("");
  }

  // Só troca o rótulo de exibição do vault (ver renameVault em vaultRegistry.ts)
  // — atualiza a lista local sem precisar rebuscar tudo do servidor.
  async function renameVaultEntry(id: string, name: string) {
    const res = await fetch("/api/vaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
    const data = await res.json();
    if (data.vault) {
      setVaults((prev) => prev.map((v) => (v.id === id ? data.vault : v)));
    }
  }

  // Remove um vault do registro + apaga seu índice SQLite (ver DELETE
  // /api/vaults) — nunca toca na pasta de notas original no disco. Se o vault
  // removido era o ativo, troca pro primeiro restante ou, se não sobrar
  // nenhum, volta pra tela de boas-vindas (activeVaultId null com
  // vaultsLoaded true).
  async function removeVaultEntry(id: string) {
    const res = await fetch("/api/vaults", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!data.ok) {
      window.alert(data.error ?? "Não foi possível remover o vault");
      return;
    }
    const remaining = vaults.filter((v) => v.id !== id);
    setVaults(remaining);
    if (id === activeVaultId) {
      if (remaining.length > 0) {
        switchVault(remaining[0].id);
      } else {
        setActiveVaultId(null);
        localStorage.removeItem("activeVaultId");
      }
    }
  }

  // Criação do primeiro vault, a partir da tela de boas-vindas (registro
  // vazio) — mesmo fluxo de VaultSwitcher.handleCreateSubmit/handlePickFolder,
  // duplicado aqui porque essa tela é renderizada antes do
  // VaultContext.Provider/header onde o VaultSwitcher normalmente vive.
  async function handleCreateFirstVault(name: string) {
    setCreatingFirstVault(true);
    try {
      const res = await fetch("/api/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!data.vault) {
        window.alert(data.error ?? "Não foi possível criar o vault");
        return;
      }
      setVaults([data.vault]);
      switchVault(data.vault.id);
      setShowFirstVaultModal(false);
    } finally {
      setCreatingFirstVault(false);
    }
  }

  async function finishPickFolderFirstVault(selected: string) {
    setCreatingFirstVault(true);
    try {
      const res = await fetch("/api/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selected }),
      });
      const data = await res.json();
      if (!data.vault) {
        window.alert(data.error ?? "Não foi possível adicionar o vault");
        return;
      }
      setVaults([data.vault]);
      switchVault(data.vault.id);
      setShowFirstVaultModal(false);
    } finally {
      setCreatingFirstVault(false);
    }
  }

  async function handlePickFolderFirstVault() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const selected = await invoke<string | null>("pick_folder");
      if (typeof selected !== "string") return; // cancelado
      await finishPickFolderFirstVault(selected);
    } catch (err) {
      window.alert("Não foi possível abrir o seletor de pasta: " + String(err));
    }
  }

  // Carrega a lista de vaults uma única vez ao abrir o app (rota vault-agnóstica,
  // não passa por vaultFetch), e decide qual fica ativo: o último usado
  // (localStorage), se ainda existir na lista, ou o primeiro vault conhecido
  // (cobre o bootstrap automático do vault "Principal").
  useEffect(() => {
    fetch("/api/vaults")
      .then((res) => res.json())
      .then((data) => {
        const list: VaultEntry[] = data.vaults ?? [];
        setVaults(list);
        setVaultsLoaded(true);
        if (list.length === 0) return;
        const stored = localStorage.getItem("activeVaultId");
        const initial = stored && list.some((v) => v.id === stored) ? stored : list[0].id;
        setActiveVaultId(initial);
      });
  }, []);

  // Mantém o ImageWidget (livePreview.ts) sabendo qual vault está ativo — ver
  // comentário lá sobre por que isso não pode vir de um Contexto React.
  useEffect(() => {
    if (activeVaultId) setLivePreviewVaultId(activeVaultId);
  }, [activeVaultId]);

  function fetchNoteTargets() {
    const requestedVaultId = activeVaultId;
    vaultFetch("/api/note-targets")
      .then((res) => res.json())
      .then((data) => {
        if (activeVaultIdRef.current !== requestedVaultId) return; // vault já trocou; resposta obsoleta
        if (data.targets) setNoteTargets(data.targets);
      });
  }

  // Dados da tela de biblioteca — mesmo timing de atualização do fetchNoteTargets
  // acima (uma vez ao abrir a página, e de novo depois de cada save/rename/create).
  function fetchLibraryData() {
    const requestedVaultId = activeVaultId;
    vaultFetch("/api/library")
      .then((res) => res.json())
      .then((data) => {
        if (activeVaultIdRef.current !== requestedVaultId) return; // vault já trocou; resposta obsoleta
        if (data.notes) setLibraryNotes(data.notes);
      });
  }

  function handleLibraryChanged() {
    fetchNoteTargets();
    fetchLibraryData();
  }

  // Roda de novo sempre que o vault ativo muda (inclusive a primeira vez que
  // ele é resolvido), e de novo depois de cada save (pra refletir
  // título/aliases/notas novas na hora, sem precisar recarregar a página).
  useEffect(() => {
    if (!activeVaultId) return;
    fetchNoteTargets();
    fetchLibraryData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVaultId]);

  // Abre uma nota num painel, decidindo qual: fora do modo dividido é sempre o
  // painel A; dividido, prioriza o painel vazio e, se os dois já tiverem nota,
  // usa o painel que estava em foco por último. Também troca pra visão de
  // editor, já que abrir uma nota faz sentido a partir de qualquer tela
  // (biblioteca, lista de tema, etc.).
  function openNoteInPanel(filename: string): "a" | "b" {
    // Só atualiza a "página anterior" ao vir de fora do editor — trocar de
    // nota enquanto já se está no editor não deve mexer no destino do "Voltar".
    if (homeView.kind !== "editor") setPreviousHomeView(homeView);
    setHomeView({ kind: "editor" });
    if (!splitMode) {
      setPanelA(filename);
      setFocusedPanel("a");
      return "a";
    }
    const target: "a" | "b" = panelB === null ? "b" : panelA === null ? "a" : focusedPanel;
    if (target === "a") setPanelA(filename);
    else setPanelB(filename);
    setFocusedPanel(target);
    return target;
  }

  function handleToggleSplit() {
    if (splitMode) {
      // Mesma ação do × do painel B: fecha a divisão, mantém o painel A.
      setSplitMode(false);
      setPanelB(null);
      setFocusedPanel("a");
    } else {
      setSplitMode(true);
    }
  }

  function closePanelB() {
    setSplitMode(false);
    setPanelB(null);
    setFocusedPanel("a");
  }

  // Split-screen fica indisponível no mobile (ver header, botão "Dividir
  // tela" oculto). Cobre o caso de já estar dividido ao encolher a janela
  // (ou girar um tablet) abaixo do breakpoint — reaproveita a mesma
  // closePanelB() do botão × do painel B.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza splitMode com a largura da tela, não há "sistema externo" pra assinar aqui (matchMedia em si já é assinado por useIsMobile)
    if (isMobile && splitMode) closePanelB();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  function closePanelA() {
    // Promove o painel B pra posição de A antes de sair da divisão.
    setPanelA(panelB);
    setPanelB(null);
    setSplitMode(false);
    setFocusedPanel("a");
  }

  // Renomeia uma nota a partir da sidebar — não necessariamente a nota aberta
  // num painel. Se estiver aberta em A e/ou B, grava a edição pendente daquele
  // painel ANTES de renomear (senão uma edição não salva pode se perder ou ser
  // salva com o nome errado), e atualiza o painel pro novo nome depois.
  async function renameSidebarNote(filename: string, newTitleRaw: string) {
    const trimmed = newTitleRaw.trim();
    const currentTitle = stripMdExtension(filename);
    if (!trimmed || trimmed === currentTitle) {
      setRenamingKey(null);
      return;
    }

    const isInA = filename === panelA;
    const isInB = filename === panelB;
    if (isInA) await panelARef.current?.flushPendingSave();
    if (isInB) await panelBRef.current?.flushPendingSave();

    const res = await vaultFetch("/api/note/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldFilename: filename, newTitle: trimmed }),
    });
    const data = await res.json();
    if (!data.filename) {
      window.alert(data.error ?? "desconhecido");
      setRenamingKey(null);
      return;
    }

    const newFilename: string = data.filename;
    setRenamingKey(null);
    fetchNoteTargets();
    fetchLibraryData();
    if (isInA) setPanelA(newFilename);
    if (isInB) setPanelB(newFilename);
  }

  // Só abre o modal de confirmação — a exclusão de verdade acontece em
  // performDeleteNote, chamada depois que o usuário confirma no modal.
  function requestDeleteNote(filename: string) {
    setConfirmDelete({ filename });
  }

  // Núcleo de "apagar 1 arquivo": chama a rota DELETE (que já cuida do índice
  // SQLite via ON DELETE CASCADE/SET NULL) e fecha o painel A/B se a nota
  // apagada estava aberta neles — sem mexer na biblioteca/noteTargets, que quem
  // chama recarrega uma única vez no final (importa pro caso de lote, onde
  // recarregar a cada arquivo apagado seria redundante). Devolve se deu certo.
  async function deleteNoteFileOnly(filename: string): Promise<boolean> {
    const isInA = filename === panelA;
    const isInB = filename === panelB;
    if (isInA) panelARef.current?.cancelPendingSave();
    if (isInB) panelBRef.current?.cancelPendingSave();

    const res = await vaultFetch(`/api/note?filename=${encodeURIComponent(filename)}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.success) return false;

    if (isInA) {
      setPanelA(null);
      if (!splitMode) setHomeView({ kind: "library" });
    }
    if (isInB) setPanelB(null);
    return true;
  }

  // Apaga a nota do disco pra valer (ação irreversível).
  async function performDeleteNote(filename: string) {
    const ok = await deleteNoteFileOnly(filename);
    if (!ok) {
      window.alert("Não foi possível apagar a nota");
      return;
    }
    fetchNoteTargets();
    fetchLibraryData();
  }

  // Só abre o modal de confirmação em lote — a exclusão de verdade acontece em
  // performDeleteMultiple, chamada depois que o usuário confirma no modal.
  function requestDeleteMultiple(filenames: string[]) {
    if (filenames.length === 0) return;
    setConfirmBulkDelete({ filenames });
  }

  // Apaga várias notas de uma vez (ação irreversível) — recarrega a biblioteca
  // uma única vez no final, não a cada arquivo.
  async function performDeleteMultiple(filenames: string[]) {
    const results = await Promise.all(filenames.map(deleteNoteFileOnly));
    fetchNoteTargets();
    fetchLibraryData();
    const failedCount = results.filter((ok) => !ok).length;
    if (failedCount > 0) {
      window.alert(`${failedCount} de ${filenames.length} notas não puderam ser apagadas.`);
    }
  }

  // Renomear disparado a partir de um card na Homepage/lista de tag: abre a
  // nota no painel certo e foca/seleciona o campo de título assim que ele
  // estiver montado.
  function handleRenameFromCard(filename: string) {
    const target = openNoteInPanel(filename);
    if (target === "a") panelARef.current?.focusTitle();
    else panelBRef.current?.focusTitle();
  }

  // Distingue "clique, espera, clique de novo" (entra em modo renomear) de um
  // duplo-clique rápido no mesmo item (deve só reabrir a nota, sem renomear).
  function handleSidebarNoteClick(key: string, filename: string) {
    const now = Date.now();
    const last = lastNoteClickRef.current;
    const isOpenSomewhere = filename === panelA || filename === panelB;
    if (last && last.filename === filename && isOpenSomewhere && now - last.time > 400 && now - last.time < 2500) {
      lastNoteClickRef.current = null;
      setRenameDraft(stripMdExtension(filename));
      setRenamingKey(key);
      return;
    }
    lastNoteClickRef.current = { filename, time: now };
    if (isMobile) setMobileSidebarOpen(false);
    openNoteInPanel(filename);
  }

  // Uma linha de nota na sidebar (título + "..." → NoteRowMenu, com rename
  // inline) — reaproveitada pela aba "Notas" (lista plana, com tempo relativo
  // + estrela de favorito) e pela aba "Tags" (notas reveladas ao expandir um
  // nó, sem esses dois extras). `rowKey` é só o filename na aba "Notas" (cada
  // nota aparece uma única vez ali); na aba "Tags" seria `fullPath::filename`
  // se a MESMA nota pudesse ficar em rename simultâneo em dois nós abertos ao
  // mesmo tempo — mesmo motivo do `group.key::filename` de antes das abas.
  function renderSidebarNoteRow(note: LibraryNote, rowKey: string, options: { indent: string; showMeta?: boolean }) {
    const isOpen = note.filename === panelA || note.filename === panelB;
    if (renamingKey === rowKey) {
      return (
        <input
          autoFocus
          value={renameDraft}
          onChange={(e) => setRenameDraft(e.target.value)}
          onBlur={() => renameSidebarNote(note.filename, renameDraft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setRenamingKey(null);
            }
          }}
          style={{
            width: "100%",
            padding: `0.4rem 0.5rem 0.4rem ${options.indent}`,
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: "4px",
            color: "var(--foreground)",
            fontSize: "0.85rem",
            boxSizing: "border-box",
          }}
        />
      );
    }
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
        <button
          onClick={() => handleSidebarNoteClick(rowKey, note.filename)}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: "left",
            padding: `0.4rem 0.5rem 0.4rem ${options.indent}`,
            background: isOpen ? "var(--panel-hover)" : "transparent",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            color: "var(--foreground)",
            fontSize: "0.85rem",
            overflow: "hidden",
          }}
        >
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.title}</div>
          {options.showMeta && (
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{formatRelativeTime(note.lastActivityMs)}</div>
          )}
        </button>
        {options.showMeta && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(note.filename);
            }}
            className="toolbar-link"
            title={note.isFavorite ? "Remover dos favoritos" : "Marcar como favorita"}
            style={{ flexShrink: 0, padding: "0.4rem 0.2rem", border: "none", borderRadius: "4px", cursor: "pointer", background: "transparent", display: "flex", alignItems: "center" }}
          >
            <StarIcon filled={note.isFavorite} />
          </button>
        )}
        <button
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setNoteRowMenu({ x: rect.left, y: rect.bottom + 4, rowKey, filename: note.filename });
          }}
          className="toolbar-link"
          title="Opções"
          style={{
            flexShrink: 0,
            padding: "0.4rem 0.3rem",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <MoreIcon />
        </button>
      </div>
    );
  }

  // Nó recursivo da árvore de tags (aba "Tags") — expandir/recolher revela os
  // nós-filho E as notas cuja tag bate EXATAMENTE com este nó (nunca com um
  // descendente — cada nota aparece só dentro do nó mais específico da sua
  // tag, a folha da hierarquia; o nó pai mostra só o contador agregado
  // (totalCount) sem listar as notas dos filhos, senão a mesma nota apareceria
  // duplicada em cada nível da hierarquia até a raiz).
  function renderTagTreeNode(node: TagTreeNode, depth: number) {
    const isExpanded = sidebarSearch.trim() !== "" || expandedTags.has(node.fullPath);
    const matchingNotes = isExpanded
      ? libraryNotes.filter((n) => n.tags.includes(node.fullPath) && matchesTypeFilter(n, sidebarTypeFilter))
      : [];
    return (
      <div key={node.fullPath} style={{ marginBottom: "0.25rem" }}>
        <button
          onClick={() => toggleTagGroup(node.fullPath)}
          className="toolbar-link"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            padding: `0.4rem 0.3rem 0.4rem ${0.3 + depth * 0.9}rem`,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--foreground)",
            fontSize: "0.85rem",
            borderRadius: "4px",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <span
              style={{
                display: "inline-block",
                transition: "transform 0.15s ease",
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                fontSize: "0.75rem",
                flexShrink: 0,
              }}
            >
              ›
            </span>
            {formatTagLabel(node.name)}
          </span>
          <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{node.totalCount}</span>
        </button>

        {isExpanded && (
          <>
            {node.children.map((child) => renderTagTreeNode(child, depth + 1))}
            {matchingNotes.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, margin: "0.15rem 0 0.5rem 0" }}>
                {matchingNotes.map((note) => (
                  <li key={note.filename} style={{ marginBottom: "0.3rem" }}>
                    {renderSidebarNoteRow(note, `${node.fullPath}::${note.filename}`, { indent: `${1.3 + depth * 0.9}rem` })}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    );
  }

  // Atalho global (não é um keymap do CodeMirror — precisa funcionar em
  // qualquer lugar do app, não só com o editor focado): Alt+N cria nota em
  // branco direto, sem passar pelo menu "+".
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleCreateBlank();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape sai da tela cheia do Graph View (volta pro painel lateral) em vez de
  // fechar o painel inteiro — mesmo padrão de outros popovers/menus do app.
  useEffect(() => {
    if (!graphFullscreen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setGraphFullscreen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [graphFullscreen]);

  // Cria a nota a partir de um "[[link]]" pra um título ainda inexistente,
  // clicado dentro de um painel — a criação em si é uma operação global
  // (precisa atualizar noteTargets/library), mas quem decide o que fazer com o
  // resultado (navegar até lá) é o próprio painel que disparou o clique.
  async function handleCreateNoteFromLink(title: string): Promise<string | null> {
    const res = await vaultFetch("/api/note/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    if (data.filename) {
      fetchNoteTargets();
      fetchLibraryData();
      return data.filename;
    }
    return null;
  }

  // Abre o menu "+" (Nota em branco / Importar) ancorado no botão que disparou.
  // "up-left" (usado pelo FAB no canto inferior direito da tela) cresce a
  // partir do canto superior-esquerdo do gatilho, pra não nascer fora da tela.
  function openNewNoteMenu(rect: DOMRect, direction: "down-right" | "up-left" = "down-right") {
    if (direction === "up-left") {
      setNewNoteMenuAnchor({ x: rect.left, y: rect.top - 6, direction });
    } else {
      setNewNoteMenuAnchor({ x: rect.left, y: rect.bottom + 6, direction });
    }
  }

  // Ctrl/Alt+N e o item "Nota em branco" do menu "+" caem aqui direto —
  // mesma rota que handleCreateNoteFromLink.
  // Guarda contra clique duplo/repetido enquanto a criação ainda está em
  // andamento (sem isso, cliques repetidos — ex: por a requisição demorar e
  // parecer que "nada aconteceu" — disparam uma criação por clique, todas
  // resolvendo de uma vez quando a resposta finalmente chega).
  async function handleCreateBlank() {
    if (creatingBlankNote) return;
    setNewNoteMenuAnchor(null);
    setCreatingBlankNote(true);
    try {
      const res = await vaultFetch("/api/note/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Sem título" }),
      });
      const data = await res.json();
      if (data.filename) {
        fetchNoteTargets();
        fetchLibraryData();
        const target = openNoteInPanel(data.filename);
        (target === "a" ? panelARef : panelBRef).current?.focusTitle();
      }
    } finally {
      setCreatingBlankNote(false);
    }
  }

  function handleImportClick() {
    setNewNoteMenuAnchor(null);
    importFileInputRef.current?.click();
  }

  function handleImportWebClick() {
    setNewNoteMenuAnchor(null);
    setImportWebUrl("");
    setImportWebOpen(true);
  }

  // Usado tanto pelo <input type="file"> (nos 3 gatilhos do menu "+") quanto
  // pelo arrastar-e-soltar na Biblioteca — um único caminho de conversão.
  async function handleFileSelected(file: File) {
    setImportingMessage("Convertendo arquivo...");
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await vaultFetch("/api/note/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!data.filename) {
        window.alert(data.error ?? "Não foi possível converter o arquivo");
        return;
      }
      fetchNoteTargets();
      fetchLibraryData();
      openNoteInPanel(data.filename);
    } finally {
      setImporting(false);
    }
  }

  // Mantém o modal de URL aberto em caso de erro (pra tentar de novo sem
  // reescrever a URL) — só fecha quando a importação dá certo.
  async function handleImportWebSubmit(url: string) {
    setImportingMessage("Extraindo artigo...");
    setImporting(true);
    try {
      const res = await vaultFetch("/api/note/import-web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!data.filename) {
        window.alert(data.error ?? "Não foi possível importar o artigo");
        return;
      }
      setImportWebOpen(false);
      setImportWebUrl("");
      fetchNoteTargets();
      fetchLibraryData();
      openNoteInPanel(data.filename);
    } finally {
      setImporting(false);
    }
  }

  // Conteúdo do painel do Graph View — montado uma única vez e reaproveitado
  // tanto no painel lateral de 420px quanto no overlay de tela cheia (ver mais
  // abaixo), pra não duplicar o <GraphView> (e a simulação por trás dele) nos
  // dois lugares ao mesmo tempo.
  const graphPanelBody = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Graph view</h2>
        <button
          onClick={() => {
            setShowGraph(false);
            setGraphFullscreen(false);
          }}
          style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "1.2rem", color: "var(--foreground)" }}
        >
          ×
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", border: "1px solid var(--panel-border)", borderRadius: "4px", overflow: "hidden" }}>
          <button
            onClick={() => setGraphScopeSafe("local")}
            disabled={!focusedFilename}
            style={{
              padding: "0.3rem 0.6rem",
              background: graphScope === "local" ? "var(--panel-hover)" : "transparent",
              border: "none",
              cursor: focusedFilename ? "pointer" : "not-allowed",
              opacity: focusedFilename ? 1 : 0.5,
              fontSize: "0.8rem",
              color: "var(--foreground)",
            }}
          >
            Local
          </button>
          <button
            onClick={() => setGraphScopeSafe("global")}
            style={{
              padding: "0.3rem 0.6rem",
              background: graphScope === "global" ? "var(--panel-hover)" : "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "0.8rem",
              color: "var(--foreground)",
            }}
          >
            Global
          </button>
        </div>

        <div style={{ display: "flex", border: "1px solid var(--panel-border)", borderRadius: "4px", overflow: "hidden" }}>
          <button
            onClick={() => setGraphLayout("force")}
            style={{
              padding: "0.3rem 0.6rem",
              background: graphLayout === "force" ? "var(--panel-hover)" : "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "0.8rem",
              color: "var(--foreground)",
            }}
          >
            Força
          </button>
          <button
            onClick={() => setGraphLayout("radial")}
            disabled={graphScope === "global"}
            style={{
              padding: "0.3rem 0.6rem",
              background: graphLayout === "radial" ? "var(--panel-hover)" : "transparent",
              border: "none",
              cursor: graphScope === "global" ? "not-allowed" : "pointer",
              opacity: graphScope === "global" ? 0.5 : 1,
              fontSize: "0.8rem",
              color: "var(--foreground)",
            }}
          >
            Radial
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <GraphView
          nodes={graphData.nodes}
          edges={graphData.edges}
          layoutMode={graphLayout}
          scope={graphScope}
          centerFilename={graphScope === "local" ? focusedFilename ?? undefined : undefined}
          activeNoteFilename={focusedFilename ?? undefined}
          onSelectNote={(filename) => openNoteInPanel(filename)}
          isFullscreen={graphFullscreen}
          onToggleFullscreen={() => setGraphFullscreen((v) => !v)}
        />
      </div>
    </>
  );

  // Ainda buscando /api/vaults — evita renderizar o app inteiro tentando
  // disparar vaultFetch sem vault.
  if (!vaultsLoaded) {
    return (
      <main style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--text-muted)" }}>
        Carregando...
      </main>
    );
  }

  // Registro carregado e vazio — instalação nova, ou último vault acabou de
  // ser removido (ver removeVaultEntry). Guia a criação do primeiro vault em
  // vez de cair num "Carregando..." que nunca resolveria sozinho.
  if (!activeVaultId) {
    return (
      <main
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          textAlign: "center",
          gap: "0.5rem",
        }}
      >
        <h1 style={{ fontSize: "2em", margin: 0 }}>Bem-vindo</h1>
        <p style={{ color: "var(--text-muted)", margin: "0 0 1.5rem 0", maxWidth: "320px", padding: "0 1rem" }}>
          Nenhum vault encontrado. Crie um vault para começar a guardar suas notas.
        </p>
        <button
          onClick={() => setShowFirstVaultModal(true)}
          style={{
            padding: "0.6rem 1.2rem",
            border: "none",
            borderRadius: "6px",
            background: "#2f7fd6",
            color: "white",
            cursor: "pointer",
            fontSize: "0.95rem",
          }}
        >
          + Criar vault
        </button>
        {showFirstVaultModal && (
          <CreateVaultModal
            submitting={creatingFirstVault}
            onSubmit={handleCreateFirstVault}
            onCancel={() => setShowFirstVaultModal(false)}
            onPickFolder={handlePickFolderFirstVault}
            allowFolderPicker={isTauri()}
          />
        )}
      </main>
    );
  }

  return (
    <VaultContext.Provider value={{ vaultId: activeVaultId, vaults, switchVault, renameVault: renameVaultEntry, vaultFetch }}>
    <main style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Barra de ferramentas fixa */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 1rem",
          borderBottom: "1px solid var(--panel-border)",
          position: "relative",
        }}
      >
        {/* Volta pra exatamente a tela de onde a nota foi aberta (biblioteca,
            lista de tag ou "todas as notas") — só aparece dentro do editor. */}
        {homeView.kind === "editor" && (
          <button
            onClick={() => setHomeView(previousHomeView)}
            className="toolbar-link"
            title="Voltar"
            style={{
              padding: "0.4rem 0.6rem",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              color: "var(--foreground)",
            }}
          >
            <BackArrowIcon />
          </button>
        )}

        {/* Título + link fixo de volta pra biblioteca, de qualquer lugar do app */}
        <button
          onClick={() => setHomeView({ kind: "library" })}
          className="toolbar-link"
          style={{
            marginRight: "1rem",
            padding: "0.3rem 0.5rem",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "1.05rem",
            color: "var(--foreground)",
          }}
        >
          Minha Biblioteca
        </button>

        <VaultSwitcher
          vaults={vaults}
          activeVaultId={activeVaultId}
          onSwitch={switchVault}
          onRename={renameVaultEntry}
          onCreated={(vault) => {
            setVaults((prev) => [...prev, vault]);
            switchVault(vault.id);
          }}
          onDelete={removeVaultEntry}
        />

        {homeView.kind === "editor" && (
          <>
            <button
              onClick={() => (isMobile ? setMobileSidebarOpen((prev) => !prev) : setSidebarCollapsed((prev) => !prev))}
              className="toolbar-link"
              title={isMobile ? "Menu" : sidebarCollapsed ? "Expandir sidebar" : "Recolher sidebar"}
              style={{
                padding: "0.4rem 0.6rem",
                background: (isMobile ? mobileSidebarOpen : sidebarCollapsed) ? "var(--panel-hover)" : undefined,
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <SidebarToggleIcon />
            </button>
            {/* Split-screen fica indisponível no mobile — sempre uma nota em
                tela cheia (ver useEffect que força closePanelB() acima). */}
            {!isMobile && (
              <button
                onClick={handleToggleSplit}
                className="toolbar-link"
                style={{
                  padding: "0.4rem 0.8rem",
                  background: splitMode ? "var(--panel-hover)" : undefined,
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Dividir tela
              </button>
            )}
          </>
        )}

        <button
          onClick={toggleGraphPanel}
          className="toolbar-link"
          style={{
            padding: "0.4rem 0.8rem",
            background: showGraph ? "var(--panel-hover)" : undefined,
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Graph view
        </button>

        <button
          onClick={(e) => openNewNoteMenu(e.currentTarget.getBoundingClientRect())}
          className="toolbar-link"
          title="Nova nota"
          style={{
            padding: "0.4rem 0.6rem",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
          }}
        >
          <PlusIcon />
        </button>

        <button
          onClick={toggleTheme}
          className="toolbar-link"
          title={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
          style={{
            padding: "0.4rem 0.6rem",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
          }}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>

      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
      {homeView.kind === "library" && (
        <LibraryHome
          notes={libraryNotes}
          onOpenNote={openNoteInPanel}
          onRenameNote={handleRenameFromCard}
          onDeleteNote={requestDeleteNote}
          onViewTag={(tag) => setHomeView({ kind: "tagList", tag })}
          onViewTagFocus={(macroTag) => setHomeView({ kind: "tagFocus", macroTag })}
          onViewStatus={(status) => setHomeView({ kind: "statusList", status })}
          onViewRecent={() => setHomeView({ kind: "recentList" })}
          onViewFavorites={() => setHomeView({ kind: "favoritesList" })}
          onToggleFavorite={toggleFavorite}
          onOpenNewNoteMenu={openNewNoteMenu}
          onFileDropped={handleFileSelected}
          onCreateBlank={handleCreateBlank}
          onImportClick={handleImportClick}
          onImportWebClick={handleImportWebClick}
          creatingBlankNote={creatingBlankNote}
        />
      )}

      {homeView.kind === "tagList" && (
        <TagNoteList
          tag={homeView.tag}
          notes={libraryNotes.filter((n) => (homeView.tag ? n.tags.includes(homeView.tag) : n.tags.length === 0))}
          onOpenNote={openNoteInPanel}
          onRenameNote={handleRenameFromCard}
          onDeleteNote={requestDeleteNote}
          onDeleteMultiple={requestDeleteMultiple}
          onToggleFavorite={toggleFavorite}
        />
      )}

      {homeView.kind === "tagFocus" && (
        <TagFocusPage
          macroTag={homeView.macroTag}
          notes={libraryNotes.filter(
            (n) => n.tags.includes(homeView.macroTag) || n.tags.some((t) => t.startsWith(`${homeView.macroTag}.`))
          )}
          onBack={() => setHomeView({ kind: "library" })}
          onOpenNote={openNoteInPanel}
          onRenameNote={handleRenameFromCard}
          onDeleteNote={requestDeleteNote}
          onToggleFavorite={toggleFavorite}
        />
      )}

      {homeView.kind === "statusList" && (
        <GroupedNoteList
          heading={STATUS_LABELS[homeView.status] ?? homeView.status}
          notes={libraryNotes.filter((n) => n.status === homeView.status)}
          showTypeFilter
          onOpenNote={openNoteInPanel}
          onRenameNote={handleRenameFromCard}
          onDeleteNote={requestDeleteNote}
          onDeleteMultiple={requestDeleteMultiple}
          onToggleFavorite={toggleFavorite}
        />
      )}

      {homeView.kind === "recentList" && (
        <TagNoteList
          tag={null}
          heading="Editados recentemente"
          notes={[...libraryNotes].sort((a, b) => b.lastActivityMs - a.lastActivityMs)}
          metaForNote={(note) => formatRelativeTime(note.lastActivityMs)}
          onOpenNote={openNoteInPanel}
          onRenameNote={handleRenameFromCard}
          onDeleteNote={requestDeleteNote}
          onDeleteMultiple={requestDeleteMultiple}
          onToggleFavorite={toggleFavorite}
        />
      )}

      {homeView.kind === "favoritesList" && (
        <TagNoteList
          tag={null}
          heading="Favoritos"
          showTypeFilter
          notes={[...libraryNotes].filter((n) => n.isFavorite).sort((a, b) => b.lastActivityMs - a.lastActivityMs)}
          onOpenNote={openNoteInPanel}
          onRenameNote={handleRenameFromCard}
          onDeleteNote={requestDeleteNote}
          onDeleteMultiple={requestDeleteMultiple}
          onToggleFavorite={toggleFavorite}
        />
      )}

      {/* Conteúdo principal: notas + painel(éis) de nota */}
      {homeView.kind === "editor" && (
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

      {/* Backdrop do drawer da sidebar no mobile — clicar fora fecha, igual ao
          "×" dentro dela. Não existe no desktop (isMobile sempre false lá). */}
      {isMobile && mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1499 }}
        />
      )}

      <aside
        style={
          isMobile
            ? {
                position: "fixed",
                top: 0,
                left: mobileSidebarOpen ? 0 : "-280px",
                width: "280px",
                height: "100%",
                zIndex: 1500,
                background: "var(--background)",
                borderRight: "1px solid var(--panel-border)",
                padding: "1rem",
                overflow: "hidden",
                overflowY: "auto",
                transition: "left 0.2s ease",
                boxShadow: mobileSidebarOpen ? "2px 0 12px rgba(0,0,0,0.3)" : "none",
              }
            : {
                width: sidebarCollapsed ? "0px" : "240px",
                flexShrink: 0,
                borderRight: sidebarCollapsed ? "none" : "1px solid var(--panel-border)",
                padding: sidebarCollapsed ? "0" : "1rem",
                overflow: "hidden",
                overflowY: sidebarCollapsed ? "hidden" : "auto",
                transition: "width 0.18s ease, padding 0.18s ease",
              }
        }
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.15rem" }}>
            {(["notes", "tags"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                className="toolbar-link"
                style={{
                  padding: "0.3rem 0.55rem",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "1.1rem",
                  fontWeight: sidebarTab === tab ? "bold" : "normal",
                  color: sidebarTab === tab ? "var(--foreground)" : "var(--text-muted)",
                  background: sidebarTab === tab ? "var(--panel-hover)" : "transparent",
                }}
              >
                {tab === "notes" ? "Notas" : "Tags"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
            <button
              onClick={(e) => openNewNoteMenu(e.currentTarget.getBoundingClientRect())}
              className="toolbar-link"
              title="Nova nota"
              style={{
                padding: "0.3rem",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
              }}
            >
              <PlusIcon />
            </button>
            {isMobile && (
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="toolbar-link"
                title="Fechar"
                style={{
                  padding: "0.3rem 0.5rem",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  fontSize: "1.1rem",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: sidebarTab === "tags" ? "0.5rem" : "1rem" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <span
              style={{
                position: "absolute",
                left: "0.6rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
                fontSize: "0.85rem",
                pointerEvents: "none",
              }}
            >
              <SearchIcon />
            </span>
            <input
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder={sidebarTab === "notes" ? "Buscar notas..." : "Buscar tags..."}
              style={{
                width: "100%",
                padding: "0.4rem 0.5rem 0.4rem 1.8rem",
                background: "var(--panel-bg)",
                border: "1px solid var(--panel-border)",
                borderRadius: "4px",
                color: "var(--foreground)",
                fontSize: "0.85rem",
                boxSizing: "border-box",
              }}
            />
          </div>
          {sidebarTab === "tags" && (
            <button
              onClick={() => setShowSidebarTypeFilter((v) => !v)}
              className="toolbar-link"
              title="Filtrar por tipo"
              style={{
                flexShrink: 0,
                padding: "0.4rem",
                border: "1px solid var(--panel-border)",
                borderRadius: "4px",
                cursor: "pointer",
                color: sidebarTypeFilter !== "all" || showSidebarTypeFilter ? "var(--foreground)" : "var(--text-muted)",
                background: showSidebarTypeFilter ? "var(--panel-hover)" : "transparent",
                display: "flex",
                alignItems: "center",
              }}
            >
              <FilterBookIcon />
            </button>
          )}
        </div>

        {sidebarTab === "tags" && showSidebarTypeFilter && (
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            {CONTENT_TYPE_FILTER_OPTIONS.map((f) => (
              <button
                key={f.value}
                onClick={() => setSidebarTypeFilter(f.value)}
                className="toolbar-link"
                style={{
                  padding: "0.25rem 0.6rem",
                  borderRadius: "999px",
                  border: "1px solid var(--panel-border)",
                  background: sidebarTypeFilter === f.value ? "var(--panel-hover)" : "transparent",
                  color: sidebarTypeFilter === f.value ? "var(--foreground)" : "var(--text-muted)",
                  fontWeight: sidebarTypeFilter === f.value ? "bold" : "normal",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {sidebarTab === "tags" && !showSidebarTypeFilter && sidebarTypeFilter !== "all" && (
          <button
            onClick={() => setShowSidebarTypeFilter(true)}
            className="toolbar-link"
            style={{
              display: "block",
              padding: 0,
              marginBottom: "0.75rem",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: "0.75rem",
              textAlign: "left",
            }}
          >
            Filtrando por: {CONTENT_TYPE_FILTER_OPTIONS.find((f) => f.value === sidebarTypeFilter)?.label}
          </button>
        )}

        {sidebarTab === "notes" &&
          sidebarNotesList.map((note) => (
            <div key={note.filename} style={{ marginBottom: "0.3rem" }}>
              {renderSidebarNoteRow(note, note.filename, { indent: "0.5rem", showMeta: true })}
            </div>
          ))}

        {sidebarTab === "tags" && (
          <>
            {sidebarTagTree.map((node) => renderTagTreeNode(node, 0))}

            {/* "Sem tag" — não é um nó da árvore (não é uma tag de verdade),
                fica de fora de sidebarTagTree e é renderizado à parte, sempre
                por último, mesmo espírito do grupo "Sem tag" de antes das abas. */}
            <div style={{ marginBottom: "0.25rem" }}>
              <button
                onClick={() => toggleTagGroup(UNTAGGED_GROUP_KEY)}
                className="toolbar-link"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "0.4rem 0.3rem",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--foreground)",
                  fontSize: "0.85rem",
                  borderRadius: "4px",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      transition: "transform 0.15s ease",
                      transform:
                        sidebarSearch.trim() !== "" || expandedTags.has(UNTAGGED_GROUP_KEY) ? "rotate(90deg)" : "rotate(0deg)",
                      fontSize: "0.75rem",
                    }}
                  >
                    ›
                  </span>
                  Sem tag
                </span>
                <span style={{ color: "var(--text-muted)" }}>{sidebarUntaggedNotes.length}</span>
              </button>

              {(sidebarSearch.trim() !== "" || expandedTags.has(UNTAGGED_GROUP_KEY)) && (
                <ul style={{ listStyle: "none", padding: 0, margin: "0.15rem 0 0.5rem 0" }}>
                  {sidebarUntaggedNotes.map((note) => (
                    <li key={note.filename} style={{ marginBottom: "0.3rem" }}>
                      {renderSidebarNoteRow(note, `${UNTAGGED_GROUP_KEY}::${note.filename}`, { indent: "1.3rem" })}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </aside>

      {/* Área principal: painel(éis) de nota */}
      <div style={{ display: "flex", flex: 1, minWidth: 0, minHeight: 0 }}>
        <NotePanel
          ref={panelARef}
          filename={panelA}
          theme={theme}
          isMobile={isMobile}
          fontSize={fontSizeFor(panelA)}
          isFontSizeOverridden={!!panelA && panelA in noteFontSizes}
          noteFont={noteFontFor(panelA)}
          isNoteFontOverridden={!!panelA && panelA in noteFontOverrides}
          noteTargets={noteTargets}
          allTags={allTags}
          closable={splitMode}
          onClose={closePanelA}
          onFocus={() => setFocusedPanel("a")}
          onFilenameChange={(next) => setPanelA(next)}
          onLibraryChanged={handleLibraryChanged}
          onTagsChanged={handleTagsChanged}
          onStatusChanged={handleStatusChanged}
          onFavoriteChanged={handleFavoriteChanged}
          onFontSizeChange={handleFontSizeChange}
          onToggleFontSizeOverride={handleToggleFontSizeOverride}
          onNoteFontChange={handleNoteFontChange}
          onToggleNoteFontOverride={handleToggleNoteFontOverride}
          onCreateNoteFromLink={handleCreateNoteFromLink}
        />
        {splitMode && (
          <>
            <div style={{ width: "1px", flexShrink: 0, background: "var(--panel-border)" }} />
            <NotePanel
              ref={panelBRef}
              filename={panelB}
              theme={theme}
              isMobile={false}
              fontSize={fontSizeFor(panelB)}
              isFontSizeOverridden={!!panelB && panelB in noteFontSizes}
              noteFont={noteFontFor(panelB)}
              isNoteFontOverridden={!!panelB && panelB in noteFontOverrides}
              noteTargets={noteTargets}
              allTags={allTags}
              closable
              onClose={closePanelB}
              onFocus={() => setFocusedPanel("b")}
              onFilenameChange={(next) => setPanelB(next)}
              onLibraryChanged={handleLibraryChanged}
              onTagsChanged={handleTagsChanged}
              onStatusChanged={handleStatusChanged}
              onFavoriteChanged={handleFavoriteChanged}
              onFontSizeChange={handleFontSizeChange}
              onToggleFontSizeOverride={handleToggleFontSizeOverride}
              onNoteFontChange={handleNoteFontChange}
              onToggleNoteFontOverride={handleToggleNoteFontOverride}
              onCreateNoteFromLink={handleCreateNoteFromLink}
            />
          </>
        )}
      </div>

      </div>
      )}
      </div>

      <aside
        style={{
          width: showGraph && !graphFullscreen ? "420px" : "0px",
          borderLeft: showGraph && !graphFullscreen ? "1px solid var(--panel-border)" : "none",
          padding: showGraph && !graphFullscreen ? "1rem" : "0",
          overflow: "hidden",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          transition: "width 0.22s ease, padding 0.22s ease",
        }}
      >
        {showGraph && !graphFullscreen && graphPanelBody}
      </aside>

      {showGraph && graphFullscreen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 3000,
            background: GRAPH_SPACE_BACKGROUND,
            padding: "1.25rem 1.5rem",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {graphPanelBody}
        </div>
      )}
      </div>

      <input
        ref={importFileInputRef}
        type="file"
        accept=".pdf,.epub"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleFileSelected(file);
        }}
      />

      {newNoteMenuAnchor && (
        <NewNoteMenu
          x={newNoteMenuAnchor.x}
          y={newNoteMenuAnchor.y}
          direction={newNoteMenuAnchor.direction}
          onCreateBlank={handleCreateBlank}
          onImportClick={handleImportClick}
          onImportWebClick={handleImportWebClick}
          onClose={() => setNewNoteMenuAnchor(null)}
        />
      )}

      {importWebOpen && !importing && (
        <ImportWebModal
          url={importWebUrl}
          onUrlChange={setImportWebUrl}
          onSubmit={handleImportWebSubmit}
          onCancel={() => {
            setImportWebOpen(false);
            setImportWebUrl("");
          }}
        />
      )}

      {importing && <ImportProgressModal message={importingMessage} />}

      {noteRowMenu && (
        <NoteRowMenu
          x={noteRowMenu.x}
          y={noteRowMenu.y}
          onRename={() => {
            setRenameDraft(stripMdExtension(noteRowMenu.filename));
            setRenamingKey(noteRowMenu.rowKey);
            setNoteRowMenu(null);
          }}
          onDelete={() => {
            requestDeleteNote(noteRowMenu.filename);
            setNoteRowMenu(null);
          }}
          onClose={() => setNoteRowMenu(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Apagar nota"
          message={`Apagar "${stripMdExtension(confirmDelete.filename)}"? Essa ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          danger
          onConfirm={() => {
            performDeleteNote(confirmDelete.filename);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {confirmBulkDelete && (
        <ConfirmModal
          title="Apagar notas selecionadas"
          message={`Excluir ${confirmBulkDelete.filenames.length} ${confirmBulkDelete.filenames.length === 1 ? "nota" : "notas"}? Essa ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          danger
          onConfirm={() => {
            performDeleteMultiple(confirmBulkDelete.filenames);
            setConfirmBulkDelete(null);
          }}
          onCancel={() => setConfirmBulkDelete(null)}
        />
      )}
    </main>
    </VaultContext.Provider>
  );
}
