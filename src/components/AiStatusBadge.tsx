"use client";

type Props = {
  x: number;
  y: number;
  state: "loading" | "error";
  message?: string;
};

// Substitui o HighlightMenu assim que uma ação de IA é disparada — o menu já
// não existe mais nesse momento, então não tem como clicar duas vezes na
// mesma ação por engano.
export default function AiStatusBadge({ x, y, state, message }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        background: "var(--panel-bg)",
        border: `1px solid ${state === "error" ? "#d04444" : "var(--panel-border)"}`,
        borderRadius: "6px",
        padding: "0.5rem 0.75rem",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        zIndex: 1000,
        fontSize: "12px",
        color: state === "error" ? "#d04444" : "var(--foreground)",
        maxWidth: "260px",
      }}
    >
      {state === "loading" ? "✨ Gerando com IA..." : (message ?? "Erro ao gerar com IA")}
    </div>
  );
}
