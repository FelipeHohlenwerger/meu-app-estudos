const INVALID_FILENAME_CHARS = /[\/\\:*?"<>|\x00-\x1f]/g;

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
