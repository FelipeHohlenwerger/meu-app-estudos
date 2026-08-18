# Study App

Ferramenta pessoal de estudo e anotação, local-first: um editor de Markdown com modo "Live Preview" (parecido com o Obsidian), pensado para leitura ativa — grifos coloridos, comentários tipados e callouts sobre o texto, sem sair do Markdown puro por baixo. Todo o conteúdo é salvo como arquivos `.md` comuns num diretório local (um "vault"), sem banco de dados na nuvem e sem dependência de servidor externo — você é dono dos seus próprios arquivos o tempo todo.

Além de notas de texto, o app funciona como leitor de PDF e EPUB (com grifos e comentários também funcionando sobre esses formatos), e tem integração opcional com IA (Gemini) para resumir, explicar ou responder perguntas sobre o conteúdo de uma nota. Suporta múltiplos "vaults" (coleções de notas independentes, cada uma podendo representar uma matéria, projeto ou área de estudo diferente).

O projeto roda tanto como aplicação web local (`npm run dev`, acessada pelo navegador) quanto como aplicativo desktop nativo para Linux (empacotado com Tauri), usando exatamente o mesmo código nos dois casos.

## Funcionalidades principais

- **Editor Live Preview**: Markdown que renderiza formatação (negrito, itálico, títulos, listas, checkboxes) ao vivo, sem esconder a edição — clicar/focar num trecho revela a sintaxe crua pra editar.
- **Grifos e sublinhados coloridos**, com tipos semânticos (conceito, dúvida, referência, exemplo, ação, opinião do autor).
- **Comentários tipados** ancorados a um trecho do texto, com painel lateral unificado.
- **Callouts** (blocos de destaque tipo "nota"/"importante"/"dúvida"), incluindo callouts gerados automaticamente por ações de IA.
- **Blocos de código com destaque de sintaxe** (via Shiki) e **diagramas Mermaid** renderizados direto no editor.
- **Fonte do corpo do texto configurável** (5 opções) e tamanho de letra ajustável, com preferência global e por nota.
- **Tags e links bidirecionais** entre notas (wikilinks), com backlinks e menções não linkadas.
- **Graph View**: visualização em grafo das conexões entre notas.
- **Múltiplos vaults**: várias coleções de notas independentes, com troca rápida entre elas.
- **Status de estudo** (não iniciado/lendo/lido/revisando/revisado/abandonei para livros; rascunho/em desenvolvimento/finalizada para notas), com contadores na Homepage.
- **Leitor de PDF e EPUB** nativo, com grifos/comentários funcionando sobre o conteúdo importado.
- **Importação de artigos da web** (convertidos para Markdown editável) e anexos de imagem.
- **Chat com IA e ações de IA** (resumir, explicar, gerar perguntas) usando a API do Gemini.
- **Tradução automática** de trechos selecionados, num painel lateral que acompanha a seleção enquanto aberto (detecção de idioma automática, resultado em português) — sem configuração, sem chave de API.
- **Modo desktop nativo** (Linux/AppImage) além do modo web, sem duplicação de código.

## Pré-requisitos

### Modo web (obrigatório)

- **Node.js 22.5 ou mais recente** (`engines.node` do `package.json` exige `>=22.5.0`; testado com Node 24).
- **npm** (o projeto usa `package-lock.json`; outros gerenciadores devem funcionar mas não são o caminho testado).

### Modo desktop / Tauri (só se for gerar o AppImage ou rodar em modo dev do Tauri)

Testado num ambiente Arch/Manjaro Linux — os nomes de pacote abaixo são os do `pacman`; em distros baseadas em Debian/Ubuntu os pacotes equivalentes têm outros nomes (ver a [documentação oficial do Tauri](https://tauri.app/start/prerequisites/)).

- **Rust** (via [rustup](https://rustup.rs)) — testado com `rustc`/`cargo` 1.97.1.
- **Tauri CLI**: `cargo install tauri-cli --version "^2.0.0" --locked` (testado com `tauri-cli` 2.11.4).
- **Bibliotecas de sistema** (Arch/Manjaro):
  ```bash
  sudo pacman -S --needed webkit2gtk-4.1 base-devel librsvg libappindicator-gtk3 patchelf appmenu-gtk-module
  ```

## Instalação e execução (modo web)

```bash
# 1. Clonar o repositório
git clone https://github.com/FelipeHohlenwerger/meu-app-estudos.git
cd meu-app-estudos

# 2. Instalar as dependências
npm install

# 3. Configurar a chave da API do Gemini
cp .env.example .env.local
# edite .env.local e cole sua chave em GEMINI_API_KEY (ver seção abaixo)

# 4. Garantir que existe uma pasta de vault padrão (primeira execução)
mkdir -p ~/projetos/vault-notas

# 5. Rodar o servidor de desenvolvimento
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no navegador.

> Na primeira execução, o app registra automaticamente um vault chamado "Principal" apontando pra `~/projetos/vault-notas` — por isso o passo 4 acima. Depois disso, é possível criar quantos outros vaults quiser diretamente pela interface (cada um cria sua própria pasta em `~/vaults/`).

Outros comandos úteis:

```bash
npm run build   # build de produção
npm run start   # roda o build de produção
npm run lint    # eslint
```

## Instalação e execução (modo desktop / Tauri)

Com os pré-requisitos do Tauri (seção acima) instalados, a partir da raiz do repositório:

### Modo desenvolvimento (janela nativa, sem gerar AppImage)

```bash
cargo tauri dev
```

Isso sobe o `npm run dev` automaticamente por baixo e abre uma janela nativa apontando pra ele — não precisa rodar os dois separadamente.

### Gerar o AppImage

```bash
NO_STRIP=1 cargo tauri build --bundles appimage
```

> A variável `NO_STRIP=1` foi necessária no ambiente de desenvolvimento (Manjaro): o `strip` embutido na ferramenta de empacotamento (`linuxdeploy`) não reconhece uma seção ELF (`.relr.dyn`) presente em bibliotecas de sistema mais novas, e o build falha sem essa variável. Se seu build falhar com um erro de "Strip call failed", tente com `NO_STRIP=1`; caso contrário pode omitir.

O arquivo final aparece em:

```
src-tauri/target/release/bundle/appimage/Study App_<versão>_amd64.AppImage
```

O modo desktop reaproveita o mesmo Next.js do modo web, rodando como um processo auxiliar ("sidecar") na porta fixa `47821` — nenhuma rota de API é reescrita, é o mesmo código nos dois modos.

## Chave da API do Gemini

As funcionalidades de IA (chat, resumir, explicar, gerar perguntas) precisam de uma chave própria e gratuita do Google AI Studio:

1. Gere a sua em **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)** (tier gratuito).
2. Cole em `GEMINI_API_KEY` no seu `.env.local` (baseado no `.env.example`).

Sem essa chave, o resto do app funciona normalmente — só as funcionalidades de IA ficam indisponíveis.

## Estrutura do projeto

```
├── src/
│   ├── app/
│   │   ├── api/          # rotas da API (notas, vaults, tags, anexos, IA, importação, grafo...)
│   │   ├── page.tsx       # página principal: estado global, toolbar, sidebar, painéis de nota
│   │   └── layout.tsx     # layout raiz, fontes (next/font/google), tema
│   ├── components/        # componentes React (editor, menus, popups, modais, viewers de PDF/EPUB...)
│   └── lib/                # lógica não-React: parsing/decorações do CodeMirror (livePreview.ts),
│                            # paleta de cores central (colors.ts), registro de vaults, índice SQLite,
│                            # integração com Gemini, temas do Shiki, etc.
├── src-tauri/              # empacotamento desktop (Tauri): config, ícones, código Rust do sidecar
├── scripts/                 # scripts auxiliares de build (copy-standalone-assets.mjs)
└── public/                  # assets estáticos
```

## Licença

Distribuído sob a licença MIT — ver [`LICENSE`](LICENSE).
