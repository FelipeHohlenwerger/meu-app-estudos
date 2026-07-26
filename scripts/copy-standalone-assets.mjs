// Copia pra dentro de .next/standalone/ o que `output: "standalone"` NÃO
// copia sozinho (limitação documentada do Next.js): os assets estáticos
// (.next/static), a pasta public/ e o .env.local (o server.js standalone é
// chamado direto via `node`, sem passar pela CLI `next`, então não carrega
// .env.local do mesmo jeito que `next dev`/`next start` fazem — ver
// --env-file no spawn do sidecar, em src-tauri/src/lib.rs).
import { cpSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd(); // rodar a partir de frontend/
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error("`.next/standalone` não existe — rode `next build` primeiro.");
  process.exit(1);
}

cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });

if (existsSync(path.join(root, "public"))) {
  cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
}

const envLocal = path.join(root, ".env.local");
if (existsSync(envLocal)) {
  cpSync(envLocal, path.join(standalone, ".env.local"));
} else {
  console.warn("Aviso: .env.local ausente — GEMINI_API_KEY não estará disponível no app empacotado.");
}

console.log("Assets copiados para .next/standalone/.");
