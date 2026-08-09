// Sintaxe de imagem: markdown padrão "![alt](caminho)" com sufixos próprios
// pra tamanho/recorte/alinhamento/texto-ao-redor, mesma idéia dos outros
// sufixos "§tipo" do app. Um "![alt](caminho)" puro (sem sufixo, ex: colado
// de outro lugar) também é reconhecido — vira 100%/retangular/sem-wrap por
// padrão.
// O caminho aceita espaço (só exclui ")", o fechamento da sintaxe) — nomes de
// captura de tela do Linux ("Captura de tela de 2026-07-07 20-08-05.png") têm
// espaço de verdade, e antes disso a imagem nunca virava widget nesse caso.
export const IMAGE_REGEX =
  /!\[([^\]]*)\]\(([^)]+)\)(?:§size:(\d+))?(?:§shape:(rect|square|circle|oval))?(?:§align:(left|center|right))?(?:§wrap:(none|left|right))?/g;

export type ImageShape = "rect" | "square" | "circle" | "oval";
export type ImageAlign = "left" | "center" | "right";
// Nomeado do jeito que a pessoa vê nos botões do painel: "right" = texto flui
// à DIREITA da imagem (imagem fica à esquerda), "left" = texto flui à
// esquerda (imagem à direita) — isso é o INVERSO do float CSS usado pra
// renderizar (ver ImageWidget em livePreview.ts), de propósito nomeado pela
// perspectiva de quem está lendo o texto, não pela perspectiva da imagem.
export type ImageWrap = "none" | "left" | "right";

export const DEFAULT_IMAGE_SIZE = 100;
export const DEFAULT_IMAGE_SHAPE: ImageShape = "rect";
export const DEFAULT_IMAGE_ALIGN: ImageAlign = "center";
export const DEFAULT_IMAGE_WRAP: ImageWrap = "none";

export function buildImageSyntax(
  alt: string,
  path: string,
  size: number,
  shape: ImageShape,
  align: ImageAlign,
  wrap: ImageWrap
): string {
  return `![${alt}](${path})§size:${size}§shape:${shape}§align:${align}§wrap:${wrap}`;
}
