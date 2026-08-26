import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Empacotamento desktop (Tauri) — target/ tem código Rust compilado e
    // até uma cópia do build standalone do Next dentro dele; nada disso é
    // código-fonte nosso.
    "src-tauri/target/**",
    "dist-placeholder/**",
    // Worker + assets wasm do pdfjs-dist, copiados de node_modules pra
    // public/ em tempo de build (scripts/copy-pdfjs-assets.mjs) — vendor
    // minificado/gerado, não código nosso.
    "public/pdf.worker.min.mjs",
    "public/pdfjs-wasm/**",
  ]),
]);

export default eslintConfig;
