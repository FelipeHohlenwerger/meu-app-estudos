"use client";

import { createContext, useContext } from "react";
import type { VaultEntry } from "@/lib/vaultRegistry";

export type { VaultEntry };

type VaultContextValue = {
  vaultId: string;
  vaults: VaultEntry[];
  switchVault: (id: string) => void;
  renameVault: (id: string, name: string) => Promise<void>;
  // Wrapper de fetch que sempre injeta o vault ativo na URL (query string
  // "vault=<id>", em toda rota, GET/POST/PUT/DELETE) — usado no lugar de
  // fetch() cru por qualquer componente que precise falar com uma rota
  // vault-aware, pra nunca esquecer o parâmetro num dos ~35 call sites do app.
  vaultFetch: (url: string, init?: RequestInit) => Promise<Response>;
};

export const VaultContext = createContext<VaultContextValue | null>(null);

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault precisa ser usado dentro de <VaultContext.Provider>");
  return ctx;
}

// Acrescenta "vault=<id>" na query string de uma URL (funciona igual pra
// GET/POST/PUT/DELETE, já que o vault ativo sempre vai na URL, nunca no corpo).
export function appendVaultParam(url: string, vaultId: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}vault=${encodeURIComponent(vaultId)}`;
}
