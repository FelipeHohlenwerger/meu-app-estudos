const INVALID_FILENAME_CHARS = /[\/\\:*?"<>|\x00-\x1f]/g;

// Extensões aceitas pela importação de nota de texto (menu "+" > "Importar
// nota (.md)", arrastar-e-soltar na Homepage/sidebar, rota
// /api/note/import-text) — compartilhado entre client (decidir se um
// arquivo arrastado é "nota de texto" ou "PDF/EPUB") e servidor (validação),
// pra nunca os dois lados divergirem sobre quais extensões valem.
export const TEXT_NOTE_IMPORT_EXTENSIONS = [".md", ".markdown", ".txt"] as const;

// Usado pelas duas zonas de arrastar-e-soltar (Homepage e sidebar) pra
// decidir, por arquivo, se vai pro lote de importação de texto
// (onTextFilesDropped) ou pro caminho de PDF/EPUB de sempre (onFileDropped).
export function isTextNoteFile(file: File): boolean {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return (TEXT_NOTE_IMPORT_EXTENSIONS as readonly string[]).includes(ext);
}

// Mantém o texto (espaços, maiúsculas, acentos) e só remove o que é de fato
// inválido/inseguro em um nome de arquivo — o nome do arquivo É o título da
// nota, então não faz sentido forçar minúsculas ou trocar espaço por hífen.
export function sanitizeFilename(text: string): string {
  return text
    .replace(INVALID_FILENAME_CHARS, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\.+$/, "");
}

// A partir de um nome base, acha o primeiro nome de arquivo "<base><ext>" (ou
// "<base>-2<ext>", "-3<ext>", ...) que ainda não existe na vault, ignorando
// `excludeFilename` (usado no rename: o próprio arquivo antigo não deve contar
// como colisão). `ext` já deve incluir o ponto (ex: ".md", ".pdf").
export function findAvailableFilename(
  baseSlug: string,
  exists: (filename: string) => boolean,
  excludeFilename?: string,
  ext: string = ".md"
): string {
  let filename = `${baseSlug}${ext}`;
  let suffix = 2;
  while (exists(filename) && filename !== excludeFilename) {
    filename = `${baseSlug}-${suffix}${ext}`;
    suffix++;
  }
  return filename;
}
