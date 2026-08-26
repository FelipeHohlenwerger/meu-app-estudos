"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type TagTreeNode, filterTagTree, formatTagLabel, isPathWithin } from "@/lib/tagTree";

type Props = {
  vaultId: string;
  vaultName: string;
  // Árvore GLOBAL de Assuntos (catálogo Calibre inteiro, sem filtro de vault
  // nem de busca) — ver fullCalibreSubjectTree em page.tsx. Precisa ser o
  // catálogo completo pra permitir selecionar um assunto que a seleção
  // ATUAL desta vault ainda não cobre.
  tree: TagTreeNode[];
  onClose: () => void;
  onSaved: (vaultId: string, subjectPaths: string[]) => void;
};

type NodeState = "checked" | "partial" | "unchecked";

// Achatamento de uma passada — usado só pra localizar o node de um ancestor
// durante o walk-down do toggle OFF (ver toggleNode abaixo).
function flattenTree(nodes: TagTreeNode[]): Map<string, TagTreeNode> {
  const map = new Map<string, TagTreeNode>();
  function visit(node: TagTreeNode) {
    map.set(node.fullPath, node);
    for (const child of node.children) visit(child);
  }
  for (const node of nodes) visit(node);
  return map;
}

// Único passe top-down: computa checked/partial/unchecked pra CADA node de
// uma vez (O(n)) — `selected` guarda o conjunto CANÔNICO (ver comentário da
// tabela calibre_subject_filter em vaultIndex.ts): um path no set cobre ele
// mesmo e todo descendente, presente ou futuro.
function computeStates(tree: TagTreeNode[], selected: Set<string>): Map<string, NodeState> {
  const result = new Map<string, NodeState>();
  function visit(node: TagTreeNode, ancestorChecked: boolean): boolean {
    const isChecked = ancestorChecked || selected.has(node.fullPath);
    let anyDescendantCovered = false;
    for (const child of node.children) {
      if (visit(child, isChecked)) anyDescendantCovered = true;
    }
    result.set(node.fullPath, isChecked ? "checked" : anyDescendantCovered ? "partial" : "unchecked");
    return isChecked || anyDescendantCovered;
  }
  for (const root of tree) visit(root, false);
  return result;
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

// Checkbox tri-state: React não tem uma prop `indeterminate` — precisa da
// propriedade DOM imperativa, setada via ref (único lugar no app com
// checkbox tri-state hoje, os outros são todos binários).
function SubjectCheckbox({ state, onChange }: { state: NodeState; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "partial";
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === "checked"}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      style={{ cursor: "pointer", flexShrink: 0 }}
    />
  );
}

export default function CalibreSubjectFilterModal({ vaultId, vaultName, tree, onClose, onSaved }: Props) {
  // null = ainda carregando a seleção salva (GET em voo).
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/calibre/subject-filter?vault=${encodeURIComponent(vaultId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.subjectPaths)) setSelected(new Set(data.subjectPaths));
        else setSelected(new Set());
      })
      .catch(() => setSelected(new Set()));
  }, [vaultId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const nodesByPath = useMemo(() => flattenTree(tree), [tree]);
  const states = useMemo(() => (selected ? computeStates(tree, selected) : new Map<string, NodeState>()), [tree, selected]);
  const displayTree = useMemo(() => filterTagTree(tree, search), [tree, search]);

  function toggleNode(node: TagTreeNode) {
    setSelected((prev) => {
      if (!prev) return prev;
      const next = new Set(prev);
      const state = states.get(node.fullPath) ?? "unchecked";

      if (state === "unchecked") {
        // Marcar: adiciona e poda qualquer descendente já selecionado
        // individualmente (agora redundante, coberto por este node).
        next.add(node.fullPath);
        for (const p of Array.from(next)) {
          if (p !== node.fullPath && isPathWithin(p, node.fullPath)) next.delete(p);
        }
      } else if (next.has(node.fullPath)) {
        // Desmarcar, selecionado diretamente (não só via ancestor).
        next.delete(node.fullPath);
      } else {
        // Desmarcar, coberto por um ancestor selecionado — acha o ancestor
        // mais próximo subindo pelos segmentos do path.
        const segments = node.fullPath.split(".");
        let ancestorPath: string | null = null;
        for (let i = segments.length - 1; i >= 1; i--) {
          const candidate = segments.slice(0, i).join(".");
          if (next.has(candidate)) {
            ancestorPath = candidate;
            break;
          }
        }
        if (ancestorPath) {
          next.delete(ancestorPath);
          // "Divide" a seleção do ancestor em irmãos, descendo pela árvore
          // real até (mas sem incluir) o node alvo — exclui só a subárvore
          // do alvo, preservando tudo mais que estava coberto.
          let current: TagTreeNode | undefined = nodesByPath.get(ancestorPath);
          const remaining = node.fullPath.slice(ancestorPath.length + 1).split(".");
          for (const segment of remaining) {
            if (!current) break;
            for (const child of current.children) {
              if (child.name !== segment) next.add(child.fullPath);
            }
            current = current.children.find((c) => c.name === segment);
          }
        }
      }
      return next;
    });
  }

  function toggleExpanded(fullPath: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(fullPath)) next.delete(fullPath);
      else next.add(fullPath);
      return next;
    });
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const subjectPaths = Array.from(selected);
      const res = await fetch(`/api/calibre/subject-filter?vault=${encodeURIComponent(vaultId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectPaths }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar o filtro de Assuntos");
        return;
      }
      onSaved(vaultId, subjectPaths);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function renderNode(node: TagTreeNode, depth: number) {
    const isExpanded = search.trim() !== "" || expanded.has(node.fullPath);
    const state = states.get(node.fullPath) ?? "unchecked";
    return (
      <div key={node.fullPath}>
        <div
          onClick={() => toggleExpanded(node.fullPath)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            width: "100%",
            padding: `0.35rem 0.4rem 0.35rem ${0.4 + depth * 1.1}rem`,
            cursor: "pointer",
            fontSize: "0.85rem",
            color: "var(--foreground)",
            borderRadius: "4px",
          }}
          className="toolbar-link"
        >
          {node.children.length > 0 ? (
            <span
              style={{
                display: "inline-flex",
                transition: "transform 0.15s ease",
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                flexShrink: 0,
              }}
            >
              <ChevronIcon />
            </span>
          ) : (
            <span style={{ width: "12px", flexShrink: 0 }} />
          )}
          <SubjectCheckbox state={state} onChange={() => toggleNode(node)} />
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{formatTagLabel(node.name)}</span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", flexShrink: 0 }}>{node.totalCount}</span>
        </div>
        {isExpanded && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel-bg)",
          border: "1px solid var(--panel-border)",
          borderRadius: "8px",
          padding: "1.5rem",
          width: "420px",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}
      >
        <h3 style={{ marginBottom: "0.35rem", fontSize: "1rem", color: "var(--foreground)" }}>Assuntos do Calibre — {vaultName}</h3>
        <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Escolha quais Assuntos aparecem na aba Calibre desta vault. Sem nenhuma seleção, a biblioteca inteira fica visível.
        </p>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar assunto..."
          style={{
            padding: "0.4rem 0.6rem",
            border: "1px solid var(--panel-border)",
            borderRadius: "4px",
            background: "var(--background)",
            color: "var(--foreground)",
            fontSize: "0.85rem",
            marginBottom: "0.5rem",
          }}
        />

        <div style={{ overflowY: "auto", flex: 1, border: "1px solid var(--panel-border)", borderRadius: "4px", padding: "0.3rem" }}>
          {selected === null ? (
            <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>Carregando...</div>
          ) : displayTree.length === 0 ? (
            <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>Nenhum assunto encontrado.</div>
          ) : (
            displayTree.map((node) => renderNode(node, 0))
          )}
        </div>

        {error && <div style={{ color: "#d04444", fontSize: "0.8rem", marginTop: "0.5rem" }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginTop: "1rem" }}>
          <button
            onClick={() => setSelected(new Set())}
            disabled={selected === null}
            className="toolbar-link"
            style={{
              padding: "0.4rem 0.6rem",
              border: "1px solid var(--panel-border)",
              borderRadius: "4px",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: selected === null ? "default" : "pointer",
              fontSize: "0.8rem",
            }}
          >
            Mostrar tudo (limpar seleção)
          </button>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={onClose}
              style={{
                padding: "0.4rem 0.8rem",
                border: "1px solid var(--panel-border)",
                borderRadius: "4px",
                background: "transparent",
                color: "var(--foreground)",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={selected === null || saving}
              style={{
                padding: "0.4rem 0.8rem",
                border: "none",
                borderRadius: "4px",
                background: "#2f7fd6",
                color: "white",
                cursor: selected !== null && !saving ? "pointer" : "not-allowed",
                opacity: selected !== null && !saving ? 1 : 0.6,
              }}
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
