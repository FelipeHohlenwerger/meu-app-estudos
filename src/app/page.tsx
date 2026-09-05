// Rota "/" — biblioteca (home). O conteúdo de verdade (AppShell) mora no
// layout raiz (src/app/layout.tsx), não aqui — ver o comentário grande lá
// sobre por que isso é o que evita o remount/flicker a cada navegação. Este
// arquivo só precisa existir pra "/" ser uma rota reconhecida pelo App Router.
export default function Page() {
  return null;
}
