"use client";

import { useEffect, useRef, useState } from "react";
import type { VaultEntry } from "@/lib/vaultContext";
import CreateVaultModal from "@/components/CreateVaultModal";
import ConfirmModal from "@/components/ConfirmModal";
import { isTauri } from "@/lib/platform";

type Props = {
  vaults: VaultEntry[];
  activeVaultId: string;
  onSwitch: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
  onCreated: (vault: VaultEntry) => void;
  onDelete: (id: string) => Promise<void>;
};

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
    </svg>
  );
}

export default function VaultSwitcher({ vaults, activeVaultId, onSwitch, onRename, onCreated, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Config da biblioteca Calibre — separada do registro de vaults (não é um
  // vault, é uma pasta externa só lida, ver src/lib/calibreConfig.ts).
  const [calibrePath, setCalibrePath] = useState<string | null>(null);
  const [calibreEditing, setCalibreEditing] = useState(false);
  const [calibreDraft, setCalibreDraft] = useState("");
  const [calibreSaving, setCalibreSaving] = useState(false);
  const [calibreError, setCalibreError] = useState<string | null>(null);

  const activeVault = vaults.find((v) => v.id === activeVaultId);

  useEffect(() => {
    if (!open) return;
    fetch("/api/calibre/config")
      .then((res) => res.json())
      .then((data) => setCalibrePath(data.libraryPath ?? null));
  }, [open]);

  async function saveCalibrePath(libraryPath: string) {
    setCalibreSaving(true);
    setCalibreError(null);
    try {
      const res = await fetch("/api/calibre/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ libraryPath }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCalibreError(data.error ?? "Não foi possível encontrar uma biblioteca Calibre nesse caminho");
        return;
      }
      setCalibrePath(data.libraryPath);
      setCalibreEditing(false);
      setCalibreDraft("");
    } finally {
      setCalibreSaving(false);
    }
  }

  function clearCalibrePath() {
    fetch("/api/calibre/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ libraryPath: null }),
    }).then(() => setCalibrePath(null));
  }

  // Mesmo comando Rust `pick_folder` já usado pra registrar vault existente
  // (genérico, não específico de vault) — ver comentário em handlePickFolder.
  async function handlePickCalibreFolder() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const selected = await invoke<string | null>("pick_folder");
      if (typeof selected !== "string") return;
      await saveCalibrePath(selected);
    } catch (err) {
      setCalibreError("Não foi possível abrir o seletor de pasta: " + String(err));
    }
  }

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setRenamingId(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setRenamingId(null);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  function startRename(vault: VaultEntry) {
    setRenamingId(vault.id);
    setRenameDraft(vault.name);
  }

  async function commitRename() {
    if (!renamingId) return;
    const trimmed = renameDraft.trim();
    const id = renamingId;
    setRenamingId(null);
    const current = vaults.find((v) => v.id === id);
    if (!trimmed || (current && trimmed === current.name)) return;
    await onRename(id, trimmed);
  }

  async function handleConfirmDelete() {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    if (renamingId === id) setRenamingId(null);
    await onDelete(id);
    setOpen(false);
  }

  async function handleCreateSubmit(name: string) {
    setCreating(true);
    try {
      const res = await fetch("/api/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!data.vault) {
        window.alert(data.error ?? "Não foi possível criar o vault");
        return;
      }
      onCreated(data.vault);
      setShowCreateModal(false);
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  // Só chamado a partir de um clique já condicionado a isTauri() — o import
  // dinâmico nunca é carregado num navegador comum.
  //
  // Usa o comando Rust próprio `pick_folder` (src-tauri/src/lib.rs), em vez
  // do `open()` de @tauri-apps/plugin-dialog: o comando `open` do plugin só
  // vincula o diálogo à janela principal (`set_parent`) quando compilado pra
  // Windows/macOS — no Linux o diálogo nasce sem essa relação, então o
  // gerenciador de janelas (testado no Cinnamon/Muffin) não sabe que ele
  // pertence à janela do app e não o traz pra frente sozinho. O comando
  // próprio faz o `set_parent` também no Linux.
  async function handlePickFolder() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const selected = await invoke<string | null>("pick_folder");
      if (typeof selected !== "string") return; // cancelado
      await finishPickFolder(selected);
    } catch (err) {
      window.alert("Não foi possível abrir o seletor de pasta: " + String(err));
    }
  }

  async function finishPickFolder(selected: string) {
    setCreating(true);
    try {
      const res = await fetch("/api/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selected }),
      });
      const data = await res.json();
      if (!data.vault) {
        window.alert(data.error ?? "Não foi possível adicionar o vault");
        return;
      }
      onCreated(data.vault);
      setShowCreateModal(false);
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="toolbar-link"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
          padding: "0.3rem 0.6rem",
          background: open ? "var(--panel-hover)" : "transparent",
          border: "1px solid var(--panel-border)",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "0.85rem",
          color: "var(--foreground)",
          marginRight: "0.5rem",
        }}
      >
        {activeVault?.name ?? "Vault"}
        <ChevronIcon />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "calc(100% + 6px)",
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: "6px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            padding: "0.4rem",
            zIndex: 1000,
            minWidth: "220px",
            display: "flex",
            flexDirection: "column",
            gap: "0.15rem",
          }}
        >
          {vaults.map((vault) => (
            <div key={vault.id} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              {renamingId === vault.id ? (
                <input
                  ref={renameInputRef}
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  style={{
                    flex: 1,
                    padding: "0.4rem 0.5rem",
                    border: "1px solid var(--accent)",
                    borderRadius: "4px",
                    background: "var(--background)",
                    color: "var(--foreground)",
                    fontSize: "13px",
                  }}
                />
              ) : (
                <button
                  onClick={() => {
                    onSwitch(vault.id);
                    setOpen(false);
                  }}
                  className="toolbar-link"
                  style={{
                    flex: 1,
                    textAlign: "left",
                    padding: "0.4rem 0.5rem",
                    background: vault.id === activeVaultId ? "var(--panel-hover)" : "transparent",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "13px",
                    color: "var(--foreground)",
                    fontWeight: vault.id === activeVaultId ? "bold" : "normal",
                  }}
                >
                  {vault.name}
                </button>
              )}
              {renamingId !== vault.id && (
                <button
                  onClick={() => startRename(vault)}
                  title="Renomear vault"
                  className="toolbar-link"
                  style={{
                    padding: "0.35rem",
                    background: "transparent",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <PencilIcon />
                </button>
              )}
              {renamingId !== vault.id && (
                <button
                  onClick={() => setConfirmDeleteId(vault.id)}
                  title="Remover vault da lista"
                  className="toolbar-link"
                  style={{
                    padding: "0.35rem",
                    background: "transparent",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          ))}

          <div style={{ borderTop: "1px solid var(--panel-border)", margin: "0.3rem 0" }} />

          <button
            onClick={() => setShowCreateModal(true)}
            className="toolbar-link"
            style={{
              padding: "0.5rem",
              background: "transparent",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              textAlign: "left",
              fontSize: "13px",
              color: "var(--foreground)",
            }}
          >
            + Novo vault
          </button>

          <div style={{ borderTop: "1px solid var(--panel-border)", margin: "0.3rem 0" }} />

          <div style={{ padding: "0.3rem 0.5rem 0.4rem" }}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "0.35rem", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.02em" }}>
              Biblioteca Calibre
            </div>

            {calibreEditing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <input
                  autoFocus
                  value={calibreDraft}
                  onChange={(e) => setCalibreDraft(e.target.value)}
                  placeholder="/caminho/da/biblioteca"
                  style={{
                    padding: "0.4rem 0.5rem",
                    border: "1px solid var(--panel-border)",
                    borderRadius: "4px",
                    background: "var(--background)",
                    color: "var(--foreground)",
                    fontSize: "13px",
                  }}
                />
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  <button
                    onClick={() => saveCalibrePath(calibreDraft)}
                    disabled={calibreSaving || !calibreDraft.trim()}
                    className="toolbar-link"
                    style={{
                      padding: "0.3rem 0.6rem",
                      background: "transparent",
                      border: "1px solid var(--panel-border)",
                      borderRadius: "4px",
                      cursor: calibreSaving ? "default" : "pointer",
                      fontSize: "12px",
                      color: "var(--foreground)",
                    }}
                  >
                    {calibreSaving ? "Salvando..." : "Salvar"}
                  </button>
                  <button
                    onClick={() => {
                      setCalibreEditing(false);
                      setCalibreError(null);
                    }}
                    className="toolbar-link"
                    style={{
                      padding: "0.3rem 0.6rem",
                      background: "transparent",
                      border: "1px solid var(--panel-border)",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "12px",
                      color: "var(--text-muted)",
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {calibrePath ?? "Não configurado"}
                </div>
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  {isTauri() ? (
                    <button
                      onClick={handlePickCalibreFolder}
                      className="toolbar-link"
                      style={{ padding: "0.3rem 0.6rem", background: "transparent", border: "1px solid var(--panel-border)", borderRadius: "4px", cursor: "pointer", fontSize: "12px", color: "var(--foreground)" }}
                    >
                      Escolher pasta...
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setCalibreEditing(true);
                        setCalibreDraft(calibrePath ?? "");
                        setCalibreError(null);
                      }}
                      className="toolbar-link"
                      style={{ padding: "0.3rem 0.6rem", background: "transparent", border: "1px solid var(--panel-border)", borderRadius: "4px", cursor: "pointer", fontSize: "12px", color: "var(--foreground)" }}
                    >
                      {calibrePath ? "Trocar" : "Configurar"}
                    </button>
                  )}
                  {calibrePath && (
                    <button
                      onClick={clearCalibrePath}
                      className="toolbar-link"
                      style={{ padding: "0.3rem 0.6rem", background: "transparent", border: "1px solid var(--panel-border)", borderRadius: "4px", cursor: "pointer", fontSize: "12px", color: "#d04444" }}
                    >
                      Remover
                    </button>
                  )}
                </div>
              </div>
            )}

            {calibreError && <div style={{ color: "#d04444", fontSize: "11px", marginTop: "0.35rem" }}>{calibreError}</div>}
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateVaultModal
          submitting={creating}
          onSubmit={handleCreateSubmit}
          onCancel={() => setShowCreateModal(false)}
          onPickFolder={handlePickFolder}
          allowFolderPicker={isTauri()}
        />
      )}

      {confirmDeleteId && (
        <ConfirmModal
          title="Remover vault"
          message={`Remover "${vaults.find((v) => v.id === confirmDeleteId)?.name ?? confirmDeleteId}" da lista? A pasta de notas original não é apagada — você pode registrá-la de novo depois, se quiser.`}
          confirmLabel="Remover"
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
