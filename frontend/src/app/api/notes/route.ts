import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import path from "path";

const VAULT_PATH = path.join(process.env.HOME || "", "projetos", "vault-notas");

// GET: lista todos os arquivos .md da vault
export async function GET() {
  try {
    const files = await readdir(VAULT_PATH);
    const notes = files.filter((f) => f.endsWith(".md"));
    return NextResponse.json({ notes });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível listar as notas", details: String(error) },
      { status: 500 }
    );
  }
}