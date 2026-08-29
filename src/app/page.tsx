import AppShell from "@/components/AppShell";

// Rota "/" — biblioteca (home). Todas as telas do app são a mesma AppShell,
// que decide o que renderizar a partir da própria URL (ver AppShell.tsx) —
// cada arquivo de rota fino só existe pra dar a cada tela um caminho real.
export const dynamic = "force-dynamic";

export default function Page() {
  return <AppShell />;
}
