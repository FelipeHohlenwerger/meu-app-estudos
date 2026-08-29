import AppShell from "@/components/AppShell";

// Visualizador (PDF/EPUB de vault ou livro do Calibre, pseudo-filename
// "calibre:<id>:<FORMAT>") no painel A — os três continuam sem rota própria
// entre si, mesma unificação deliberada já existente em NotePanel.tsx.
export const dynamic = "force-dynamic";

export default function Page() {
  return <AppShell />;
}
