import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

// Mesmo padrão de src/lib/vaultRegistry.ts — config separada da de vaults
// porque a biblioteca Calibre não é um vault (não guarda notas, é só lida,
// nunca escrita pelo app).
const REGISTRY_DIR = path.join(process.env.HOME || "", ".study-app");
const CONFIG_PATH = path.join(REGISTRY_DIR, "calibre.json");

type CalibreConfig = { libraryPath: string | null };

let cached: CalibreConfig | null = null;

function persist(config: CalibreConfig): void {
  if (!existsSync(REGISTRY_DIR)) {
    mkdirSync(REGISTRY_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  cached = config;
}

function loadConfig(): CalibreConfig {
  if (cached) return cached;
  if (!existsSync(CONFIG_PATH)) {
    cached = { libraryPath: null };
    return cached;
  }
  cached = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as CalibreConfig;
  return cached;
}

export function getCalibreLibraryPath(): string | null {
  return loadConfig().libraryPath;
}

// Valida que a pasta escolhida realmente é uma biblioteca Calibre (contém
// metadata.db) antes de persistir — mensagem de erro usada tal e qual pela
// UI (ver VaultSwitcher.tsx).
export function setCalibreLibraryPath(libraryPath: string): void {
  const resolved = path.resolve(libraryPath);
  if (!existsSync(path.join(resolved, "metadata.db"))) {
    throw new Error("Não foi possível encontrar uma biblioteca Calibre nesse caminho");
  }
  persist({ libraryPath: resolved });
}

export function clearCalibreLibraryPath(): void {
  persist({ libraryPath: null });
}
