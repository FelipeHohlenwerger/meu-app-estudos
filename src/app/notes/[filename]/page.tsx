import AppShell from "@/components/AppShell";

// Editor de nota Markdown no painel A — ver decisão de nomear separado de
// /reader/ no plano ("Navegação por URLs reais"): mesma identidade de
// filename usada pelo NotePanel, só a rota documenta qual comportamento de
// restauração se aplica (nota não tem posição de leitura salva).
export const dynamic = "force-dynamic";

export default function Page() {
  return <AppShell />;
}
