import { NextRequest, NextResponse } from "next/server";
import { clearCalibreLibraryPath, getCalibreLibraryPath, setCalibreLibraryPath } from "@/lib/calibreConfig";

// GET: caminho atual configurado (null se nunca configurado).
export async function GET() {
  return NextResponse.json({ libraryPath: getCalibreLibraryPath() });
}

// PUT { libraryPath: string | null }: configura (valida que a pasta contém
// metadata.db) ou limpa (null) o caminho da biblioteca Calibre.
export async function PUT(request: NextRequest) {
  try {
    const { libraryPath } = await request.json();

    if (libraryPath === null) {
      clearCalibreLibraryPath();
      return NextResponse.json({ libraryPath: null });
    }

    if (typeof libraryPath !== "string" || !libraryPath.trim()) {
      return NextResponse.json({ error: "Campo 'libraryPath' inválido" }, { status: 400 });
    }

    setCalibreLibraryPath(libraryPath);
    return NextResponse.json({ libraryPath: getCalibreLibraryPath() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
