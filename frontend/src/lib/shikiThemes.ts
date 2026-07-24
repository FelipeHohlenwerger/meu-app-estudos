// Temas do Shiki (destaque de sintaxe dos blocos de código) feitos à mão pra
// combinar com a paleta dos dois temas do app (sépia noturno / papel creme,
// ver src/app/globals.css) — em vez de usar um tema pronto do Shiki, que
// dificilmente bateria exatamente com essas cores. Formato padrão de tema do
// VS Code (é o que o Shiki espera).
import type { ThemeRegistrationRaw } from "shiki";

export const shikiDarkTheme: ThemeRegistrationRaw = {
  name: "sepia-noturno",
  type: "dark",
  colors: {
    "editor.background": "#26221d",
    "editor.foreground": "#e8ddc9",
  },
  settings: [
    { settings: { foreground: "#e8ddc9", background: "#26221d" } },
    { scope: ["comment"], settings: { foreground: "#8a7f6c", fontStyle: "italic" } },
    { scope: ["string", "string.quoted"], settings: { foreground: "#b5c98f" } },
    { scope: ["constant.numeric", "constant.language", "constant.character"], settings: { foreground: "#d4af6a" } },
    { scope: ["keyword", "keyword.control", "storage", "storage.type", "storage.modifier"], settings: { foreground: "#d08a6a" } },
    { scope: ["entity.name.function", "support.function", "meta.function-call"], settings: { foreground: "#7fb4d4" } },
    { scope: ["entity.name.type", "entity.name.class", "entity.name.tag", "support.class", "support.type"], settings: { foreground: "#c99bd0" } },
    { scope: ["variable", "variable.parameter", "variable.other"], settings: { foreground: "#e8ddc9" } },
    { scope: ["punctuation", "meta.brace", "keyword.operator"], settings: { foreground: "#8a7f6c" } },
  ],
};

export const shikiLightTheme: ThemeRegistrationRaw = {
  name: "creme-suave",
  type: "light",
  colors: {
    "editor.background": "#fbf8f1",
    "editor.foreground": "#3a3226",
  },
  settings: [
    { settings: { foreground: "#3a3226", background: "#fbf8f1" } },
    { scope: ["comment"], settings: { foreground: "#8a7d63", fontStyle: "italic" } },
    { scope: ["string", "string.quoted"], settings: { foreground: "#4f7a3f" } },
    { scope: ["constant.numeric", "constant.language", "constant.character"], settings: { foreground: "#a8720f" } },
    { scope: ["keyword", "keyword.control", "storage", "storage.type", "storage.modifier"], settings: { foreground: "#b5560f" } },
    { scope: ["entity.name.function", "support.function", "meta.function-call"], settings: { foreground: "#2f7fd6" } },
    { scope: ["entity.name.type", "entity.name.class", "entity.name.tag", "support.class", "support.type"], settings: { foreground: "#8d5fc7" } },
    { scope: ["variable", "variable.parameter", "variable.other"], settings: { foreground: "#3a3226" } },
    { scope: ["punctuation", "meta.brace", "keyword.operator"], settings: { foreground: "#8a7d63" } },
  ],
};
