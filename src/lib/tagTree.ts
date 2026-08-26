// Árvore de tags estilo Calibre: tags são strings livres já armazenadas
// (tags(note_id, tag) em vaultIndex.ts), sem validação de caracteres — uma
// tag como "História.Antiga.Mesopotâmia" já é válida hoje, só tratada como
// opaca em todo o resto do app. A hierarquia aqui é inteiramente uma
// interpretação de EXIBIÇÃO desse texto (split por "."), sem tocar em nada
// armazenado — nenhuma tag antiga é migrada/reescrita.
export type TagTreeNode = {
  name: string; // segmento deste nível, ex: "Antiga"
  fullPath: string; // caminho completo até aqui, ex: "História.Antiga"
  // Quantas notas têm a tag exata `fullPath` (0 se `fullPath` nunca é usado
  // como tag literal — ex: um nó intermediário só criado pra agrupar filhos).
  ownCount: number;
  // ownCount + soma recursiva dos totalCount dos filhos — é o número exibido
  // na árvore, cobrindo o caso de clicar num nó pai e ver quantas notas
  // existem na subárvore inteira (mesmo espírito do Calibre).
  totalCount: number;
  children: TagTreeNode[];
};

type MutableNode = {
  name: string;
  fullPath: string;
  ownCount: number;
  children: Map<string, MutableNode>;
};

function toSortedNodes(map: Map<string, MutableNode>): TagTreeNode[] {
  return Array.from(map.values())
    .map((node) => {
      const children = toSortedNodes(node.children);
      const totalCount = node.ownCount + children.reduce((sum, c) => sum + c.totalCount, 0);
      return { name: node.name, fullPath: node.fullPath, ownCount: node.ownCount, totalCount, children };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Chave de COMPARAÇÃO/agrupamento de uma tag (ou de um segmento dela) — nunca
// de exibição nem de escrita. Duas tags digitadas com capitalização ou
// espaçamento diferente (ex: "História.Antiga" vs "história.antiga") sempre
// precisam ser tratadas como a MESMA tag em qualquer contagem/agrupamento/
// navegação, mesmo que o dado já salvo (tabela `tags`, nunca reescrita aqui)
// mantenha a grafia original de cada nota. trim() cobre espaço solto nas
// pontas; toLowerCase() cobre diferença de caixa (Unicode-aware, cobre
// acentuação corretamente). Bug real encontrado: sem isso, "história" e
// "História.Antiga" viravam raízes DIFERENTES da árvore/das seções da
// Homepage, cada uma com sua própria contagem parcial.
export function normalizeTagKey(tag: string): string {
  return tag.trim().toLowerCase();
}

// Verdadeiro se `candidatePath` É `ancestorOrSelfPath` OU está em qualquer
// profundidade abaixo dele (comparação normalizada, ver normalizeTagKey
// acima). Idioma de "tag === path || tag.startsWith(path + '.')" já usado
// em getCalibreBooksForTagPath (vaultIndex.ts); extraído aqui por ser
// puramente sobre strings de caminho hierárquico com ponto — reaproveitado
// tanto no filtro de Assuntos do Calibre por vault (page.tsx) quanto no
// cálculo de estado da árvore de checkboxes que o configura
// (CalibreSubjectFilterModal.tsx).
export function isPathWithin(candidatePath: string, ancestorOrSelfPath: string): boolean {
  const c = normalizeTagKey(candidatePath);
  const a = normalizeTagKey(ancestorOrSelfPath);
  return c === a || c.startsWith(a + ".");
}

// `tagCounts`: mesmo formato de getTagCounts()/GET /api/tags — [tag, contagem
// de notas com essa tag exata]. Sem profundidade máxima: aceita quantos "."
// existirem no texto da tag. Nós são agrupados por segmento NORMALIZADO (ver
// normalizeTagKey) — duas entradas de `tagCounts` que só diferem por caixa/
// espaçamento caem no MESMO nó, com as contagens somadas (não sobrescritas).
// `name`/`fullPath` do nó sempre usam a forma normalizada (minúscula) —
// formatTagLabel (exibição) já capitaliza a partir dela de forma consistente,
// então não há motivo pra tentar preservar a grafia original de uma
// digitação específica aqui.
export function buildTagTree(tagCounts: [string, number][]): TagTreeNode[] {
  const root = new Map<string, MutableNode>();

  for (const [tag, count] of tagCounts) {
    const segments = tag.split(".").map((s) => normalizeTagKey(s)).filter(Boolean);
    if (segments.length === 0) continue;

    let level = root;
    let pathSoFar = "";
    let node: MutableNode | undefined;
    for (const segment of segments) {
      pathSoFar = pathSoFar ? `${pathSoFar}.${segment}` : segment;
      node = level.get(segment);
      if (!node) {
        node = { name: segment, fullPath: pathSoFar, ownCount: 0, children: new Map() };
        level.set(segment, node);
      }
      level = node.children;
    }
    // `node` é o último segmento (a tag inteira) — soma a contagem exata (não
    // sobrescreve: mais de uma variante de caixa da mesma tag pode chegar
    // aqui separadamente, ver comentário da função acima).
    if (node) node.ownCount += count;
  }

  return toSortedNodes(root);
}

// Mesma forma de TagTreeNode, mas carregando as NOTAS de verdade em cada nó
// (não só uma contagem) — usado pela página de foco (TagFocusPage.tsx), que
// precisa renderizar cards de nota em qualquer um dos 3 modos de visualização
// (Navegação/Visão Geral/Mapa), todos lendo desta MESMA árvore em vez de cada
// modo reimplementar seu próprio agrupamento (era exatamente esse tipo de
// duplicação que causava um lugar mostrar um subtema corretamente e outro
// não — ver normalizeTagKey acima).
export type TagNoteTreeNode<T> = {
  path: string; // caminho completo normalizado até aqui
  segment: string; // só o último segmento (normalizado)
  ownNotes: T[]; // notas tageadas EXATAMENTE em `path`
  children: TagNoteTreeNode<T>[]; // profundidade ilimitada, ordenado por segmento
};

// Constrói a subárvore com raiz em `rootPath` (já deve vir normalizado — ver
// normalizeTagKey) a partir de uma lista de notas já filtrada pro subtree
// (mesmo contrato de `notes` em TagFocusPage.tsx: cada nota aqui tem pelo
// menos uma tag igual a `rootPath` ou descendente dela — notas sem nenhuma
// tag relevante são simplesmente ignoradas). Cria nós intermediários mesmo
// sem nota própria quando necessário pra manter a estrutura (ex: uma nota só
// tageada "história.antiga.livros" ainda cria o nó "história.antiga" no
// caminho, com `ownNotes` vazio).
export function buildTagNoteTree<T extends { tags: string[] }>(rootPath: string, notes: T[]): TagNoteTreeNode<T> {
  type MutableNoteNode = { segment: string; path: string; ownNotes: T[]; children: Map<string, MutableNoteNode> };

  const root: MutableNoteNode = { segment: rootPath.split(".").pop() ?? rootPath, path: rootPath, ownNotes: [], children: new Map() };
  const prefix = `${rootPath}.`;

  for (const note of notes) {
    for (const rawTag of note.tags) {
      const tag = normalizeTagKey(rawTag);
      if (tag === rootPath) {
        root.ownNotes.push(note);
        continue;
      }
      if (!tag.startsWith(prefix)) continue;

      const restSegments = tag.slice(prefix.length).split(".");
      let currentPath = rootPath;
      let parent = root;
      for (const segment of restSegments) {
        currentPath = `${currentPath}.${segment}`;
        let child = parent.children.get(segment);
        if (!child) {
          child = { segment, path: currentPath, ownNotes: [], children: new Map() };
          parent.children.set(segment, child);
        }
        parent = child;
      }
      parent.ownNotes.push(note);
    }
  }

  function finalize(node: MutableNoteNode): TagNoteTreeNode<T> {
    const children = Array.from(node.children.values())
      .map(finalize)
      .sort((a, b) => a.segment.localeCompare(b.segment));
    return { path: node.path, segment: node.segment, ownNotes: node.ownNotes, children };
  }

  return finalize(root);
}

// Todas as notas da subárvore a partir de `node` (própria + de todo
// descendente), sem duplicar uma nota que apareça em mais de um nível (ex:
// tageada tanto no nível pai quanto num filho — caso real confirmado: uma
// nota pode ter "história.antiga" E "história.antiga.livros" ao mesmo tempo).
// Usado pelo contador "N notas" dos cards de subtema (soma a subárvore
// inteira, não só o nível direto) — `getKey` decide identidade (normalmente
// `note => note.filename`).
export function collectAllNotes<T>(node: TagNoteTreeNode<T>, getKey: (note: T) => string): T[] {
  const seen = new Map<string, T>();
  function visit(n: TagNoteTreeNode<T>) {
    for (const note of n.ownNotes) seen.set(getKey(note), note);
    for (const child of n.children) visit(child);
  }
  visit(node);
  return Array.from(seen.values());
}

// Formata uma tag pra EXIBIÇÃO — nunca usado pro dado salvo/filtro/navegação,
// que continuam usando a string crua (minúscula, com "."). Ponto vira espaço
// e cada segmento (e cada palavra dentro dele, se houver espaço) ganha a
// primeira letra maiúscula: "história.antiga" → "História Antiga".
export function formatTagLabel(tag: string): string {
  return tag
    .split(".")
    .map((segment) =>
      segment
        .split(" ")
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
        .join(" ")
    )
    .join(" ");
}

// Filtra a árvore por busca textual (nome do segmento OU caminho completo) —
// um nó sobrevive se ele mesmo bate OU se qualquer descendente bate (senão
// digitar o nome de uma sub-tag faria o pai sumir e a sub-tag junto).
export function filterTagTree(nodes: TagTreeNode[], query: string): TagTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;

  const result: TagTreeNode[] = [];
  for (const node of nodes) {
    const selfMatches = node.name.toLowerCase().includes(q) || node.fullPath.toLowerCase().includes(q);
    const filteredChildren = filterTagTree(node.children, q);
    if (selfMatches || filteredChildren.length > 0) {
      result.push({ ...node, children: selfMatches ? node.children : filteredChildren });
    }
  }
  return result;
}
