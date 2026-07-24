import { NextRequest, NextResponse } from "next/server";
import { existsSync, statSync, writeFileSync } from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { ensureIndexFresh, reindexNote } from "@/lib/vaultIndex";
import { sanitizeFilename, findAvailableFilename } from "@/lib/slugify";
import { getVaultById } from "@/lib/vaultRegistry";

// Limitação aceita: só fetch direto do HTML, sem navegador headless — sites
// cujo conteúdo depende de JavaScript pra aparecer podem vir vazios/curtos
// demais (ver checagem de MIN_CONTENT_LENGTH abaixo, que existe exatamente
// pra pegar esse caso e avisar em vez de salvar uma nota malformada).
const MIN_CONTENT_LENGTH = 200;
const FETCH_TIMEOUT_MS = 15000;
const MAX_TITLE_LENGTH = 120;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Readability preserva os atributos CRUS do DOM original ao serializar
// article.content de volta pra HTML (não a versão já resolvida que
// element.src/.href exporiam) — um site que usa caminhos relativos
// ("/img/foto.jpg") sairia quebrado sem isso, já que as imagens da nota
// importada continuam apontando pra URL original (nunca são baixadas).
function resolveRelativeUrls(html: string, baseUrl: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  for (const img of Array.from(doc.querySelectorAll("img[src]"))) {
    const src = img.getAttribute("src");
    if (!src) continue;
    try {
      img.setAttribute("src", new URL(src, baseUrl).toString());
    } catch {
      // caminho inválido — deixa como estava
    }
  }
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href");
    if (!href) continue;
    try {
      a.setAttribute("href", new URL(href, baseUrl).toString());
    } catch {
      // caminho inválido — deixa como estava
    }
  }

  return doc.body.innerHTML;
}

// POST ?vault=<id>  body: { url }: busca o HTML da página, extrai o conteúdo
// do artigo com o Mozilla Readability (mesma tecnologia do "modo leitor" do
// Firefox) e converte pra Markdown — vira uma nota .md normal, totalmente editável.
export async function POST(request: NextRequest) {
  const vaultId = request.nextUrl.searchParams.get("vault");
  if (!vaultId) {
    return NextResponse.json({ error: "Parâmetro 'vault' é obrigatório" }, { status: 400 });
  }
  const vault = getVaultById(vaultId);
  if (!vault) {
    return NextResponse.json({ error: "Vault não encontrado" }, { status: 404 });
  }

  try {
    const { url } = await request.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Campo 'url' é obrigatório" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: "URL inválida" }, { status: 400 });
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return NextResponse.json({ error: "Só URLs http/https são aceitas" }, { status: 400 });
    }

    let html: string;
    try {
      const res = await fetch(parsedUrl.toString(), {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        return NextResponse.json({ error: `Não foi possível acessar essa URL (status ${res.status})` }, { status: 502 });
      }
      html = await res.text();
    } catch {
      return NextResponse.json({ error: "Não foi possível acessar essa URL" }, { status: 502 });
    }

    const dom = new JSDOM(html, { url: parsedUrl.toString() });
    const article = new Readability(dom.window.document).parse();

    const textContent = article?.textContent ?? "";
    if (!article || !article.content || textContent.trim().length < MIN_CONTENT_LENGTH) {
      return NextResponse.json({ error: "Não foi possível extrair o conteúdo deste site." }, { status: 422 });
    }

    const resolvedHtml = resolveRelativeUrls(article.content, parsedUrl.toString());
    const turndownService = new TurndownService({ headingStyle: "atx" });
    const markdown = turndownService.turndown(resolvedHtml);

    // Sem H1 — o título exibido em qualquer lugar do app vem sempre do nome do
    // arquivo, nunca do corpo (mesma convenção do resto do app). "fonte:" segue
    // o padrão de linha de metadado já usado por aliases:/status:.
    const content = `fonte: ${parsedUrl.toString()}\n\n${markdown}`;

    const rawTitle = article.title?.trim() || parsedUrl.hostname;
    const baseSlug = sanitizeFilename(rawTitle).slice(0, MAX_TITLE_LENGTH).trim() || "artigo importado";
    const filename = findAvailableFilename(baseSlug, (f) => existsSync(path.join(vault.path, f)));

    const filePath = path.join(vault.path, filename);
    writeFileSync(filePath, content, "utf-8");

    ensureIndexFresh(vaultId);
    const mtimeMs = statSync(filePath).mtimeMs;
    reindexNote(vaultId, filename, content, mtimeMs);

    return NextResponse.json({ filename });
  } catch (error) {
    return NextResponse.json({ error: "Não foi possível importar o artigo", details: String(error) }, { status: 500 });
  }
}
