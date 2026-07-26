"use client";

import { useEffect, useRef, useState } from "react";
import type { VaultEntry } from "@/lib/vaultContext";
import CreateVaultModal from "@/components/CreateVaultModal";
import { isTauri } from "@/lib/platform";

type Props = {
  vaults: VaultEntry[];
  activeVaultId: string;
  onSwitch: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
  onCreated: (vault: VaultEntry) => void;
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

export default function VaultSwitcher({ vaults, activeVaultId, onSwitch, onRename, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const activeVault = vaults.find((v) => v.id === activeVaultId);

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
    </div>
  );
}
