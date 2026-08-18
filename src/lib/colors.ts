// Paleta de cores central do app — fonte única para tudo que antes vivia
// duplicado em livePreview.ts, NotePanel.tsx e HighlightMenu.tsx (dívida
// técnica documentada desde o início do projeto, ver resumo-tecnico-projeto.md
// e CLAUDE.md). Puramente organizacional: nenhum valor de cor mudou aqui,
// só a localização — quem precisar de uma cor/mapeamento importa daqui.

// Fundo (highlight) de texto destacado — "==texto==§tipo"
export const highlightColors: Record<string, string> = {
  conceito: "#fff3a0", // amarelo
  duvidas: "#ffd0d0", // vermelho
  referencias: "#cfe8ff", // azul
  exemplo: "#ffe4c2", // laranja
  acao: "#dde4ea", // cinza-azulado
  opiniao_autor: "#e6d9f7", // roxo
};

// Sublinhado de texto — "==texto==§tipo:sub" — inclui "preto"/"azul", que só
// existem como sublinhado, sem highlight de fundo correspondente.
export const underlineColors: Record<string, string> = {
  conceito: "#d4af00",
  duvidas: "#d04444",
  referencias: "#2f7fd6",
  exemplo: "#d6822f",
  acao: "#5b6b78",
  opiniao_autor: "#8d5fc7",
  preto: "#000000",
  azul: "#1e5fd6",
};

// Callouts ("> [!tipo]") — taxonomia de 6 tipos escolhíveis manualmente pelo
// usuário + "ia", gerado só pelas ações de IA (resumir/explicar/perguntas, ver
// aiActions.ts) — nunca escolhido manualmente.
export const calloutColors: Record<string, string> = {
  sintese: "#2e9e4e", // verde
  importante: "#d4af00", // amarelo
  duvidas: "#d04444", // vermelho
  referencias: "#2f7fd6", // azul
  exemplos: "#d6822f", // laranja
  citacoes: "#8d5fc7", // roxo
  ia: "#c94f9e", // magenta
};

// Subconjunto de calloutColors escolhível manualmente (menu flutuante de
// destaque, slash command "/callout") — "ia" fica de fora de propósito, então
// deriva de calloutColors em vez de repetir os 6 valores por conta própria
// (garante que os dois nunca podem divergir).
export const calloutColorsPalette: Record<string, string> = Object.fromEntries(
  Object.entries(calloutColors).filter(([tipo]) => tipo !== "ia")
);

// Fundo "espaço" do Graph View (painel lateral e overlay de tela cheia).
export const GRAPH_SPACE_BACKGROUND = "#17181a";

// Cor do anel de nó "tag" (agrupamento hierárquico) no Modo Mapa da página de
// foco (TagFocusPage.tsx + GraphView.tsx) — diferencia visualmente de nó
// "nota" (que mantém o visual padrão já existente do Graph View global,
// NODE_COLOR/GLOW_COLOR em GraphView.tsx). A raiz da hierarquia (tema atual)
// usa var(--tag-link-color) direto no componente (mesmo âmbar de qualquer
// link de tema/tag no app); subtemas não-raiz usam este teal.
export const GRAPH_TAG_NODE_COLOR = "#5fb3a6";

// Nó "livro do Calibre" no Graph View (GraphView.tsx) — mesma forma circular
// e glow pulsante do nó "nota" (NODE_COLOR/GLOW_COLOR, locais em
// GraphView.tsx), só que num dourado quente, como um corpo celeste mais
// luminoso se destacando entre as notas — nunca a mesma cor de nó "nota".
export const GRAPH_CALIBRE_NODE_COLOR = "#d4a843";
export const GRAPH_CALIBRE_GLOW_COLOR = "#f0c95f";

// Cor por nível de heading (# até ######) no corpo da nota — índice 0 = H1.
// Só cor; tamanho de fonte continua definido separadamente em livePreview.ts.
export const HEADING_COLORS: string[] = [
  "#c99a5b", // H1 — âmbar
  "#7fb0a8", // H2 — verde-azulado suave
  "#8aa4c9", // H3 — azul acinzentado
  "#b58fc2", // H4 — lilás suave
  "#c98a8a", // H5 — terracota suave
  "#9a9483", // H6 — cinza-oliva neutro
];
