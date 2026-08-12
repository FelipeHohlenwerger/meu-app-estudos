"use client";

import { useEffect, useRef, useState } from "react";
import { formatTagLabel, normalizeTagKey } from "@/lib/tagTree";

// Sentinel interno pra distinguir a opção "criar tag nova" das sugestões de
// tag já existente na lista navegável por teclado — nunca visto fora deste
// arquivo (não é uma tag de verdade).
const CREATE_OPTION = Symbol("create-tag-option");
type SuggestionOption = string | typeof CREATE_OPTION;

// Autocomplete compartilhado — mesma lista de sugestões (existente + "criar
// nova"), mesma navegação por teclado (setas pra cima/baixo + Enter,
// complementando clique/hover do mouse já implementados) e mesma validação
// (não vazio, sem sugerir/duplicar o que já está em `excludeTags`).
// Escolher uma sugestão EXISTENTE (clique ou Enter) só PREENCHE o campo com
// o texto dela, sem aplicar — permite completar por cima (ex: escolher
// "história" preenche o campo, dá pra digitar ".antiga" em seguida); um novo
// Enter (ou clicar de novo na mesma sugestão, agora idêntica ao campo) é que
// efetivamente aplica (ver selectOption). "Criar tag: X" sempre aplica
// direto (a opção já É o texto digitado, não tem o que preencher).
// Reaproveitado tanto por TagField (adicionar tag nova — campo sempre vazio,
// perder o foco só fecha a lista, não commita nada) quanto por TagChips
// (editar uma tag já aplicada inline, via duplo clique — perder o foco
// COMMITA o texto atual, mesmo padrão de "editar um nome" já usado no
// rename inline de NoteCard.tsx: blur salva, Escape descarta).
function TagAutocompleteInput({
  value,
  onValueChange,
  allKnownTags,
  excludeTags,
  onCommit,
  onCancel,
  commitOnBlur,
  autoFocus,
  placeholder,
  inputStyle,
  onEmptyBackspace,
}: {
  value: string;
  onValueChange: (value: string) => void;
  allKnownTags: string[];
  excludeTags: string[];
  onCommit: (tag: string) => void;
  onCancel: () => void;
  commitOnBlur?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  inputStyle?: React.CSSProperties;
  onEmptyBackspace?: () => void;
}) {
  // Já nasce aberto quando autoFocus (TagChips entrando em modo de edição) —
  // evita um setState num efeito só pra ligar isso no primeiro render.
  const [open, setOpen] = useState(!!autoFocus);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Só a chamada IMPERATIVA de foco precisa ficar num efeito (mexe em algo
  // fora do React) — abrir o dropdown já é tratado no useState inicial acima.
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const query = normalizeTagKey(value);
  const suggestions = query
    ? allKnownTags.filter((t) => normalizeTagKey(t).includes(query) && !excludeTags.includes(t)).slice(0, 6)
    : [];
  const exactMatch = allKnownTags.some((t) => normalizeTagKey(t) === query);
  const showCreateOption = query.length > 0 && !exactMatch && !excludeTags.includes(query);
  // Lista única pra navegação por teclado — sugestões primeiro, "criar" por
  // último, mesma ordem visual da lista renderizada abaixo.
  const options: SuggestionOption[] = showCreateOption ? [...suggestions, CREATE_OPTION] : suggestions;
  const showDropdown = open && options.length > 0;

  function closeAndMaybeCommit() {
    setOpen(false);
    if (!commitOnBlur) return;
    if (value.trim()) onCommit(value);
    else onCancel();
  }

  // Escolhe uma opção da lista (sugestão existente OU "criar tag") — clique
  // OU Enter (com ou sem navegação por seta antes), mesmo tratamento pros
  // dois. Regra: se o texto da opção escolhida já é EXATAMENTE o que está no
  // campo (comparado normalizado), a escolha CONFIRMA (aplica de vez, via
  // onCommit) — isso cobre "criar tag" sempre (a opção É o texto digitado,
  // por definição) e também escolher de novo a mesma sugestão que já
  // preencheu o campo antes, sem editar nada desde então. Se o texto for
  // DIFERENTE do que está no campo (sugestão mais curta que o resto ainda
  // não digitado), a escolha só PREENCHE o campo com esse texto, sem aplicar
  // ainda — permite completar por cima (ex: escolher "história" preenche o
  // campo; dá pra digitar ".antiga" em seguida e confirmar com um Enter novo,
  // criando o subtema sem reescrever "história" do zero).
  function selectOption(optionText: string) {
    const clean = optionText.trim();
    if (!clean) return;
    if (normalizeTagKey(clean) === normalizeTagKey(value)) {
      setOpen(false);
      onCommit(clean);
    } else {
      onValueChange(clean);
      setHighlighted(0);
      setOpen(true);
    }
    // Devolve o foco pro input nos dois casos — clicar numa sugestão desvia
    // o foco pro botão por padrão; sem isso, continuar digitando/confirmando
    // depois de um clique do mouse ficaria interrompido.
    inputRef.current?.focus();
  }

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) closeAndMaybeCommit();
    }
    window.addEventListener("mousedown", handleMouseDown);
    return () => window.removeEventListener("mousedown", handleMouseDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitOnBlur, value]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      if (options.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => (h + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      if (options.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => (h - 1 + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = options[highlighted];
      if (selected === CREATE_OPTION) selectOption(value);
      else if (typeof selected === "string") selectOption(selected);
      else if (value.trim()) selectOption(value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      onCancel();
    } else if (e.key === "Backspace" && value === "" && onEmptyBackspace) {
      onEmptyBackspace();
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          setOpen(true);
          // Destaque sempre volta pro topo quando o texto muda — evita ficar
          // "grudado" num índice que já não corresponde à mesma sugestão de
          // antes (feito aqui, na resposta ao evento, e não num efeito
          // observando `query`, que dispararia um setState redundante).
          setHighlighted(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--foreground)",
          fontSize: "0.8rem",
          width: "70px",
          minWidth: "50px",
          ...inputStyle,
        }}
      />

      {showDropdown && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "0.25rem",
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: "6px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            padding: "0.3rem",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: "0.15rem",
            minWidth: "160px",
          }}
        >
          {suggestions.map((tag, i) => (
            <button
              key={tag}
              onClick={() => selectOption(tag)}
              onMouseEnter={() => setHighlighted(i)}
              className="toolbar-link"
              style={{
                padding: "0.4rem 0.55rem",
                background: highlighted === i ? "var(--panel-hover)" : "transparent",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "13px",
                color: "var(--foreground)",
              }}
            >
              {formatTagLabel(tag)}
            </button>
          ))}
          {showCreateOption && (
            <button
              onClick={() => selectOption(value)}
              onMouseEnter={() => setHighlighted(suggestions.length)}
              className="toolbar-link"
              style={{
                padding: "0.4rem 0.55rem",
                background: highlighted === suggestions.length ? "var(--panel-hover)" : "transparent",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "13px",
                color: "var(--accent, var(--foreground))",
              }}
            >
              Criar tag: “{value.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type Props = {
  tags: string[];
  allKnownTags: string[];
  onChange: (tags: string[]) => void;
};

export default function TagField({ tags, allKnownTags, onChange }: Props) {
  const [draft, setDraft] = useState("");

  function handleCommit(tag: string) {
    if (tags.includes(tag)) {
      setDraft("");
      return;
    }
    onChange([...tags, tag]);
    setDraft("");
  }

  function handleRemoveLast() {
    if (tags.length > 0) onChange(tags.slice(0, -1));
  }

  return (
    <TagAutocompleteInput
      value={draft}
      onValueChange={setDraft}
      allKnownTags={allKnownTags}
      excludeTags={tags}
      onCommit={handleCommit}
      onCancel={() => {}}
      placeholder="+ tag"
      onEmptyBackspace={handleRemoveLast}
    />
  );
}

// Lista de tags já adicionadas — separada do input "+ tag" (que fica ao lado
// do título) pra poder ser renderizada numa linha própria, abaixo e à
// esquerda do título, em vez de inline com ele.
type TagChipsProps = {
  tags: string[];
  // Mesma lista usada pelo TagField "+ tag" — o duplo clique reaproveita o
  // mesmo autocomplete/validação de criar uma tag nova (ver
  // TagAutocompleteInput acima), só que substituindo em vez de adicionando.
  allKnownTags: string[];
  onChange: (tags: string[]) => void;
};

export function TagChips({ tags, allKnownTags, onChange }: TagChipsProps) {
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  if (tags.length === 0) return null;

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function startEditing(tag: string) {
    setEditingTag(tag);
    setEditDraft(tag);
  }

  // Substitui a tag SÓ NESTA nota — troca a string na posição correspondente
  // da lista de tags desta nota (criando a nova, se ainda não existir em
  // lugar nenhum) sem tocar em nenhuma outra nota que use a tag antiga, que
  // continua existindo normalmente nelas (nenhuma linha da tabela `tags` de
  // outra nota é alterada, só as desta — mesmo mecanismo de sempre,
  // PUT /api/note/tags, que só escreve as tags DESTA nota).
  function commitEdit(newTag: string) {
    if (editingTag === null) return;
    if (newTag !== editingTag) {
      const next = Array.from(new Set(tags.map((t) => (t === editingTag ? newTag : t))));
      onChange(next);
    }
    setEditingTag(null);
  }

  function cancelEdit() {
    setEditingTag(null);
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.35rem" }}>
      {tags.map((tag) =>
        editingTag === tag ? (
          <span
            key={tag}
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "var(--panel-bg)",
              border: "1px solid var(--accent)",
              borderRadius: "999px",
              padding: "0.1rem 0.5rem",
            }}
          >
            <TagAutocompleteInput
              value={editDraft}
              onValueChange={setEditDraft}
              allKnownTags={allKnownTags}
              // Inclui a própria tag sendo editada (não só as OUTRAS já
              // aplicadas) — sem isso, o dropdown já abria ao entrar no modo
              // de edição sugerindo a tag como "sugestão" dela mesma (o texto
              // inicial do campo é o texto atual da tag).
              excludeTags={tags}
              onCommit={commitEdit}
              onCancel={cancelEdit}
              commitOnBlur
              autoFocus
              inputStyle={{ width: "auto", minWidth: "60px" }}
            />
          </span>
        ) : (
          <span
            key={tag}
            onDoubleClick={() => startEditing(tag)}
            title='Duplo clique para editar (só nesta nota — a tag original continua existindo nas demais)'
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
              background: "var(--panel-hover)",
              border: "1px solid var(--panel-border)",
              borderRadius: "999px",
              padding: "0.15rem 0.5rem",
              fontSize: "0.8rem",
              color: "var(--foreground)",
              whiteSpace: "nowrap",
              cursor: "text",
            }}
          >
            {formatTagLabel(tag)}
            <button
              onClick={() => removeTag(tag)}
              title={`Remover tag "${tag}"`}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                lineHeight: 1,
                padding: 0,
                fontSize: "0.85rem",
              }}
            >
              ×
            </button>
          </span>
        )
      )}
    </div>
  );
}
