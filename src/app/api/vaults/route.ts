import { NextRequest, NextResponse } from "next/server";
import { listVaults, createVault, renameVault, removeVault } from "@/lib/vaultRegistry";
import { deleteVaultIndex } from "@/lib/vaultIndex";

// GET: lista todos os vaults conhecidos — única rota "vault-agnóstica" do app
// (o frontend chama antes mesmo de saber qual vault está ativo).
export async function GET() {
  try {
    return NextResponse.json({ vaults: listVaults() });
  } catch (error) {
    return NextResponse.json({ error: "Não foi possível listar os vaults", details: String(error) }, { status: 500 });
  }
}

// POST { name }: cria um vault novo (pasta em ~/vaults/<nome>, índice SQLite
// próprio criado sob demanda na primeira leitura).
// POST { path }: só no modo desktop (Tauri) — registra uma pasta JÁ EXISTENTE
// escolhida pelo seletor nativo de arquivos, sem criar nada; "name" vira
// opcional (deriva do nome da própria pasta).
export async function POST(request: NextRequest) {
  try {
    const { name, path: vaultPath } = await request.json();

    if (vaultPath) {
      if (typeof vaultPath !== "string" || !vaultPath.trim()) {
        return NextResponse.json({ error: "Campo 'path' inválido" }, { status: 400 });
      }
      const vault = createVault(typeof name === "string" ? name : undefined, vaultPath);
      return NextResponse.json({ vault });
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Campo 'name' é obrigatório" }, { status: 400 });
    }
    const vault = createVault(name);
    return NextResponse.json({ vault });
  } catch (error) {
    return NextResponse.json({ error: "Não foi possível criar o vault", details: String(error) }, { status: 500 });
  }
}

// PUT { id, name }: renomeia (só o rótulo de exibição — id/pasta no disco não mudam).
export async function PUT(request: NextRequest) {
  try {
    const { id, name } = await request.json();
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Campo 'id' é obrigatório" }, { status: 400 });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Campo 'name' é obrigatório" }, { status: 400 });
    }
    const vault = renameVault(id, name);
    return NextResponse.json({ vault });
  } catch (error) {
    return NextResponse.json({ error: "Não foi possível renomear o vault", details: String(error) }, { status: 500 });
  }
}

// DELETE { id }: remove só o registro + o índice SQLite do vault (ver
// deleteVaultIndex/removeVault). Nunca apaga a pasta de notas original — se a
// mesma pasta for registrada de novo depois, o índice é reconstruído do zero
// a partir dos arquivos.
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Campo 'id' é obrigatório" }, { status: 400 });
    }
    deleteVaultIndex(id);
    removeVault(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Não foi possível remover o vault", details: String(error) }, { status: 500 });
  }
}
