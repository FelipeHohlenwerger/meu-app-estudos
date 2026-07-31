import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { sanitizeFilename, findAvailableFilename } from "@/lib/slugify";

// Raiz onde vaults NOVOS são criados no modo web (sem seletor de pasta nativo
// — no modo desktop/Tauri, `createVault` recebe um `customPath` já existente
// escolhido pelo usuário e nunca usa essa raiz).
const VAULTS_ROOT = path.join(process.env.HOME || "", "vaults");
const REGISTRY_DIR = path.join(process.env.HOME || "", ".study-app");
const REGISTRY_PATH = path.join(REGISTRY_DIR, "vaults.json");

export type VaultEntry = {
  id: string;
  name: string;
  // Caminho completo, guardado explicitamente (não derivado do nome/id toda
  // vez) — é isso que permite, numa fase futura desktop (Tauri/Electron), um
  // seletor de pasta nativo passar a preencher esse campo com QUALQUER pasta
  // do disco, sem precisar redesenhar o registro nem o resto do app.
  path: string;
  createdAt: string;
};

type Registry = { vaults: VaultEntry[] };

let cached: Registry | null = null;

function persist(registry: Registry): void {
  if (!existsSync(REGISTRY_DIR)) {
    mkdirSync(REGISTRY_DIR, { recursive: true });
  }
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), "utf-8");
  cached = registry;
}

// Primeira leitura: o arquivo de registro ainda não existe — cria vazio.
// Nenhum vault é registrado automaticamente; a tela de "nenhum vault" (ver
// page.tsx) é quem guia a criação do primeiro vault.
function createEmptyRegistry(): Registry {
  const registry: Registry = { vaults: [] };
  persist(registry);
  return registry;
}

function loadRegistry(): Registry {
  if (cached) return cached;
  if (!existsSync(REGISTRY_PATH)) {
    cached = createEmptyRegistry();
    return cached;
  }
  cached = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8")) as Registry;
  return cached;
}

export function listVaults(): VaultEntry[] {
  return loadRegistry().vaults;
}

export function getVaultById(id: string): VaultEntry | null {
  return loadRegistry().vaults.find((v) => v.id === id) ?? null;
}

// Nome vira o id/nome da subpasta diretamente (mesma filosofia de identidade
// já usada pras notas: o nome É a identidade) — sanitizado com a mesma função
// de segurança usada em nomes de arquivo, e deduplicado com o mesmo padrão
// "nome-2"/"nome-3" de findAvailableFilename (aqui sem extensão nenhuma).
//
// `customPath`: só preenchido pelo seletor de pasta nativo do modo desktop
// (Tauri) — aponta pra uma pasta JÁ EXISTENTE escolhida pelo usuário, em vez
// de criar uma nova sob VAULTS_ROOT. Nesse caso `name` é opcional (deriva do
// nome da própria pasta escolhida).
export function createVault(name?: string, customPath?: string): VaultEntry {
  const registry = loadRegistry();

  if (customPath) {
    const resolved = path.resolve(customPath);
    if (!existsSync(resolved)) throw new Error("Pasta selecionada não existe");

    const trimmedName = (name ?? path.basename(resolved)).trim();
    if (!trimmedName) throw new Error("Nome do vault não pode ser vazio");

    const baseSlug = sanitizeFilename(trimmedName) || "vault";
    const id = findAvailableFilename(baseSlug, (candidate) => registry.vaults.some((v) => v.id === candidate), undefined, "");

    const entry: VaultEntry = { id, name: trimmedName, path: resolved, createdAt: new Date().toISOString() };
    registry.vaults.push(entry);
    persist(registry);
    return entry;
  }

  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new Error("Nome do vault não pode ser vazio");

  const baseSlug = sanitizeFilename(trimmed) || "vault";
  const id = findAvailableFilename(baseSlug, (candidate) => registry.vaults.some((v) => v.id === candidate), undefined, "");

  const vaultPath = path.join(VAULTS_ROOT, id);
  mkdirSync(vaultPath, { recursive: true });

  const entry: VaultEntry = { id, name: trimmed, path: vaultPath, createdAt: new Date().toISOString() };
  registry.vaults.push(entry);
  persist(registry);
  return entry;
}

// Só troca o rótulo de exibição — de propósito não mexe em id/path/pasta no
// disco (o id já é referenciado em vários lugares — nome da subpasta do
// índice, localStorage do navegador — então renomear nunca precisa mover nada).
export function renameVault(id: string, newName: string): VaultEntry {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Nome do vault não pode ser vazio");

  const registry = loadRegistry();
  const entry = registry.vaults.find((v) => v.id === id);
  if (!entry) throw new Error("Vault não encontrado");

  entry.name = trimmed;
  persist(registry);
  return entry;
}

// Remove só o registro (nunca a pasta de notas no disco) — idempotente de
// propósito: remover um id que já não está no registro não é erro, é o
// resultado final que a chamada queria de qualquer forma. Quem chama (ver
// DELETE /api/vaults) também apaga o índice SQLite do vault antes disso.
export function removeVault(id: string): void {
  const registry = loadRegistry();
  registry.vaults = registry.vaults.filter((v) => v.id !== id);
  persist(registry);
}
