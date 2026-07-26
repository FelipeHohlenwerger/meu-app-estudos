"use client";

let cached: boolean | null = null;

// Detecta se o app está rodando dentro da janela desktop (Tauri) ou num
// navegador comum — "__TAURI_INTERNALS__" é o global de que toda a ponte IPC
// do Tauri v2 depende, presente só dentro do webview do app empacotado.
// Usado pra mostrar/esconder funcionalidades exclusivas do modo desktop (ex:
// seletor de pasta nativo na criação de vault — ver CreateVaultModal.tsx).
export function isTauri(): boolean {
  if (cached !== null) return cached;
  if (typeof window === "undefined") {
    cached = false;
    return cached;
  }
  cached = "__TAURI_INTERNALS__" in window;
  return cached;
}
