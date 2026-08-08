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

// `tagCounts`: mesmo formato de getTagCounts()/GET /api/tags — [tag, contagem
// de notas com essa tag exata]. Sem profundidade máxima: aceita quantos "."
// existirem no texto da tag.
export function buildTagTree(tagCounts: [string, number][]): TagTreeNode[] {
  const root = new Map<string, MutableNode>();

  for (const [tag, count] of tagCounts) {
    const segments = tag.split(".").map((s) => s.trim()).filter(Boolean);
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
    // `node` é o último segmento (a tag inteira) — recebe a contagem exata.
    if (node) node.ownCount = count;
  }

  return toSortedNodes(root);
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
