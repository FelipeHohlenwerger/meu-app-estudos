// Detecção de link de vídeo (YouTube/Vimeo) pra virar embed no Live Preview —
// mesmo espírito de src/lib/imageSyntax.ts (arquivo pequeno, só parsing puro).
// Só reconhece a URL quando ela ocupa a linha INTEIRA (sem mais nada) — evita
// disparar em URL solta no meio de uma frase ou dentro de "[texto](url)"/
// "![alt](url)", que já têm sintaxe própria.
export type VideoEmbed = {
  provider: "youtube" | "vimeo";
  embedUrl: string;
};

const YOUTUBE_REGEX =
  /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})(?:[?&]\S*)?$/i;

const VIMEO_REGEX = /^https?:\/\/(?:www\.)?(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)(?:[?&]\S*)?$/i;

export function parseVideoEmbedUrl(lineText: string): VideoEmbed | null {
  const trimmed = lineText.trim();
  if (!trimmed) return null;

  const youtubeMatch = trimmed.match(YOUTUBE_REGEX);
  if (youtubeMatch) {
    // enablejsapi=1: sem isso o player embutido ignora os comandos por
    // postMessage usados pelos timestamps clicáveis (ver seekEmbeddedVideo em
    // livePreview.ts) pra pular pro tempo certo sem recarregar o iframe.
    return { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${youtubeMatch[1]}?enablejsapi=1` };
  }

  const vimeoMatch = trimmed.match(VIMEO_REGEX);
  if (vimeoMatch) {
    return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
  }

  return null;
}
