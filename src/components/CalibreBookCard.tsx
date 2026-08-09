"use client";

import type { CalibreBook } from "@/lib/calibreLibrary";

function BookIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  );
}

type Props = { book: CalibreBook; onClick: () => void };

// Card de livro do Calibre — mesmo desenho de faixa 16:10 do NoteCard
// redesenhado, mas sem estrela/menu/preview de texto (nada disso existe pra
// um livro do Calibre: sem favorito próprio, sem "..." de renomear/excluir,
// sem resumo de corpo) — campos disponíveis (capa/título/autor) são bem
// diferentes de LibraryNote, por isso um componente dedicado em vez de
// forçar o mesmo NoteCard a aceitar as duas formas.
export default function CalibreBookCard({ book, onClick }: Props) {
  const coverUrl = book.hasCover ? `/api/calibre/cover/${book.id}` : null;
  return (
    <div
      onClick={onClick}
      className="note-card"
      style={{
        border: "1px solid var(--panel-border)",
        borderRadius: "var(--radius)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          // 2:3 — proporção comum de capa de livro (diferente da faixa 16:10
          // usada pra notas/artigos em NoteCard.tsx, que não são capas de
          // livro de verdade). object-fit:cover corta a imagem real (que
          // quase sempre chega com proporção própria, diferente entre
          // capas) pra preencher essa moldura sem distorcer — sem isso, cada
          // card ficava com a altura da imagem ORIGINAL, produzindo uma
          // grade com alturas inconsistentes.
          aspectRatio: "2 / 3",
          flexShrink: 0,
          position: "relative",
          overflow: "hidden",
          background: "var(--panel-hover)",
          color: "var(--text-muted)",
        }}
      >
        {coverUrl ? (
          // <img> precisa ser absolute (nunca height:100% no fluxo normal)
          // — dentro de um item cujo tamanho vem de aspect-ratio, um filho
          // com height:100% no fluxo cria uma dependência circular que faz
          // o browser IGNORAR o aspect-ratio e usar a altura intrínseca da
          // imagem (bug real encontrado: cada capa com sua própria altura,
          // produzindo a grade desalinhada do relato original).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BookIcon />
          </div>
        )}
      </div>
      {/* Corpo com altura reservada por construção (mesmo princípio do
          NoteCard.tsx redesenhado): título sempre até 2 linhas (minHeight
          cobre até quando é 1 linha só) e a linha de autor sempre RESERVADA
          (mesmo sem autor nenhum) — sem isso, um livro sem autor cadastrado
          tinha o corpo mais curto que os outros, produzindo card mais baixo
          na mesma grade. */}
      <div style={{ padding: "0.75rem 1rem" }}>
        <div
          style={{
            fontWeight: "bold",
            lineHeight: 1.3,
            minHeight: "2.6em",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {book.title}
        </div>
        <div
          style={{
            marginTop: "0.25rem",
            fontSize: "0.8rem",
            color: "var(--text-muted)",
            minHeight: "1.2em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {book.authors.join(", ")}
        </div>
      </div>
    </div>
  );
}
