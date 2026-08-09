import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "fs";
import path from "path";
import { extractLinkTargets, findBlockMarkers } from "@/lib/wikiLinkSyntax";
import { getVaultById } from "@/lib/vaultRegistry";
import { contentTypeFor, defaultStatusFor, statusOrderFor, type ContentType } from "@/lib/noteStatus";
import { IMAGE_REGEX } from "@/lib/imageSyntax";

// Versão do schema/parser. Bump isso sempre que mudar algo que precise reprocessar
// notas já indexadas (ex: quando extractAliases/extractTitle passaram a existir de
// verdade) — a migração força um reprocessamento completo quando a versão sobe.
const SCHEMA_VERSION = 14;

// Caminho da pasta de UM vault, resolvido pelo registro — nunca mais uma
// constante fixa (ver src/lib/vaultRegistry.ts). Lança se o id não existir no
// registro; quem chama (rotas de API) já validou isso antes via getVaultById,
// então isso só dispara em uso indevido interno.
function getVaultPath(vaultId: string): string {
  const entry = getVaultById(vaultId);
  if (!entry) throw new Error(`Vault não encontrado: ${vaultId}`);
  return entry.path;
}

// Aliases declarados no topo do arquivo: "aliases: nome 1, nome 2".
const ALIASES_LINE_REGEX = /^aliases:\s*(.+)$/im;
const ALIASES_SCAN_LINES = 10;

function extractAliases(content: string): string[] {
  const topLines = content.split("\n").slice(0, ALIASES_SCAN_LINES).join("\n");
  const match = topLines.match(ALIASES_LINE_REGEX);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
}

function stripMdExtension(filename: string): string {
  return filename.replace(/\.(md|pdf|epub)$/i, "");
}

// Fonte de um artigo importado da web: linha "fonte: <url>" no topo do
// arquivo, mesmo padrão de `aliases:`. Usado só pra decidir o vocabulário de
// status certo (ver contentTypeFor em noteStatus.ts) — uma nota .md com essa
// linha é tratada como "livro", não como nota comum.
const FONTE_LINE_REGEX = /^fonte:\s*(.+)$/im;

function extractFonte(content: string): string | null {
  const topLines = content.split("\n").slice(0, ALIASES_SCAN_LINES).join("\n");
  const match = topLines.match(FONTE_LINE_REGEX);
  return match ? match[1].trim() : null;
}

// Resumo de uma linha: primeira linha de texto "de verdade" do corpo (pula o H1 se
// for a primeira linha, e as linhas de metadado aliases:/status:/fonte: — essa
// última é a URL original de um artigo importado da web), com a sintaxe
// customizada do app reduzida ao texto visível, cortado em ~80 caracteres.
const SUMMARY_MAX_LENGTH = 80;

function cleanSummaryLine(line: string): string {
  return line
    // Sintaxe interna de imagem (![alt](caminho)§size:...§shape:...§align:...
    // §wrap:...) nunca deve virar "texto" do resumo — some inteira daqui,
    // não vira alt text (diferente do wikilink logo abaixo, que vira o
    // título). Uma linha que é SÓ a imagem some por completo, e o loop em
    // extractSummary já pula linha vazia — vai pra próxima linha com texto
    // real sozinho, sem lógica extra.
    .replace(IMAGE_REGEX, "")
    .replace(/==(.+?)==§\w+(?::sub)?/g, "$1")
    .replace(/~(.+?)~¶\w+\{[^}]*\}/g, "$1")
    .replace(/!?\[\[([^\]]+)\]\]/g, (_m, inner: string) => inner.split("#^")[0].trim())
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .trim();
}

function extractSummary(content: string): string {
  const lines = content.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#\s+/.test(line)) continue; // heading (H1 ou qualquer nível)
    if (/^aliases:/i.test(line) || /^status:/i.test(line) || /^fonte:/i.test(line)) continue;
    if (/^>/.test(line)) continue; // callout

    const cleaned = cleanSummaryLine(line);
    if (!cleaned) continue;
    return cleaned.length > SUMMARY_MAX_LENGTH
      ? cleaned.slice(0, SUMMARY_MAX_LENGTH).trim() + "…"
      : cleaned;
  }
  return "";
}

function countWords(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}

// Uma conexão SQLite por vault — nunca compartilhada entre vaults (isolamento
// total: buscas/tags/Graph View/backlinks de um vault nunca vazam pra outro).
const dbByVault = new Map<string, DatabaseSync>();

function migrate(conn: DatabaseSync): void {
  const versionRow = conn.prepare("PRAGMA user_version").get() as { user_version: number };
  if (versionRow.user_version >= SCHEMA_VERSION) return;

  const columns = conn.prepare("PRAGMA table_info(notes)").all() as { name: string }[];
  const hasColumn = (name: string) => columns.some((c) => c.name === name);
  if (!hasColumn("title")) {
    conn.exec("ALTER TABLE notes ADD COLUMN title TEXT");
  }
  if (!hasColumn("status")) {
    conn.exec("ALTER TABLE notes ADD COLUMN status TEXT");
  }
  if (!hasColumn("summary")) {
    conn.exec("ALTER TABLE notes ADD COLUMN summary TEXT");
  }
  if (!hasColumn("word_count")) {
    conn.exec("ALTER TABLE notes ADD COLUMN word_count INTEGER");
  }
  if (!hasColumn("fonte")) {
    conn.exec("ALTER TABLE notes ADD COLUMN fonte TEXT");
  }
  if (!hasColumn("last_activity_ms")) {
    conn.exec("ALTER TABLE notes ADD COLUMN last_activity_ms INTEGER");
  }
  if (!hasColumn("is_favorite")) {
    conn.exec("ALTER TABLE notes ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0");
  }
  conn.exec("CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title)");
  conn.exec("CREATE INDEX IF NOT EXISTS idx_aliases_alias ON aliases(alias)");

  if (versionRow.user_version < 7) {
    // A partir da v7, tags deixam de ser derivadas de "#palavra" no corpo do texto
    // e passam a vir só do campo dedicado (PUT /api/note/tags) — as tags antigas,
    // extraídas do texto, ficam órfãs de propósito (o usuário pediu explicitamente
    // que não fossem migradas automaticamente).
    conn.exec("DELETE FROM tags");
  }

  if (versionRow.user_version < 8) {
    // A partir da v8, marcação colorida por trecho deixa de existir em
    // PDF/EPUB (só nas notas .md) — a tabela `annotations` fica sem uso,
    // removida por completo (nunca mais é escrita, e o usuário pediu remoção
    // completa da funcionalidade, não só da interface).
    conn.exec("DROP TABLE IF EXISTS annotations");
  }

  if (versionRow.user_version < 9) {
    // A partir da v9, o painel de comentários das notas .md fica unificado:
    // comentários ancorados (~texto~¶tipo{comentário}¶id, dentro do próprio
    // arquivo) passam a também ter uma linha em book_comments — só pra
    // rastrear ordem de criação junto com os gerais (o `id`, AUTOINCREMENT, já
    // reflete isso sozinho) e permitir apagar; tipo/comentário desses
    // continuam vindo do texto, não são duplicados aqui.
    const bcColumns = conn.prepare("PRAGMA table_info(book_comments)").all() as { name: string }[];
    if (!bcColumns.some((c) => c.name === "anchored")) {
      conn.exec("ALTER TABLE book_comments ADD COLUMN anchored INTEGER NOT NULL DEFAULT 0");
    }
  }

  if (versionRow.user_version < 10) {
    // A partir da v10, comentários ancorados de EPUB (gerados pelas ações de
    // IA — resumir/explicar/perguntas, ver aiActions.ts) passam a ser
    // "auto-contidos": diferente do placeholder ancorado de .md (cujo
    // tipo/comentário de verdade vive no texto), o EPUB não tem arquivo de
    // texto editável pra guardar isso, então tipo/comentário/âncora vêm
    // direto dessas 2 colunas novas. anchor_cfi preenchido é o que distingue
    // uma linha "auto-contida" (EPUB) de um placeholder puro (.md, sempre
    // NULL aqui) — não precisou de outra flag nova.
    const bcColumns = conn.prepare("PRAGMA table_info(book_comments)").all() as { name: string }[];
    if (!bcColumns.some((c) => c.name === "anchor_cfi")) {
      conn.exec("ALTER TABLE book_comments ADD COLUMN anchor_cfi TEXT");
    }
    if (!bcColumns.some((c) => c.name === "anchor_text")) {
      conn.exec("ALTER TABLE book_comments ADD COLUMN anchor_text TEXT");
    }
  }

  if (versionRow.user_version < 11) {
    // A partir da v11, o vocabulário de status muda pra dois conjuntos por
    // tipo de conteúdo (ver noteStatus.ts) — os valores antigos (do
    // vocabulário genérico "nao_iniciado/lendo/revisado/dominado") deixam de
    // fazer sentido pra qualquer nota. Zera a coluna: getLibraryData() e
    // getNoteStatusInfo() já tratam `status` NULL calculando o status-padrão
    // certo pro contentType da nota, então cada uma recupera um status válido
    // já na próxima leitura, sem precisar reprocessar o arquivo.
    conn.exec("UPDATE notes SET status = NULL");
  }

  if (versionRow.user_version < 12) {
    // A partir da v12, "última atividade" (usada pela seção "Editados
    // recentemente" da Homepage) passa a ser rastreada em last_activity_ms —
    // horário de parede observado pelo app (touchActivity(), ver save de
    // nota/comentário/status), não mtime de arquivo (congelado desde a
    // importação pra PDF/EPUB, já que o app nunca reescreve esses bytes).
    // Semeia a partir do mtime_ms atual (ainda intacto nesse ponto, antes do
    // reset incondicional abaixo) — dá uma ordenação inicial útil pras notas
    // .md; livros ficam agrupados na data de importação até a primeira
    // atividade de verdade (comentário/status) neles.
    conn.exec("UPDATE notes SET last_activity_ms = mtime_ms WHERE last_activity_ms IS NULL");
  }

  // Força reprocessar toda a vault na próxima ensureIndexFresh() — título, aliases,
  // blocos endereçáveis e (a partir da v4) status/resumo/contagem de palavras só
  // passam a existir/ser detectados a partir dessas versões do schema.
  conn.exec("UPDATE notes SET mtime_ms = -1");

  conn.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

// Pasta do índice de UM vault. Fixo em ~/.study-app/index/ (mesma raiz do
// registro de vaults, vaultRegistry.ts) — de propósito NÃO relativo a
// process.cwd(): tags e status vivem só aqui (não são deriváveis do conteúdo
// do arquivo desde a v7/v11 do schema), então se esse caminho mudasse
// conforme o servidor é executado (modo web a partir da raiz do repo,
// sidecar desktop rodando de uma cópia em ~/.local/share/.../standalone) cada
// modo divergiria silenciosamente nas tags/status da MESMA vault. Fixando
// aqui, os dois modos sempre enxergam o mesmo índice.
function indexDirFor(vaultId: string): string {
  return path.join(process.env.HOME || "", ".study-app", "index", vaultId);
}

function getDb(vaultId: string): DatabaseSync {
  const cached = dbByVault.get(vaultId);
  if (cached) return cached;

  const dbDir = indexDirFor(vaultId);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = path.join(dbDir, "vault-index.sqlite");

  const conn = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });

  conn.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      mtime_ms REAL NOT NULL,
      title TEXT
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      tag TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tags_note ON tags(note_id);
    CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);

    CREATE TABLE IF NOT EXISTS aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      alias TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      target_raw TEXT NOT NULL COLLATE NOCASE,
      target_note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
      UNIQUE(source_note_id, target_raw)
    );
    CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_note_id);
    CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_note_id);

    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      block_id TEXT NOT NULL COLLATE NOCASE,
      text TEXT NOT NULL,
      UNIQUE(note_id, block_id)
    );
    CREATE INDEX IF NOT EXISTS idx_blocks_note ON blocks(note_id);

    -- Comentários gerais sobre um PDF/EPUB (não ancorados a nenhum trecho de
    -- texto — não existe mais marcação por cor em PDF/EPUB, só nas notas .md)
    -- — nunca no arquivo original, que não é tocado. "tipo" é a mesma
    -- taxonomia de 6 tipos usada pelos callouts (ver calloutColors em
    -- src/lib/colors.ts).
    CREATE TABLE IF NOT EXISTS book_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      comment TEXT NOT NULL,
      anchored INTEGER NOT NULL DEFAULT 0,
      anchor_cfi TEXT,
      anchor_text TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_book_comments_note ON book_comments(note_id);
  `);

  migrate(conn);

  dbByVault.set(vaultId, conn);
  return conn;
}

// Resolve um "target_raw" (texto dentro de [[...]]) pro id da nota correspondente,
// checando nome de arquivo (com ".md" OU exatamente como escrito — o que cobre
// "[[livro]]" apontando pro arquivo "livro.pdf"/"livro.epub"), depois título,
// depois alias — nessa ordem de prioridade. Colisões entre essas coisas são
// aceitas silenciosamente (vault pessoal).
function resolveTargetNoteId(conn: DatabaseSync, targetRaw: string): number | null {
  const row = conn
    .prepare(
      `SELECT id FROM (
         SELECT id, 1 AS prio FROM notes WHERE filename = ? COLLATE NOCASE
         UNION ALL
         SELECT id, 1 AS prio FROM notes WHERE filename = ? COLLATE NOCASE
         UNION ALL
         SELECT id, 2 AS prio FROM notes WHERE title = ? COLLATE NOCASE
         UNION ALL
         SELECT note_id AS id, 3 AS prio FROM aliases WHERE alias = ? COLLATE NOCASE
       ) ORDER BY prio, id LIMIT 1`
    )
    .get(`${targetRaw}.md`, targetRaw, targetRaw, targetRaw) as { id: number } | undefined;
  return row ? row.id : null;
}

// Recalcula target_note_id de TODOS os links. Necessário porque mudar o título ou
// os aliases de uma nota pode fazer links de QUALQUER outra nota passarem a resolver
// (ou deixarem de resolver) pra ela — não é algo que se resolva só olhando pra uma
// direção (nota que mudou -> links que já apontavam pra ela).
function reresolveAllLinks(conn: DatabaseSync): void {
  const rows = conn.prepare("SELECT id, target_raw FROM links").all() as { id: number; target_raw: string }[];
  const update = conn.prepare("UPDATE links SET target_note_id = ? WHERE id = ?");
  for (const row of rows) {
    update.run(resolveTargetNoteId(conn, row.target_raw), row.id);
  }
}

// Reprocessa links/aliases/título de UMA nota (upsert). Usado tanto pela
// reconciliação completa quanto pelo POST /api/note — mesma implementação para as
// duas entradas. Para .pdf/.epub (binários, nunca lidos como texto), quem chama
// sempre passa `content: ""` — todo o parsing abaixo naturalmente não encontra
// nada num texto vazio, então a nota só fica com título/mtime, sem precisar de
// um branch por extensão aqui.
function reindexNote(vaultId: string, filename: string, content: string, mtimeMs: number): void {
  const conn = getDb(vaultId);
  const noteNameNoExt = stripMdExtension(filename);
  // Título é sempre o nome do arquivo — nunca um "# Heading" do corpo. O nome do
  // arquivo é a identidade da nota (usado em [[links]], na sidebar, etc.); deixar
  // um H1 do corpo sobrescrever isso causava o título exibido "descolar" do nome
  // real do arquivo (e de qualquer link atualizado por um rename).
  const title = noteNameNoExt;
  const fonte = extractFonte(content);
  const contentType = contentTypeFor(filename, fonte);
  // Status só entra no INSERT (nota nova) — de propósito NUNCA atualizado no
  // conflito, pra não apagar um status já setado pelo usuário via PUT
  // /api/note/status quando a nota é salva de novo (mesmo motivo pelo qual
  // tags não são tocadas aqui, ver comentário abaixo).
  const defaultStatus = defaultStatusFor(contentType);
  const summary = extractSummary(content);
  const wordCount = countWords(content);

  conn.exec("BEGIN");
  try {
    conn
      .prepare(
        `INSERT INTO notes (filename, mtime_ms, title, status, summary, word_count, fonte, last_activity_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(filename) DO UPDATE SET
           mtime_ms = excluded.mtime_ms,
           title = excluded.title,
           summary = excluded.summary,
           word_count = excluded.word_count,
           fonte = excluded.fonte`
      )
      // last_activity_ms, igual a status: só entra no INSERT (semeia com o
      // mtimeMs recebido — "quando essa nota/livro foi visto pela primeira
      // vez"), NUNCA atualizado no conflito. Se fosse atualizado aqui, uma
      // reconciliação passiva (disparada por qualquer migração futura via
      // `UPDATE notes SET mtime_ms = -1`, ou por alguém externo tocando o
      // arquivo) reescalonaria a atividade de notas que ninguém realmente
      // tocou. Atividade de verdade é sempre um touchActivity() explícito
      // (save real, comentário, mudança de status — ver chamadas abaixo).
      .run(filename, mtimeMs, title, defaultStatus, summary, wordCount, fonte, mtimeMs);

    const noteRow = conn.prepare("SELECT id FROM notes WHERE filename = ?").get(filename) as { id: number };
    const noteId = noteRow.id;

    // Tags NÃO são tocadas aqui — desde a v7 do schema, tags vêm só do campo
    // dedicado (setNoteTags via PUT /api/note/tags), nunca do corpo do texto.
    conn.prepare("DELETE FROM links WHERE source_note_id = ?").run(noteId);
    conn.prepare("DELETE FROM aliases WHERE note_id = ?").run(noteId);
    conn.prepare("DELETE FROM blocks WHERE note_id = ?").run(noteId);

    const insertAlias = conn.prepare("INSERT INTO aliases (note_id, alias) VALUES (?, ?)");
    for (const alias of extractAliases(content)) {
      insertAlias.run(noteId, alias);
    }

    const insertLink = conn.prepare(
      "INSERT INTO links (source_note_id, target_raw, target_note_id) VALUES (?, ?, NULL)"
    );
    for (const target of extractLinkTargets(content)) {
      insertLink.run(noteId, target);
    }

    const insertBlock = conn.prepare(
      "INSERT INTO blocks (note_id, block_id, text) VALUES (?, ?, ?) ON CONFLICT(note_id, block_id) DO UPDATE SET text = excluded.text"
    );
    for (const marker of findBlockMarkers(content)) {
      insertBlock.run(noteId, marker.blockId, marker.text);
    }

    reresolveAllLinks(conn);

    conn.exec("COMMIT");
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}

function runFullReconciliation(vaultId: string): void {
  const conn = getDb(vaultId);
  const vaultPath = getVaultPath(vaultId);

  let filesOnDisk: string[];
  try {
    filesOnDisk = readdirSync(vaultPath).filter((f) => /\.(md|pdf|epub)$/i.test(f));
  } catch {
    return; // vault ainda não existe; nada a indexar
  }

  const existingRows = conn.prepare("SELECT filename, mtime_ms FROM notes").all() as {
    filename: string;
    mtime_ms: number;
  }[];
  const existingByFilename = new Map(existingRows.map((r) => [r.filename, r.mtime_ms]));
  const onDiskSet = new Set(filesOnDisk);

  const deleteNote = conn.prepare("DELETE FROM notes WHERE filename = ?");
  for (const filename of existingByFilename.keys()) {
    if (!onDiskSet.has(filename)) {
      deleteNote.run(filename);
    }
  }

  for (const filename of filesOnDisk) {
    const filePath = path.join(vaultPath, filename);
    const stat = statSync(filePath);
    const storedMtime = existingByFilename.get(filename);
    if (storedMtime === undefined || storedMtime !== stat.mtimeMs) {
      // .pdf/.epub são binários — nunca lidos como texto; só entram no índice
      // com o título derivado do nome do arquivo (ver reindexNote).
      const content = /\.md$/i.test(filename) ? readFileSync(filePath, "utf-8") : "";
      reindexNote(vaultId, filename, content, stat.mtimeMs);
    }
  }
}

const lastScanByVault = new Map<string, number>();

// Garante que o índice reflete o estado da vault. Na primeira chamada do processo
// PRA CADA vault, sempre varre a vault inteira. Chamadas seguintes só re-varrem se
// `forceMaxAgeMs` for passado e esse tempo já tiver passado desde o último scan
// desse vault (usado pelo painel de Tags, pra pegar edições feitas fora do app sem
// precisar reiniciar o servidor).
export function ensureIndexFresh(vaultId: string, opts: { forceMaxAgeMs?: number } = {}): void {
  const now = Date.now();
  const lastScanAt = lastScanByVault.get(vaultId) ?? null;
  if (lastScanAt !== null) {
    if (opts.forceMaxAgeMs === undefined || now - lastScanAt < opts.forceMaxAgeMs) {
      return;
    }
  }
  runFullReconciliation(vaultId);
  lastScanByVault.set(vaultId, now);
}

export { reindexNote };

// Marca "atividade agora" numa nota — usado pela seção "Editados
// recentemente" da Homepage. Chamado só nos pontos de atividade de verdade
// (save real de .md, criar/apagar comentário, mudar status) — nunca pela
// reconciliação passiva (ver comentário em reindexNote sobre por que
// last_activity_ms fica de fora do ON CONFLICT DO UPDATE de lá).
export function touchActivity(vaultId: string, filename: string): void {
  const conn = getDb(vaultId);
  conn.prepare("UPDATE notes SET last_activity_ms = ? WHERE filename = ? COLLATE NOCASE").run(Date.now(), filename);
}

// Fecha a conexão SQLite (se aberta) e apaga a pasta de índice inteira do
// vault — usado por DELETE /api/vaults ao remover um vault do registro.
// Nunca toca na pasta de notas original (isso é responsabilidade só de
// vaultRegistry.removeVault, que nem recebe o path). Fechar a conexão antes
// de apagar o arquivo evita mexer no .sqlite enquanto o node:sqlite ainda tem
// um handle aberto pra ele. Também limpa lastScanByVault: se a mesma pasta
// for registrada de novo depois (possivelmente reaproveitando o mesmo id,
// caso o nome dado seja idêntico), ensureIndexFresh precisa rodar uma
// reconciliação completa de novo no índice recriado do zero, não pular por
// achar que já escaneou esse vaultId recentemente.
export function deleteVaultIndex(vaultId: string): void {
  const conn = dbByVault.get(vaultId);
  if (conn) {
    conn.close();
    dbByVault.delete(vaultId);
  }
  lastScanByVault.delete(vaultId);
  const dbDir = indexDirFor(vaultId);
  if (existsSync(dbDir)) {
    rmSync(dbDir, { recursive: true, force: true });
  }
}

export function getTagCounts(vaultId: string): [string, number][] {
  const conn = getDb(vaultId);
  const rows = conn
    .prepare("SELECT tag, COUNT(DISTINCT note_id) as c FROM tags GROUP BY tag ORDER BY c DESC")
    .all() as { tag: string; c: number }[];
  return rows.map((r) => [r.tag, r.c]);
}

export function getUntaggedCount(vaultId: string): number {
  const conn = getDb(vaultId);
  const row = conn
    .prepare("SELECT COUNT(*) as c FROM notes WHERE id NOT IN (SELECT DISTINCT note_id FROM tags)")
    .get() as { c: number };
  return row.c;
}

// Tags de UMA nota, na ordem em que foram adicionadas — usado por GET /api/note
// pra alimentar o TagField ao carregar a nota.
export function getNoteTags(vaultId: string, filename: string): string[] {
  const conn = getDb(vaultId);
  const noteRow = conn.prepare("SELECT id FROM notes WHERE filename = ? COLLATE NOCASE").get(filename) as
    | { id: number }
    | undefined;
  if (!noteRow) return [];
  const rows = conn.prepare("SELECT tag FROM tags WHERE note_id = ? ORDER BY id ASC").all(noteRow.id) as {
    tag: string;
  }[];
  return rows.map((r) => r.tag);
}

// Substitui a lista inteira de tags de uma nota — único caminho de escrita da
// tabela `tags` desde que ela deixou de ser derivada do corpo do texto (v7).
export function setNoteTags(vaultId: string, filename: string, tags: string[]): void {
  const conn = getDb(vaultId);
  const noteRow = conn.prepare("SELECT id FROM notes WHERE filename = ? COLLATE NOCASE").get(filename) as
    | { id: number }
    | undefined;
  if (!noteRow) throw new Error(`Nota não encontrada no índice: ${filename}`);

  const uniqueTags = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));

  conn.exec("BEGIN");
  try {
    conn.prepare("DELETE FROM tags WHERE note_id = ?").run(noteRow.id);
    const insertTag = conn.prepare("INSERT INTO tags (note_id, tag) VALUES (?, ?)");
    for (const tag of uniqueTags) {
      insertTag.run(noteRow.id, tag);
    }
    conn.exec("COMMIT");
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}

// Status de estudo + tipo de conteúdo (livro/artigo vs. nota comum) + favorito
// de UMA nota — usado por GET /api/note pra alimentar o StatusDropdown/estrela
// ao carregar a nota (uma query só, já que os três vêm da mesma linha).
export function getNoteStatusInfo(
  vaultId: string,
  filename: string
): { status: string; contentType: ContentType; isFavorite: boolean } | null {
  const conn = getDb(vaultId);
  const row = conn.prepare("SELECT status, fonte, is_favorite FROM notes WHERE filename = ? COLLATE NOCASE").get(filename) as
    | { status: string | null; fonte: string | null; is_favorite: number }
    | undefined;
  if (!row) return null;
  const contentType = contentTypeFor(filename, row.fonte);
  return { status: row.status ?? defaultStatusFor(contentType), contentType, isFavorite: row.is_favorite === 1 };
}

// Muda o status de estudo de uma nota — único caminho de escrita da coluna
// `status` desde que ela deixou de ser derivada da linha "status:" do corpo
// do texto (mesma mudança de modelo que tags já passou, v7). Valida que o
// status pertence ao vocabulário certo pro tipo de conteúdo da nota.
export function setNoteStatus(vaultId: string, filename: string, status: string): void {
  const conn = getDb(vaultId);
  const row = conn.prepare("SELECT fonte FROM notes WHERE filename = ? COLLATE NOCASE").get(filename) as
    | { fonte: string | null }
    | undefined;
  if (!row) throw new Error(`Nota não encontrada no índice: ${filename}`);

  const contentType = contentTypeFor(filename, row.fonte);
  if (!statusOrderFor(contentType).includes(status)) {
    throw new Error(`Status inválido para este tipo de conteúdo: ${status}`);
  }

  conn.prepare("UPDATE notes SET status = ? WHERE filename = ? COLLATE NOCASE").run(status, filename);
  touchActivity(vaultId, filename);
}

// Marca/desmarca uma nota como favorita — não conta como "atividade" pra
// seção "Editados recentemente" (só save de conteúdo, comentário ou mudança
// de status contam, ver touchActivity), por isso não chama touchActivity.
export function setNoteFavorite(vaultId: string, filename: string, isFavorite: boolean): void {
  const conn = getDb(vaultId);
  conn.prepare("UPDATE notes SET is_favorite = ? WHERE filename = ? COLLATE NOCASE").run(isFavorite ? 1 : 0, filename);
}

export function getTagsByNote(vaultId: string): Record<string, string[]> {
  const conn = getDb(vaultId);
  const notesRows = conn.prepare("SELECT id, filename FROM notes").all() as { id: number; filename: string }[];
  const tagsRows = conn.prepare("SELECT note_id, tag FROM tags").all() as { note_id: number; tag: string }[];

  const tagsByNoteId = new Map<number, string[]>();
  for (const row of tagsRows) {
    const list = tagsByNoteId.get(row.note_id) ?? [];
    list.push(row.tag);
    tagsByNoteId.set(row.note_id, list);
  }

  const result: Record<string, string[]> = {};
  for (const note of notesRows) {
    result[note.filename] = tagsByNoteId.get(note.id) ?? [];
  }
  return result;
}

export type BookComment = {
  id: number;
  tipo: string;
  comment: string;
  anchored: boolean;
  // Só preenchidos pra comentários ancorados "auto-contidos" (EPUB, gerados
  // pelas ações de IA) — ver migração v10 acima.
  anchorCfi?: string | null;
  anchorText?: string | null;
};

// Comentários de UMA nota/livro — gerais (PDF/EPUB e, agora, .md — não
// ancorados a nenhum trecho de texto) e "ancorados" (só .md; a linha aqui só
// existe pra rastrear ordem de criação junto com os gerais e permitir
// apagar, o conteúdo de verdade vem do próprio texto — ver CREATE TABLE
// book_comments), na ordem de criação (mais antigo primeiro, mesma ordem que
// `id` já garante por ser AUTOINCREMENT, mesmo misturando os dois tipos).
export function getBookComments(vaultId: string, filename: string): BookComment[] {
  const conn = getDb(vaultId);
  const noteRow = conn.prepare("SELECT id FROM notes WHERE filename = ? COLLATE NOCASE").get(filename) as
    | { id: number }
    | undefined;
  if (!noteRow) return [];
  const rows = conn
    .prepare("SELECT id, tipo, comment, anchored, anchor_cfi, anchor_text FROM book_comments WHERE note_id = ? ORDER BY id ASC")
    .all(noteRow.id) as { id: number; tipo: string; comment: string; anchored: number; anchor_cfi: string | null; anchor_text: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    comment: r.comment,
    anchored: r.anchored === 1,
    anchorCfi: r.anchor_cfi,
    anchorText: r.anchor_text,
  }));
}

export function createBookComment(
  vaultId: string,
  filename: string,
  data: { tipo?: string; comment?: string; anchored?: boolean; anchorCfi?: string; anchorText?: string }
): BookComment {
  const conn = getDb(vaultId);
  const noteRow = conn.prepare("SELECT id FROM notes WHERE filename = ? COLLATE NOCASE").get(filename) as
    | { id: number }
    | undefined;
  if (!noteRow) throw new Error(`Nota não encontrada no índice: ${filename}`);

  const anchored = data.anchored ? 1 : 0;
  const tipo = data.tipo ?? "";
  const comment = data.comment ?? "";
  const anchorCfi = data.anchorCfi ?? null;
  const anchorText = data.anchorText ?? null;
  const result = conn
    .prepare("INSERT INTO book_comments (note_id, tipo, comment, anchored, anchor_cfi, anchor_text) VALUES (?, ?, ?, ?, ?, ?)")
    .run(noteRow.id, tipo, comment, anchored, anchorCfi, anchorText);
  touchActivity(vaultId, filename);

  return { id: Number(result.lastInsertRowid), tipo, comment, anchored: !!data.anchored, anchorCfi, anchorText };
}

export function deleteBookComment(vaultId: string, id: number): void {
  const conn = getDb(vaultId);
  // Sem `filename` disponível aqui (só o id do comentário) — resolve o
  // note_id direto pra tocar last_activity_ms antes de apagar a linha.
  conn
    .prepare("UPDATE notes SET last_activity_ms = ? WHERE id = (SELECT note_id FROM book_comments WHERE id = ?)")
    .run(Date.now(), id);
  conn.prepare("DELETE FROM book_comments WHERE id = ?").run(id);
}

export type LibraryNote = {
  filename: string;
  title: string;
  tags: string[];
  status: string;
  contentType: ContentType;
  summary: string;
  wordCount: number;
  // Horário de parede (ms) da última atividade observada pelo app (save,
  // comentário, mudança de status) — ver touchActivity(). Usado pela seção
  // "Editados recentemente" da Homepage.
  lastActivityMs: number;
  isFavorite: boolean;
};

// Dados pra tela inicial "biblioteca": uma linha por nota, já com tags/status/
// resumo/contagem de palavras — tudo lido do índice, nunca reprocessando arquivos.
export function getLibraryData(vaultId: string): LibraryNote[] {
  const conn = getDb(vaultId);
  const notesRows = conn
    .prepare("SELECT id, filename, title, status, summary, word_count, fonte, last_activity_ms, is_favorite FROM notes ORDER BY filename")
    .all() as {
    id: number;
    filename: string;
    title: string | null;
    status: string | null;
    summary: string | null;
    word_count: number | null;
    fonte: string | null;
    last_activity_ms: number | null;
    is_favorite: number;
  }[];
  const tagsRows = conn.prepare("SELECT note_id, tag FROM tags").all() as { note_id: number; tag: string }[];

  const tagsByNoteId = new Map<number, string[]>();
  for (const row of tagsRows) {
    const list = tagsByNoteId.get(row.note_id) ?? [];
    list.push(row.tag);
    tagsByNoteId.set(row.note_id, list);
  }

  return notesRows.map((n) => {
    const contentType = contentTypeFor(n.filename, n.fonte);
    return {
      filename: n.filename,
      title: n.title ?? stripMdExtension(n.filename),
      tags: tagsByNoteId.get(n.id) ?? [],
      status: n.status ?? defaultStatusFor(contentType),
      contentType,
      summary: n.summary ?? "",
      wordCount: n.word_count ?? 0,
      lastActivityMs: n.last_activity_ms ?? 0,
      isFavorite: n.is_favorite === 1,
    };
  });
}

// Notas que linkam PRA a nota `filename` (backlinks).
export function getBacklinks(vaultId: string, filename: string): string[] {
  const conn = getDb(vaultId);
  const rows = conn
    .prepare(
      `SELECT DISTINCT n.filename AS filename FROM links l
       JOIN notes n ON n.id = l.source_note_id
       JOIN notes t ON t.id = l.target_note_id
       WHERE t.filename = ? COLLATE NOCASE
       ORDER BY n.filename`
    )
    .all(filename) as { filename: string }[];
  return rows.map((r) => r.filename);
}

// Notas que a nota `filename` linka (sentido inverso de getBacklinks) — usado
// pelo escopo "+ Relacionadas" do chat com IA (ver /api/note/related).
export function getOutgoingLinks(vaultId: string, filename: string): string[] {
  const conn = getDb(vaultId);
  const rows = conn
    .prepare(
      `SELECT DISTINCT t.filename AS filename FROM links l
       JOIN notes n ON n.id = l.source_note_id
       JOIN notes t ON t.id = l.target_note_id
       WHERE n.filename = ? COLLATE NOCASE
       ORDER BY t.filename`
    )
    .all(filename) as { filename: string }[];
  return rows.map((r) => r.filename);
}

// Renomeia uma nota no índice (mantém o mesmo id, então tags/aliases/links/blocks
// continuam associados via FK). Quem chama ainda precisa rodar reindexNote() em
// seguida pra recomputar título (o fallback muda) e reresolver todos os links.
export function renameNoteInIndex(vaultId: string, oldFilename: string, newFilename: string): void {
  const conn = getDb(vaultId);
  conn.prepare("UPDATE notes SET filename = ? WHERE filename = ? COLLATE NOCASE").run(newFilename, oldFilename);
}

// Remove uma nota do índice (tags/aliases/links/blocks somem junto via ON DELETE
// CASCADE). Quem chama já apagou o arquivo do disco antes.
export function removeNoteFromIndex(vaultId: string, filename: string): void {
  const conn = getDb(vaultId);
  conn.prepare("DELETE FROM notes WHERE filename = ? COLLATE NOCASE").run(filename);
}

export function getNoteMeta(vaultId: string, filename: string): { title: string; aliases: string[] } | null {
  const conn = getDb(vaultId);
  const noteRow = conn.prepare("SELECT id, title FROM notes WHERE filename = ? COLLATE NOCASE").get(filename) as
    | { id: number; title: string | null }
    | undefined;
  if (!noteRow) return null;

  const aliasRows = conn.prepare("SELECT alias FROM aliases WHERE note_id = ?").all(noteRow.id) as {
    alias: string;
  }[];
  return { title: noteRow.title ?? stripMdExtension(filename), aliases: aliasRows.map((r) => r.alias) };
}

// Nome de arquivo, título e aliases de TODAS as notas — usado pelo autocomplete de
// "[[" e pra classificar links válidos/quebrados no editor.
export function getAllNoteTargets(vaultId: string): { filename: string; title: string; aliases: string[] }[] {
  const conn = getDb(vaultId);
  const notesRows = conn.prepare("SELECT id, filename, title FROM notes ORDER BY filename").all() as {
    id: number;
    filename: string;
    title: string | null;
  }[];
  const aliasRows = conn.prepare("SELECT note_id, alias FROM aliases").all() as {
    note_id: number;
    alias: string;
  }[];

  const aliasesByNoteId = new Map<number, string[]>();
  for (const row of aliasRows) {
    const list = aliasesByNoteId.get(row.note_id) ?? [];
    list.push(row.alias);
    aliasesByNoteId.set(row.note_id, list);
  }

  return notesRows.map((n) => ({
    filename: n.filename,
    title: n.title ?? stripMdExtension(n.filename),
    aliases: aliasesByNoteId.get(n.id) ?? [],
  }));
}

export type BlockRefResolution = {
  noteRaw: string;
  blockId: string;
  noteExists: boolean;
  noteFilename: string | null;
  noteTitle: string | null;
  blockFound: boolean;
  text: string | null;
};

// Resolve uma lista de referências de bloco ("nota#^id"), uma por uma: primeiro
// acha a nota (mesma prioridade filename > título > alias de resolveTargetNoteId),
// depois busca o bloco pelo block_id dentro dela.
export function resolveBlockRefs(vaultId: string, refs: { noteRaw: string; blockId: string }[]): BlockRefResolution[] {
  const conn = getDb(vaultId);
  return refs.map(({ noteRaw, blockId }) => {
    const noteId = resolveTargetNoteId(conn, noteRaw);
    if (noteId === null) {
      return { noteRaw, blockId, noteExists: false, noteFilename: null, noteTitle: null, blockFound: false, text: null };
    }

    const noteRow = conn.prepare("SELECT filename, title FROM notes WHERE id = ?").get(noteId) as {
      filename: string;
      title: string | null;
    };
    const blockRow = conn
      .prepare("SELECT text FROM blocks WHERE note_id = ? AND block_id = ? COLLATE NOCASE")
      .get(noteId, blockId) as { text: string } | undefined;

    return {
      noteRaw,
      blockId,
      noteExists: true,
      noteFilename: noteRow.filename,
      noteTitle: noteRow.title ?? stripMdExtension(noteRow.filename),
      blockFound: Boolean(blockRow),
      text: blockRow?.text ?? null,
    };
  });
}

export type GraphNode = { filename: string; title: string; tag: string | null };
export type GraphEdge = { source: string; target: string };

// Metadado de nó pro grafo: filename/título/tag principal (primeira tag
// adicionada à nota pelo campo dedicado — os ids da tabela `tags` preservam
// essa ordem de inserção).
function getGraphNodeMeta(conn: DatabaseSync): { id: number; filename: string; title: string; tag: string | null }[] {
  const rows = conn
    .prepare(
      `SELECT n.id, n.filename, n.title,
              (SELECT tag FROM tags WHERE note_id = n.id ORDER BY id ASC LIMIT 1) AS tag
       FROM notes n`
    )
    .all() as { id: number; filename: string; title: string | null; tag: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    title: r.title ?? stripMdExtension(r.filename),
    tag: r.tag,
  }));
}

function dedupedResolvedLinks(conn: DatabaseSync): { source_note_id: number; target_note_id: number }[] {
  return conn
    .prepare("SELECT source_note_id, target_note_id FROM links WHERE target_note_id IS NOT NULL")
    .all() as { source_note_id: number; target_note_id: number }[];
}

// Grafo do vault inteiro: todas as notas (mesmo sem tag/link) + todos os links resolvidos.
export function getGlobalGraph(vaultId: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const conn = getDb(vaultId);
  const nodeMeta = getGraphNodeMeta(conn);
  const nodes: GraphNode[] = nodeMeta.map((n) => ({ filename: n.filename, title: n.title, tag: n.tag }));
  const byId = new Map(nodeMeta.map((n) => [n.id, n.filename]));

  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const row of dedupedResolvedLinks(conn)) {
    const source = byId.get(row.source_note_id);
    const target = byId.get(row.target_note_id);
    if (!source || !target || source === target) continue;
    const key = [source, target].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ source, target });
  }

  return { nodes, edges };
}

// Grafo local: a nota `filename` + vizinhos até `maxDepth` graus de distância,
// tratando os links como não-direcionados (uma "conexão", não importa quem
// escreveu o "[[...]]").
export function getLocalGraph(vaultId: string, filename: string, maxDepth = 2): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const conn = getDb(vaultId);
  const nodeMeta = getGraphNodeMeta(conn);
  const byFilename = new Map(nodeMeta.map((n) => [n.filename.toLowerCase(), n]));
  const centerNode = byFilename.get(filename.toLowerCase());
  if (!centerNode) {
    return { nodes: [], edges: [] };
  }

  const byId = new Map(nodeMeta.map((n) => [n.id, n]));
  const linkRows = dedupedResolvedLinks(conn);

  const adjacency = new Map<number, Set<number>>();
  for (const row of linkRows) {
    if (row.source_note_id === row.target_note_id) continue;
    if (!adjacency.has(row.source_note_id)) adjacency.set(row.source_note_id, new Set());
    if (!adjacency.has(row.target_note_id)) adjacency.set(row.target_note_id, new Set());
    adjacency.get(row.source_note_id)!.add(row.target_note_id);
    adjacency.get(row.target_note_id)!.add(row.source_note_id);
  }

  const visited = new Set<number>([centerNode.id]);
  let frontier = [centerNode.id];
  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const next: number[] = [];
    for (const id of frontier) {
      for (const neighborId of adjacency.get(id) ?? []) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          next.push(neighborId);
        }
      }
    }
    frontier = next;
  }

  const nodes: GraphNode[] = [];
  for (const id of visited) {
    const meta = byId.get(id);
    if (meta) nodes.push({ filename: meta.filename, title: meta.title, tag: meta.tag });
  }

  const seenEdges = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const row of linkRows) {
    if (!visited.has(row.source_note_id) || !visited.has(row.target_note_id)) continue;
    const source = byId.get(row.source_note_id)?.filename;
    const target = byId.get(row.target_note_id)?.filename;
    if (!source || !target || source === target) continue;
    const key = [source, target].sort().join("|");
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    edges.push({ source, target });
  }

  return { nodes, edges };
}
