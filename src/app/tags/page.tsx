import AppShell from "@/components/AppShell";

// "/tags" (sem segmento) = lista de notas sem tag — ver homeView.tagList com
// tag=null em AppShell.tsx. Rota irmã de tags/[tag]/page.tsx.
export const dynamic = "force-dynamic";

export default function Page() {
  return <AppShell />;
}
