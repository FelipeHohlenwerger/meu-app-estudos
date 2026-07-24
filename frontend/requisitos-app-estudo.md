# Documento de Requisitos — App Pessoal de Estudo e Anotação

> Versão 1.0 — consolidado a partir de anamnese de requisitos.
> Objetivo: ferramenta pessoal, local-first, que substitui o Obsidian agregando funcionalidades de IA, leitura de PDF/EPUB e fichamento ativo que o Obsidian não tem nativamente.

---

## 1. Visão geral

Ferramenta pessoal de estudo e organização de conhecimento, inspirada em:
- **Obsidian**: arquivos Markdown locais, organização por categorias e links bidirecionais, Graph View.
- **Editor "Charlie"** (referência em vídeo): ações de IA inline (explicar/resumir/expandir), dashboard de progresso de leitura, geração de mapa mental a partir de texto.
- **Fichamento acadêmico ativo**: sistema de marcação por cor com significado fixo, tipos de comentário estruturados, exportação rastreável.

**Princípio fundador:** os dados são sempre do usuário, em texto puro (`.md`), armazenados localmente, sincronizáveis por ferramentas externas (Syncthing) — nunca presos a um banco de dados proprietário.

---

## 2. Fases do projeto

| Fase | Escopo | Status |
|---|---|---|
| **Fase 1 (atual)** | App local (Linux), sem servidor, sem multi-dispositivo via rede | A construir |
| **Fase 2** | Acesso remoto (servidor pessoal próprio + Tailscale) | Futuro, não detalhado ainda |
| **Fase 3** | Mapa mental gerado por IA, refinamentos | Futuro, secundário |

Esta versão do documento cobre apenas a **Fase 1**.

---

## 3. Armazenamento de dados

### 3.1 Decisão: Opção A+ (arquivos como fonte da verdade)

- Cada nota é um arquivo `.md` em uma pasta local (vault, no mesmo espírito do Obsidian).
- Metadados (categoria, tags, cor de highlights, comentários, anotações de margem) ficam em **front-matter YAML** no topo do arquivo e/ou em blocos estruturados dentro do texto.
- Um **índice SQLite local** é mantido como cache reconstruível (nunca fonte da verdade) — usado só para busca rápida e montagem do grafo sem reler todos os arquivos a cada ação. Pode ser apagado e recriado a qualquer momento a partir dos `.md`.
- Sincronização multi-dispositivo (fase 2 ou paralela): Syncthing, exatamente como já usado hoje pelo usuário com Obsidian.

### 3.2 PDFs e EPUBs

- **PDF digital (texto selecionável):** extração de texto → vira documento Markdown editável dentro do app.
- **EPUB:** extração de texto (mais simples que PDF, pois o formato já é HTML/XML estruturado internamente) → também vira Markdown editável.
- **PDF escaneado (imagem, sem texto selecionável):** não passa por extração de texto. O arquivo PDF original é preservado e anotado por cima (ver seção 5).

---

## 4. Editor de texto

### 4.1 Decisão: Live Preview (estilo Obsidian), não WYSIWYG

- Fonte de dados: **sempre Markdown puro em texto plano**. Nunca uma árvore de documento proprietária (diferente de editores WYSIWYG como Notion/TipTap).
- Experiência visual: enquanto o cursor não está sobre uma sintaxe (ex: `**negrito**`), ela é renderizada visualmente formatada; ao posicionar o cursor sobre o trecho, a sintaxe bruta aparece para edição.
- Base técnica recomendada: **CodeMirror 6** com decorações de sintaxe customizadas (mesma tecnologia usada pelo Obsidian).
- Trade-off aceito: maior complexidade de implementação inicial, em troca de uma experiência já validada e familiar ao usuário, sem necessidade de retrabalho futuro.

### 4.2 Ações de IA sobre texto selecionado

Ao selecionar um trecho no editor, exibir menu contextual com (mínimo viável):
- **Resumir** — condensa o trecho selecionado.
- **Explicar/Expandir** — desenvolve conceito pouco familiar ao usuário.

(Fora do MVP inicial, mas previstas: geração de perguntas de revisão, reescrita/melhoria de texto próprio.)

Implementação: chamada à API da Anthropic (Claude) com o trecho selecionado como contexto.

---

## 5. Sistema de marcação e anotação (núcleo do fichamento ativo)

### 5.1 Highlights coloridos (cor = tipo, fixo)

Cada highlight tem exatamente **uma cor**, e cada cor corresponde a um tipo semântico fixo:

| Tipo | Função | Cor sugerida |
|---|---|---|
| Conceito-chave | Definição importante, candidata a nota própria | Amarelo |
| Crítica/Discordância | Discorda do autor ou identifica problema no argumento | Vermelho |
| Citação | Trecho para uso literal futuro (com referência) | Verde |
| Dúvida | Algo não compreendido, retomar depois | (a definir) |
| Conexão | Remete a outra nota/autor/ideia — pode gerar link `[[nota]]` | (a definir) |
| Síntese pessoal | Reformulação própria do trecho | (a definir) |
| Ação futura | Tarefa decorrente da leitura (pesquisar X, perguntar Y) | (a definir) |

> Paleta de cores final e nomes/quantidade de tipos ainda ajustáveis pelo usuário — esta tabela é o ponto de partida, não definitivo.

### 5.2 Comentários tipados (opcionais, ligados a um highlight)

- Cada highlight pode opcionalmente ter **um comentário** do mesmo tipo semântico associado.
- Estrutura: `1 highlight → 1 cor/tipo → 0 ou 1 comentário`.

### 5.3 Callouts (voz própria do usuário)

- Bloco de texto **novo**, inserido no fluxo do documento, escrito pelo próprio usuário em suas palavras (não é destaque de texto existente).
- Equivalente conceitual aos admonitions do Obsidian (`> [!note]`), mas com tipagem própria do sistema se desejado.
- Disponível em: **Markdown e PDF extraído**. Não se aplica a PDF escaneado.

### 5.4 Anotações de margem (forma + texto)

- Elementos visuais (retângulo, círculo/oval, seta) posicionados **na lateral/margem** do texto — não sobrepostos ao conteúdo fluido, evitando problemas de reflow.
- Cada forma pode ter texto associado.
- Disponível em: **Markdown, PDF extraído e PDF escaneado** (neste último, como alternativa ao desenho direto sobre a página).

### 5.5 Desenho livre sobre a página (exclusivo de PDF escaneado)

- Sobre a imagem da página (posição fixa, sem reflow), permite desenhar formas livres (retângulo, círculo, seta) diretamente por cima do conteúdo.
- Tecnicamente: camada de anotação com coordenadas (x, y, largura, altura) associadas ao número da página.

### 5.6 Exportações

- **Exportar marcações por cor**: gerar lista/documento filtrado por tipo de highlight.
- **Exportar comentários**: gerar lista/documento dos comentários, por tipo.
- **Criar nova nota a partir do que está marcado**: gera um novo documento Markdown contendo os trechos marcados, com link de rastreabilidade para a nota/documento de origem.

---

## 6. Organização e navegação do conhecimento

- **Categorias**: agrupamento temático das notas (equivalente às pastas/listas do exemplo em vídeo: "História Econômica", "Filosofia e Teologia").
- **Linkagem bidirecional**: sintaxe `[[nome da nota]]`, no mesmo padrão do Obsidian.
- **Graph View**: visualização do grafo de conexões entre notas, construída a partir do índice (seção 3.1) sem necessidade de reprocessar todos os arquivos a cada renderização.

---

## 7. Dashboard

- Tela inicial com cards por categoria, exibindo: capa/imagem, título, descrição curta, progresso de leitura, tempo estimado, contadores (anotações, destaques).
- Botões de criação rápida: novo texto, adicionar PDF/EPUB.

---

## 8. Stack técnica proposta (Fase 1, ambiente local)

| Camada | Tecnologia | Observação |
|---|---|---|
| Sistema operacional de desenvolvimento | Linux Manjaro | já disponível |
| Editor de código | VS Code | já disponível |
| Linguagem principal do app | Node.js (JavaScript/TypeScript) | a instalar |
| Framework de interface | Next.js + React | |
| Editor de texto | CodeMirror 6 (modo Live Preview customizado) | peça de maior complexidade técnica do projeto |
| Extração de PDF | `pdf.js` (frontend) ou bibliotecas Python (`PyMuPDF`/`pdfplumber`) | Python já disponível no ambiente |
| Extração de EPUB | bibliotecas Python para EPUB (estrutura HTML/XML interna) | |
| Anotação sobre imagem (PDF escaneado) | Canvas/SVG com camada de coordenadas | |
| Visualização de grafo | React Flow ou biblioteca de grafo dedicada | |
| Índice de busca/grafo | SQLite local (cache reconstruível) | nunca fonte da verdade |
| IA (explicar/resumir/expandir) | API da Anthropic (Claude) | chave de API própria do usuário |
| Sincronização multi-dispositivo | Syncthing (já em uso pelo usuário) | aponta para a pasta de arquivos `.md` |

---

## 9. Fora do escopo da Fase 1 (decisões já tomadas, revisitar depois)

- Mapa mental gerado automaticamente por IA a partir do texto — **secundário**, não MVP.
- Hospedagem remota / acesso fora da rede local (servidor próprio + Tailscale) — **Fase 2**.
- OCR de PDFs escaneados — não mencionado como necessidade explícita; a anotação sobre PDF escaneado parte da imagem da página, não exige texto extraído.
- Importação de conteúdo existente do Obsidian — não aplicável, usuário não possui vault anterior.

---

## 10. Riscos e decisões conscientes já assumidas

- **CodeMirror 6 / Live Preview** é reconhecidamente a parte de maior complexidade de implementação do projeto — decisão tomada cientemente em troca de manter a experiência de edição já validada pelo usuário no Obsidian.
- **Edição concorrente de arquivos** (ex: dois dispositivos editando a mesma nota antes de sincronizar) pode gerar conflitos — mesmo risco já presente no uso atual do Obsidian + Syncthing, não é uma regressão introduzida pelo novo app.
- **Índice SQLite** deve ser tratado sempre como derivado/descartável; qualquer lógica que dependa dele deve ter caminho de reconstrução a partir dos arquivos `.md`.

---

## 11. Próximos passos sugeridos

1. Configurar ambiente (Node.js no Manjaro, estrutura inicial do projeto Next.js).
2. Construir o editor Markdown básico (sem Live Preview ainda) lendo/escrevendo um arquivo `.md` local — validar o ciclo fundamental de dados.
3. Introduzir CodeMirror 6 e evoluir para Live Preview.
4. Implementar sistema de highlights coloridos (cor = tipo) sobre o editor.
5. Implementar comentários tipados ligados a highlights.
6. Implementar callouts (bloco de voz própria).
7. Implementar categorias, links `[[nota]]` e índice SQLite básico.
8. Implementar Graph View.
9. Implementar dashboard de biblioteca/progresso.
10. Implementar extração de PDF/EPUB → Markdown editável.
11. Implementar anotação de margem (forma + texto) — Markdown/PDF extraído.
12. Implementar visualizador de PDF escaneado com anotação por cima (desenho livre + margem).
13. Implementar ações de IA (resumir/explicar) via API Anthropic.
14. Implementar exportações (por cor, por comentário, criar nota a partir de marcações).

> A ordem acima prioriza ter, o mais rápido possível, "editor + organização funcionando" — conforme priorizado na anamnese — antes de avançar para PDF, IA e recursos avançados de anotação.
