// Sintaxe de imagem: markdown padrão "![alt](caminho)" com dois sufixos
// próprios pra tamanho/recorte, mesma idéia dos outros sufixos "§tipo" do
// app. Um "![alt](caminho)" puro (sem sufixo, ex: colado de outro lugar)
// também é reconhecido — vira 100%/retangular por padrão.
// O caminho aceita espaço (só exclui ")", o fechamento da sintaxe) — nomes de
// captura de tela do Linux ("Captura de tela de 2026-07-07 20-08-05.png") têm
// espaço de verdade, e antes disso a imagem nunca virava widget nesse caso.
export const IMAGE_REGEX =
  /!\[([^\]]*)\]\(([^)]+)\)(?:§size:(\d+))?(?:§shape:(rect|square|circle|oval))?(?:§align:(left|center|right))?/g;

export type ImageShape = "rect" | "square" | "circle" | "oval";
export type ImageAlign = "left" | "center" | "right";

export const DEFAULT_IMAGE_SIZE = 100;
export const DEFAULT_IMAGE_SHAPE: ImageShape = "rect";
export const DEFAULT_IMAGE_ALIGN: ImageAlign = "center";

export function buildImageSyntax(alt: string, path: string, size: number, shape: ImageShape, align: ImageAlign): string {
  return `![${alt}](${path})§size:${size}§shape:${shape}§align:${align}`;
}
