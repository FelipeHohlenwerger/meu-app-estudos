import { NextRequest, NextResponse } from "next/server";
import { getLinkedNotes, linkNoteToBook, unlinkNoteFromBook } from "@/lib/calibreAnnotations";
import { getAllNoteTargets } from "@/lib/vaultIndex";
import { getVaultById } from "@/lib/vaultRegistry";

// GET ?calibreId=42 — notas vinculadas a este livro, com título/nome do
// vault já resolvidos (a UI do modal "Vincular" — ver LinkBookModal.tsx —
// só precisa exibir, nunca resolve nada sozinha).
export async function GET(request: NextRequest) {
  const calibreId = Number(request.nextUrl.searchParams.get("calibreId"));
  if (!Number.isInteger(calibreId)) {
    return NextResponse.json({ error: "Parâmetro 'calibreId' é obrigatório" }, { status: 400 });
  }

  const links = getLinkedNotes(calibreId);
  const targetsByVault = new Map<string, { filename: string; title: string }[]>();
  for (const vaultId of new Set(links.map((l) => l.vaultId))) {
    targetsByVault.set(vaultId, getAllNoteTargets(vaultId));
  }

  const notes = links.map((link) => {
    const targets = targetsByVault.get(link.vaultId) ?? [];
    const title = targets.find((t) => t.filename === link.filename)?.title ?? link.filename;
    const vaultName = getVaultById(link.vaultId)?.name ?? link.vaultId;
    return { vaultId: link.vaultId, filename: link.filename, title, vaultName };
  });

  return NextResponse.json({ notes });
}

// POST { calibreId, vaultId, filename } — cria o vínculo (metadado puro,
// não mexe no texto da nota).
export async function POST(request: NextRequest) {
  const { calibreId, vaultId, filename } = await request.json();
  if (!Number.isInteger(calibreId) || typeof vaultId !== "string" || typeof filename !== "string" || !vaultId || !filename) {
    return NextResponse.json({ error: "Campos 'calibreId', 'vaultId' e 'filename' são obrigatórios" }, { status: 400 });
  }
  linkNoteToBook(calibreId, vaultId, filename);
  return NextResponse.json({ success: true });
}

// DELETE ?calibreId=&vaultId=&filename=
export async function DELETE(request: NextRequest) {
  const calibreId = Number(request.nextUrl.searchParams.get("calibreId"));
  const vaultId = request.nextUrl.searchParams.get("vaultId");
  const filename = request.nextUrl.searchParams.get("filename");
  if (!Number.isInteger(calibreId) || !vaultId || !filename) {
    return NextResponse.json({ error: "Parâmetros 'calibreId', 'vaultId' e 'filename' são obrigatórios" }, { status: 400 });
  }
  unlinkNoteFromBook(calibreId, vaultId, filename);
  return NextResponse.json({ success: true });
}
