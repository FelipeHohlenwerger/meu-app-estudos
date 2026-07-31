"use client";

import { useSyncExternalStore } from "react";

const DEFAULT_BREAKPOINT_PX = 768;

function subscribe(breakpointPx: number, callback: () => void): () => void {
  const query = window.matchMedia(`(max-width: ${breakpointPx}px)`);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

// useSyncExternalStore em vez de useState+useEffect: matchMedia é um sistema
// externo de verdade (a viewport do navegador), então é exatamente o caso que
// esse hook existe pra cobrir — evita o anti-padrão de setState síncrono
// dentro de um efeito. getServerSnapshot devolve sempre `false` (o servidor
// não tem viewport) — mesmo cuidado de hidratação que `theme` já tem em
// page.tsx, sincroniza com o valor real assim que monta no cliente.
export function useIsMobile(breakpointPx: number = DEFAULT_BREAKPOINT_PX): boolean {
  return useSyncExternalStore(
    (callback) => subscribe(breakpointPx, callback),
    () => window.matchMedia(`(max-width: ${breakpointPx}px)`).matches,
    () => false
  );
}
