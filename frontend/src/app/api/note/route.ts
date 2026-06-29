import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const VAULT_PATH = path.join(process.env.HOME || "", "projetos", "vault-notas");

// Função de segurança: garante que o nome do arquivo não "escapa" da vault
// (ex: impede algo como "../../etc/passwd")
function resolveNotePath(filename: string): string {
  const safeName = path.basename(filename); // remove qualquer caminho, só o nome do arquivo
  return path.join(VAULT_PATH, safeName);
}

// GET /api/note?filename=teste.md
export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get("filename");

  if (!filename) {
    return NextResponse.json({ error: "Parâmetro 'filename' é obrigatório" }, { status: 400 });
  }

  try {
    const filePath = resolveNotePath(filename);
    const content = await readFile(filePath, "utf-8");
    return NextResponse.json({ content });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível ler o arquivo", details: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/note  body: { filename: "teste.md", content: "..." }
export async function POST(request: NextRequest) {
  try {
    const { filename, content } = await request.json();

    if (!filename) {
      return NextResponse.json({ error: "Campo 'filename' é obrigatório" }, { status: 400 });
    }

    const filePath = resolveNotePath(filename);
    await writeFile(filePath, content, "utf-8");
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar o arquivo", details: String(error) },
      { status: 500 }
    );
  }
}