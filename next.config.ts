import type { NextConfig } from "next";

// "standalone" só muda o que `next build` gera ADICIONALMENTE (uma pasta
// .next/standalone/ com um server.js autocontido) — não afeta `next dev` nem
// um `next start` comum contra o build normal. Usado pelo empacotamento
// desktop (Tauri sidecar, ver frontend/src-tauri/) para rodar o servidor sem
// depender da CLI `next` nem do node_modules completo.
const nextConfig: NextConfig = {
  output: "standalone",
  // Algumas rotas fazem `readdirSync`/`readFileSync` com um caminho de vault
  // (fora do projeto, ex: ~/vaults/nome) que só existe em runtime — o
  // rastreador de arquivos do build (NFT) não consegue provar que isso fica
  // restrito a essa pasta e, por segurança, inclui o repositório INTEIRO em
  // .next/standalone (docs .md, .data/ com os índices SQLite reais,
  // src-tauri/ com o binário Node de ~120MB copiado nele). Sem isso, o pacote
  // desktop ficaria inchado e vazaria dados do cache local. Nenhum desses
  // caminhos é necessário em runtime pro servidor standalone funcionar.
  outputFileTracingExcludes: {
    "*": ["src-tauri/**", "dist-placeholder/**", ".data/**", "*.md", "scripts/**"],
  },
};

export default nextConfig;
