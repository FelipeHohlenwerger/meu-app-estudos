import { NextRequest, NextResponse } from "next/server";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { ensureIndexFresh, getNoteMeta } from "@/lib/vaultIndex";
import { findAllWikiSpans } from "@/lib/wikiLinkSyntax";
import { getVaultById } from "@/lib/vaultRegistry";

type Mention = { filename: string; from: number; to: number; matchedText: string };

// Nota: sem RegExp.escape nativo aqui de propósito — essa API é muito recente e
// não está garantida pela versão mínima de Node do projeto (>=22.5.0, escolhida
// pro node:sqlite). Esse escape manual é o idioma clássico e suficiente pro texto
// normal de título/alias que esperamos aqui.
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Ocorrências de `term` como texto solto (fora de [[...]]), respeitando limites de
// palavra "de verdade" (Unicode: letras acentuadas contam), não o \b do JS (que
// falha silenciosamente em termos começando com letra acentuada, ex: "índice").
function findMentionsOf(
  term: string,
  content: string,
  linkSpans: { from: number; to: number }[]
): { from: number; to: number }[] {
  const trimmed = term.trim();
  if (!trimmed) return [];
  if (!content.toLowerCase().includes(trimmed.toLowerCase())) return [];

  const regex = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(trimmed)}(?![\\p{L}\\p{N}_])`, "giu");

  const results: { from: number; to: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    const insideLink = linkSpans.some((span) => from < span.to && to > span.from);
    if (!insideLink) {
      results.push({ from, to });
    }
  }
  return results;
}

// GET ?filename=X — notas onde o título ou algum alias de X aparece como texto
// solto (fora de [[ ]]) em OUTRA nota. Calculado na hora (não faz parte do índice:
// depende do conteúdo bruto de todas as outras notas, não é metadado de uma nota só).
export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get("filename");
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!filename) {
    return NextResponse.json({ error: "Parâmetro 'filename' é obrigatório" }, { status: 400 });
  }
  if (!vaultId) {
    return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  }
  const vault = getVaultById(vaultId);
  if (!vault) {
    return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });
  }

  try {
    ensureIndexFresh(vaultId);
    const safeName = path.basename(filename);
    const meta = getNoteMeta(vaultId, safeName);
    if (!meta) {
      return NextResponse.json({ mentions: [] });
    }

    const searchTerms = [meta.title, ...meta.aliases].filter((t) => t.trim().length > 0);
    const otherFiles = readdirSync(vault.path).filter((f) => f.endsWith(".md") && f !== safeName);

    const mentions: Mention[] = [];
    for (const otherFilename of otherFiles) {
      const content = readFileSync(path.join(vault.path, otherFilename), "utf-8");
      const linkSpans = findAllWikiSpans(content);

      for (const term of searchTerms) {
        for (const range of findMentionsOf(term, content, linkSpans)) {
          mentions.push({
            filename: otherFilename,
            from: range.from,
            to: range.to,
            matchedText: content.slice(range.from, range.to),
          });
        }
      }
    }

    return NextResponse.json({ mentions });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível buscar menções", details: String(error) },
      { status: 500 }
    );
  }
}
