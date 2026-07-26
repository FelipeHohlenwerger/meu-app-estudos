// Widgets de bloco (multi-linha) do Live Preview pra blocos de código
// cercados por crase (```lang ... ```): destaque de sintaxe via Shiki, ou um
// diagrama Mermaid renderizado quando lang === "mermaid". Separado de
// livePreview.ts (que já é grande) por concentrar as duas únicas decorações
// deste arquivo que dependem de import dinâmico + mutação assíncrona do DOM.
import { WidgetType } from "@codemirror/view";
import type { BundledLanguage } from "shiki";
import { shikiDarkTheme, shikiLightTheme } from "@/lib/shikiThemes";

// Bloco de código com destaque de sintaxe (qualquer linguagem, exceto "mermaid").
export class CodeBlockWidget extends WidgetType {
  private destroyed = false;

  constructor(
    private code: string,
    private lang: string
  ) {
    super();
  }

  eq(other: CodeBlockWidget) {
    return other.code === this.code && other.lang === this.lang;
  }

  toDOM() {
    const container = document.createElement("div");
    container.style.position = "relative";
    container.style.background = "var(--panel-bg)";
    container.style.border = "1px solid var(--panel-border)";
    container.style.borderRadius = "8px";
    container.style.padding = this.lang ? "1.4rem 1rem 0.9rem" : "0.9rem 1rem";
    container.style.margin = "0.4rem 0";
    container.style.fontFamily = "var(--font-geist-mono)";
    container.style.fontSize = "0.85em";
    container.style.lineHeight = "1.5";
    container.style.overflowX = "auto";

    if (this.lang) {
      const label = document.createElement("div");
      label.textContent = this.lang;
      label.style.position = "absolute";
      label.style.top = "0.4rem";
      label.style.right = "0.7rem";
      label.style.fontSize = "0.7em";
      label.style.color = "var(--text-muted)";
      label.style.textTransform = "uppercase";
      label.style.letterSpacing = "0.05em";
      container.appendChild(label);
    }

    // Área do código: começa com o texto cru (sem cor) num <pre> comum —
    // vira o HTML gerado pelo Shiki assim que a chamada assíncrona resolver.
    const codeArea = document.createElement("div");
    const rawPre = document.createElement("pre");
    rawPre.style.margin = "0";
    rawPre.style.whiteSpace = "pre";
    rawPre.textContent = this.code;
    codeArea.appendChild(rawPre);
    container.appendChild(codeArea);

    const lang = (this.lang.trim() || "text") as BundledLanguage;
    import("shiki")
      .then(({ codeToHtml }) =>
        codeToHtml(this.code, {
          lang,
          themes: { dark: shikiDarkTheme, light: shikiLightTheme },
          defaultColor: false,
        })
      )
      .then((html) => {
        if (this.destroyed) return;
        codeArea.innerHTML = html;
      })
      .catch(() => {
        // Linguagem não reconhecida pelo Shiki (ou falha de rede/carregamento
        // da gramática) — mantém o texto cru sem cor, já montado acima.
      });

    return container;
  }

  destroy() {
    this.destroyed = true;
  }

  ignoreEvent() {
    return false;
  }
}

let mermaidDiagramCounter = 0;

// Diagrama Mermaid (```mermaid ... ```) — substitui o bloco inteiro por um SVG
// renderizado, seguindo as cores do tema ativo (lido das CSS variables no
// momento da renderização, não fixo como as cores de conteúdo em colors.ts).
export class MermaidWidget extends WidgetType {
  private destroyed = false;
  private observer: MutationObserver | null = null;
  private readonly domId = `mermaid-diagram-${mermaidDiagramCounter++}`;

  constructor(private code: string) {
    super();
  }

  eq(other: MermaidWidget) {
    return other.code === this.code;
  }

  toDOM() {
    const container = document.createElement("div");
    container.style.background = "var(--panel-bg)";
    container.style.border = "1px solid var(--panel-border)";
    container.style.borderRadius = "8px";
    container.style.padding = "1rem";
    container.style.margin = "0.4rem 0";
    container.style.display = "flex";
    container.style.justifyContent = "center";
    container.style.color = "var(--text-muted)";
    container.style.fontSize = "0.85em";
    container.textContent = "Carregando diagrama…";

    this.render(container);

    // Recoloreia o diagrama já renderizado quando o tema (claro/escuro) muda
    // — nenhuma decoração do editor reage a isso hoje (as cores de conteúdo
    // em colors.ts são fixas de propósito), então o widget cuida disso sozinho.
    this.observer = new MutationObserver(() => this.render(container));
    this.observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return container;
  }

  private async render(container: HTMLElement) {
    try {
      const { default: mermaid } = await import("mermaid");
      if (this.destroyed) return;

      const style = getComputedStyle(document.documentElement);
      const readVar = (name: string) => style.getPropertyValue(name).trim();

      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: {
          background: readVar("--background"),
          primaryColor: readVar("--panel-bg"),
          primaryTextColor: readVar("--foreground"),
          primaryBorderColor: readVar("--panel-border"),
          lineColor: readVar("--panel-border"),
          secondaryColor: readVar("--accent"),
          tertiaryColor: readVar("--background"),
          textColor: readVar("--foreground"),
          fontFamily: "var(--font-geist-sans)",
        },
      });

      const { svg } = await mermaid.render(this.domId, this.code);
      if (this.destroyed) return;
      container.style.display = "block";
      container.innerHTML = svg;
    } catch {
      if (this.destroyed) return;
      container.style.display = "block";
      container.textContent = "Não foi possível renderizar este diagrama Mermaid.";
    }
  }

  destroy() {
    this.destroyed = true;
    this.observer?.disconnect();
  }

  ignoreEvent() {
    return false;
  }
}
