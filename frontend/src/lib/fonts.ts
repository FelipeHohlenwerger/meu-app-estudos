// Fonte única de verdade pras opções de fonte do corpo das notas — mesmo
// espírito de src/lib/colors.ts, mas pra fontes em vez de cores. As CSS
// variables referenciadas aqui são declaradas em src/app/layout.tsx via
// next/font/google.

export type NoteFontId = "lora" | "literata" | "source-serif" | "inter" | "atkinson";

export const NOTE_FONTS: { id: NoteFontId; label: string; cssVar: string }[] = [
  { id: "lora", label: "Lora", cssVar: "var(--font-lora)" },
  { id: "literata", label: "Literata", cssVar: "var(--font-literata)" },
  { id: "source-serif", label: "Source Serif 4", cssVar: "var(--font-source-serif)" },
  { id: "inter", label: "Inter", cssVar: "var(--font-inter-body)" },
  { id: "atkinson", label: "Atkinson Hyperlegible", cssVar: "var(--font-atkinson)" },
];

export const DEFAULT_NOTE_FONT: NoteFontId = "lora";

export function cssVarForFont(id: NoteFontId): string {
  return NOTE_FONTS.find((f) => f.id === id)?.cssVar ?? NOTE_FONTS[0].cssVar;
}
