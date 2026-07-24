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

// Cor por status de estudo de uma nota (Biblioteca, cards, listagens). Dois
// vocabulários (livro/artigo web vs. nota comum, ver src/lib/noteStatus.ts)
// sem chaves em comum, então um único mapa combinado serve pros dois.
export const STATUS_COLORS: Record<string, string> = {
  nao_iniciado: "#9a9ba1", // cinza
  lendo: "#2f7fd6", // azul
  lido: "#2fa6a6", // verde-azulado
  revisando: "#d4af00", // amarelo
  revisado: "#2e9e4e", // verde
  abandonei: "#d04444", // vermelho
  rascunho: "#9a9ba1", // cinza
  em_desenvolvimento: "#2f7fd6", // azul
  finalizada: "#2e9e4e", // verde
};

// Fundo "espaço" do Graph View (painel lateral e overlay de tela cheia).
export const GRAPH_SPACE_BACKGROUND = "#17181a";
