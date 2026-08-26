// Copia assets de runtime do pdfjs-dist pra public/ (servidos como arquivos
// estáticos simples) em vez de depender de resolução de asset pelo bundler
// (`new URL("pdfjs-dist/...", import.meta.url)`, que dependeria do
// Turbopack/dev e do bundler de `next build`/prod reconhecerem o mesmo
// padrão vindo de um path aninhado de pacote terceiro) ou de CDN (o app é
// local-first/offline por princípio — ver a mesma razão na migração de
// tradução pro MTranServer self-hosted, CLAUDE.md). Copiar do mesmo
// node_modules/pdfjs-dist que o código principal importa também garante que
// main-thread/worker/wasm nunca divirjam de versão (pdf.js lança erro em
// runtime se divergirem). Rodado via "postinstall" e prefixado em "build" —
// ver package.json.
//
// Dois grupos de assets:
// 1. O worker (pdf.worker.min.mjs) — já existia.
// 2. A pasta wasm/ inteira (jbig2.wasm, openjpeg.wasm, qcms_bg.wasm,
//    quickjs-eval.wasm + os fallbacks *_nowasm_fallback.js) — pdfjs-dist 6.x
//    moveu os codecs binários (JBIG2, OpenJPEG/JPX, gerenciamento de cor
//    ICC) pra módulos WASM separados, carregados sob demanda via a opção
//    `wasmUrl` de `getDocument()` (ver PdfViewer.tsx). Sem essa pasta
//    presente e sem `wasmUrl` configurado, TODA imagem JBIG2 (comum em PDF
//    escaneado/OCR'd, ex: ocrmypdf) falha silenciosamente a decodificar —
//    bug real encontrado ao investigar avisos "Dependent image isn't ready
//    yet" persistentes em PDFs específicos: a causa não era o PDF, era essa
//    configuração ausente (afetava TODO PDF com imagem JBIG2/JPX, não só os
//    2 arquivos usados pra reproduzir).
import { cpSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const pdfjsDir = path.join(root, "node_modules", "pdfjs-dist");
const destDir = path.join(root, "public");

if (!existsSync(pdfjsDir)) {
  console.error(`pdfjs-dist não encontrado em ${pdfjsDir} — instalado?`);
  process.exit(1);
}

if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}

const workerSrc = path.join(pdfjsDir, "build", "pdf.worker.min.mjs");
copyFileSync(workerSrc, path.join(destDir, "pdf.worker.min.mjs"));

const wasmSrcDir = path.join(pdfjsDir, "wasm");
const wasmDestDir = path.join(destDir, "pdfjs-wasm");
cpSync(wasmSrcDir, wasmDestDir, { recursive: true });

console.log("Assets do pdfjs-dist copiados pra public/ (worker + pdfjs-wasm/)");
